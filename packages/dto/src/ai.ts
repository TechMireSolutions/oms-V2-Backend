import { z } from "zod";

export const AiProviderSchema = z.enum(["ANTHROPIC", "OPENAI", "GOOGLE", "OLLAMA"]);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const DataClassificationSchema = z.enum(["PUBLIC", "INTERNAL", "SENSITIVE"]);
export type DataClassification = z.infer<typeof DataClassificationSchema>;

// Inbound request from the SuperAdmin dashboard.
export const AiQueryRequestSchema = z.object({
  // Use a published template, or free text (still redacted + classified).
  templateKey: z.string().max(120).optional(),
  variables: z.record(z.string(), z.string()).default({}),
  freeText: z.string().max(20_000).optional(),
  // Caller's intent — what kind of DRAFT they want back. Never an action verb.
  outputKind: z.enum(["draft", "summary", "answer"]).default("answer"),
  // Optional explicit provider hint; ignored if classification forces local.
  preferredProvider: AiProviderSchema.optional()
}).refine((v) => v.templateKey || v.freeText, {
  message: "Provide either templateKey or freeText"
});
export type AiQueryRequest = z.infer<typeof AiQueryRequestSchema>;

// SSE chunk envelope streamed to the dashboard.
export const AiStreamChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meta"), provider: AiProviderSchema, model: z.string(), classification: DataClassificationSchema, redactedPreview: z.string() }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("usage"), inputTokens: z.number().int(), outputTokens: z.number().int() }),
  // Terminal chunk. `proposal` is a DRAFT only — the human must confirm/publish.
  z.object({ type: z.literal("done"), requestId: z.string().uuid(), proposal: z.unknown().nullable(), humanActionRequired: z.literal(true) }),
  z.object({ type: z.literal("error"), message: z.string() })
]);
export type AiStreamChunk = z.infer<typeof AiStreamChunkSchema>;

// Structured draft the LLM may emit (e.g. a form/report definition to be
// reviewed and published through the Customisation engine). Validated before
// it is ever surfaced — and it is NEVER auto-applied.
export const AiDraftProposalSchema = z.object({
  kind: z.enum(["form_definition", "report_definition", "policy_text", "none"]),
  summary: z.string(),
  payload: z.unknown().optional()
});
export type AiDraftProposal = z.infer<typeof AiDraftProposalSchema>;

export const AiQuotaViewSchema = z.object({
  roleCap: z.number().int(),
  roleUsed: z.number().int(),
  globalCap: z.number().int(),
  globalUsed: z.number().int(),
  periodMonth: z.string()
});
export type AiQuotaView = z.infer<typeof AiQuotaViewSchema>;
