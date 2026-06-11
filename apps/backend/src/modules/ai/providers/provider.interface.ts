import type { AiProvider } from "@oms/dto";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  model: string;
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
}

export type LlmDelta =
  | { type: "text"; text: string }
  | { type: "usage"; inputTokens: number; outputTokens: number };

/**
 * Strategy interface. Each concrete provider streams text deltas. `isLocal`
 * gates routing: SENSITIVE-classified requests may ONLY use a local provider.
 */
export interface LlmProvider {
  readonly name: AiProvider;
  readonly isLocal: boolean;
  isConfigured(): boolean;
  stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmDelta>;
}

export const LLM_PROVIDERS = Symbol("LLM_PROVIDERS");
