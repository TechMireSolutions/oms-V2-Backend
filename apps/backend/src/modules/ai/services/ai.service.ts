import { ForbiddenException, Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Decimal, getPrismaClient, type Prisma } from "@oms/db";
import type { AuthContext, AiQueryRequest, AiStreamChunk, AiQuotaView } from "@oms/dto";
import { IAM_CONTRACT, type IamContract } from "../../iam";
import { AI_PERMISSIONS, type AiContract } from "../contracts";
import { AUDIT_PORT, type AuditPort } from "../ports";
import { ProviderRouter } from "../providers/router.service";
import { RedactionService } from "./redaction.service";
import { PromptTemplateService } from "./prompt-template.service";
import { QuotaService } from "./quota.service";

const SYSTEM_GUARDRAIL =
  "You are an OMS decision-support assistant. You DRAFT summaries, answers, and " +
  "proposed definitions only. You must NEVER claim to have executed an action " +
  "(no posting journal entries, approving waivers, or changing roles). If asked " +
  "to perform an action, respond with a draft proposal for a human to review. " +
  "When proposing a form/report/policy, emit a single fenced ```json block.";

@Injectable()
export class AiService implements AiContract {
  private readonly prisma = getPrismaClient();

  constructor(
    @Inject(IAM_CONTRACT) private readonly iam: IamContract,
    private readonly router: ProviderRouter,
    private readonly redaction: RedactionService,
    private readonly templates: PromptTemplateService,
    private readonly quota: QuotaService,
    @Optional() @Inject(AUDIT_PORT) private readonly audit?: AuditPort
  ) {}

  async getQuota(ctx: AuthContext): Promise<AiQuotaView> {
    return this.quota.view(ctx);
  }

  async *query(ctx: AuthContext, input: AiQueryRequest, signal: AbortSignal): AsyncIterable<AiStreamChunk> {
    // 0) Permission + quota gates (before any provider work).
    if (!(await this.iam.checkPermission(ctx, AI_PERMISSIONS.query)))
      throw new ForbiddenException("Missing permission: ai.query");
    await this.quota.assertWithinQuota(ctx);

    // 1) Resolve prompt (template or free text).
    let rawPrompt: string;
    let templateKey: string | undefined;
    let providerHint = input.preferredProvider;
    let modelHint: string | undefined;
    if (input.templateKey) {
      const tpl = await this.templates.render(input.templateKey, input.variables);
      rawPrompt = tpl.rendered;
      templateKey = tpl.key;
      providerHint = providerHint ?? tpl.defaultProvider;
      modelHint = tpl.defaultModel ?? undefined;
    } else {
      rawPrompt = input.freeText!;
    }

    // 2) MANDATORY redaction + classification gate.
    const { redacted, classification } = this.redaction.redact(rawPrompt);

    // 3) Strategy selection — SENSITIVE forces local Ollama.
    const provider = this.router.select(classification, providerHint);
    const model = modelHint ?? (provider.isLocal ? "" : this.defaultHostedModel(provider.name));

    yield {
      type: "meta", provider: provider.name, model: model || "(local-default)",
      classification, redactedPreview: redacted.slice(0, 280)
    };

    // 4) Stream from the provider, accumulating text + usage.
    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for await (const delta of provider.stream(
        {
          model,
          system: SYSTEM_GUARDRAIL,
          messages: [{ role: "user", content: redacted }],
          maxTokens: 1500,
          temperature: 0.2
        },
        signal
      )) {
        if (delta.type === "text") {
          fullText += delta.text;
          yield { type: "delta", text: delta.text };
        } else if (delta.type === "usage") {
          inputTokens = delta.inputTokens;
          outputTokens = delta.outputTokens;
          yield { type: "usage", inputTokens, outputTokens };
        }
      }
    } catch (err) {
      yield { type: "error", message: (err as Error).message };
      return;
    }

    // 5) Meter usage + durably log (redacted/hashed only).
    const totalTokens = inputTokens + outputTokens;
    await this.quota.record(ctx, totalTokens || this.estimateTokens(redacted, fullText));
    const requestId = await this.logRequest(ctx, {
      templateKey, provider: provider.name, model: model || "ollama-default",
      classification, redacted, fullText, inputTokens, outputTokens, outputKind: input.outputKind
    });
    await this.audit?.logEvent({
      actorId: ctx.userId, action: "ai.query", entityType: "AiRequestLog", entityId: requestId,
      context: { provider: provider.name, classification, tokens: totalTokens }
    });

    // 6) Terminal chunk — extract any DRAFT proposal. It is NEVER applied here;
    //    humanActionRequired is always true (human-in-the-loop).
    const proposal = this.extractProposal(fullText);
    yield { type: "done", requestId, proposal, humanActionRequired: true };
  }

  // ── helpers ───────────────────────────────────────────────────────────
  private defaultHostedModel(provider: string): string {
    if (provider === "ANTHROPIC") return "claude-opus-4-8";
    if (provider === "OPENAI") return "gpt-4o";
    return "";
  }

  private estimateTokens(prompt: string, completion: string): number {
    return Math.ceil((prompt.length + completion.length) / 4); // ~4 chars/token fallback
  }

  /** Pull a single fenced ```json block, if present, as a structured draft. */
  private extractProposal(text: string): unknown {
    const m = text.match(/```json\s*([\s\S]*?)```/i);
    if (!m) return null;
    try { return { kind: "form_definition", summary: "AI draft (requires human review)", payload: JSON.parse(m[1]!) }; }
    catch { return null; }
  }

  private async logRequest(ctx: AuthContext, d: {
    templateKey?: string; provider: string; model: string; classification: string;
    redacted: string; fullText: string; inputTokens: number; outputTokens: number; outputKind: string;
  }): Promise<string> {
    const row = await this.prisma.aiRequestLog.create({
      data: {
        actorId: ctx.userId,
        roleSnapshot: ctx.roles.join(","),
        templateKey: d.templateKey,
        provider: d.provider as any,
        model: d.model,
        classification: d.classification as any,
        promptHash: this.sha(d.redacted),
        promptRedacted: d.redacted.slice(0, 4000),
        responseHash: this.sha(d.fullText),
        inputTokens: d.inputTokens,
        outputTokens: d.outputTokens,
        estimatedCost: new Decimal(this.cost(d.provider, d.inputTokens, d.outputTokens)) as unknown as Prisma.Decimal,
        outputKind: d.outputKind
      }
    });
    return row.id;
  }

  private sha(s: string): string { return createHash("sha256").update(s).digest("hex"); }

  // Rough cost model (USD); local Ollama is free.
  private cost(provider: string, inTok: number, outTok: number): number {
    if (provider === "OLLAMA") return 0;
    const rates: Record<string, [number, number]> = {
      ANTHROPIC: [3 / 1_000_000, 15 / 1_000_000],
      OPENAI: [2.5 / 1_000_000, 10 / 1_000_000]
    };
    const [ri, ro] = rates[provider] ?? [0, 0];
    return inTok * ri + outTok * ro;
  }
}
