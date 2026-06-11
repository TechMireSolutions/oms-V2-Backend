import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { AiProvider, DataClassification } from "@oms/dto";
import { LLM_PROVIDERS, type LlmProvider } from "./provider.interface";

/**
 * Routing policy (Strategy selection):
 *   - SENSITIVE classification  → a LOCAL provider ONLY (Ollama). Hard rule.
 *   - otherwise                 → preferred hosted provider if configured,
 *                                 else any configured provider, else local.
 */
@Injectable()
export class ProviderRouter {
  constructor(@Inject(LLM_PROVIDERS) private readonly providers: LlmProvider[]) {}

  select(classification: DataClassification, preferred?: AiProvider): LlmProvider {
    const configured = this.providers.filter((p) => p.isConfigured());

    if (classification === "SENSITIVE") {
      const local = configured.find((p) => p.isLocal);
      if (!local)
        throw new BadRequestException("Sensitive data requires a local LLM (Ollama) which is not configured");
      return local;
    }

    if (preferred) {
      const match = configured.find((p) => p.name === preferred);
      if (match) return match;
    }
    // Prefer a hosted provider for general tasks, fall back to local.
    return configured.find((p) => !p.isLocal) ?? configured.find((p) => p.isLocal)
      ?? (() => { throw new BadRequestException("No LLM provider is configured"); })();
  }
}
