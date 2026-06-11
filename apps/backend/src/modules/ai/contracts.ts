// AI / LLM Assistant — public contract surface.
// NOTE (human-in-the-loop): nothing in this contract executes a business
// action. The assistant only DRAFTS (summaries, answers, proposed definitions);
// a human must review and act via the owning module's contract.
import type { AuthContext, AiQueryRequest, AiStreamChunk, AiQuotaView } from "@oms/dto";

export const AI_CONTRACT = Symbol("AI_CONTRACT");

export interface AiContract {
  // Streams redacted, governed, metered model output as structured chunks.
  query(ctx: AuthContext, input: AiQueryRequest, signal: AbortSignal): AsyncIterable<AiStreamChunk>;
  getQuota(ctx: AuthContext): Promise<AiQuotaView>;
}

export const AI_PERMISSIONS = {
  query:       "ai.query",
  queryFinance:"ai.query.finance",
  manage:      "ai.manage"      // keys, templates, provider selection (SuperAdmin)
} as const;
