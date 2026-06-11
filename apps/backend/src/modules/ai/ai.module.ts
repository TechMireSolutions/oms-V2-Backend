import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { AuditModule, AUDIT_CONTRACT, type AuditContract } from "../audit";
import { AI_CONTRACT } from "./contracts";
import { AUDIT_PORT, type AuditPort } from "./ports";
import { AiController } from "./controllers/ai.controller";
import { AiService } from "./services/ai.service";
import { RedactionService } from "./services/redaction.service";
import { PromptTemplateService } from "./services/prompt-template.service";
import { QuotaService } from "./services/quota.service";
import { aiRedisProvider } from "./services/redis.provider";
import { ProviderRouter } from "./providers/router.service";
import { LLM_PROVIDERS } from "./providers/provider.interface";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { OpenAiProvider } from "./providers/openai.provider";
import { OllamaProvider } from "./providers/ollama.provider";

@Module({
  imports: [IamModule, AuditModule],
  controllers: [AiController],
  providers: [
    {
      provide: AUDIT_PORT,
      inject: [AUDIT_CONTRACT],
      useFactory: (audit: AuditContract): AuditPort => ({ logEvent: (i) => audit.logEvent(i) })
    },
    aiRedisProvider,
    AnthropicProvider,
    OpenAiProvider,
    OllamaProvider,
    // Strategy registry — the router picks one per request by classification.
    {
      provide: LLM_PROVIDERS,
      inject: [AnthropicProvider, OpenAiProvider, OllamaProvider],
      useFactory: (a: AnthropicProvider, o: OpenAiProvider, l: OllamaProvider) => [a, o, l]
    },
    ProviderRouter,
    RedactionService,
    PromptTemplateService,
    QuotaService,
    AiService,
    { provide: AI_CONTRACT, useExisting: AiService }
    // AUDIT_PORT binds here once the Audit module is wired (@Optional() until then).
  ],
  exports: [AI_CONTRACT]
})
export class AiModule {}
