import { Injectable } from "@nestjs/common";
import { loadEnv } from "@oms/config";
import type { AiProvider } from "@oms/dto";
import type { LlmProvider, LlmRequest, LlmDelta } from "./provider.interface";
import { readJsonLines } from "./sse-parse";

// LOCAL, self-hosted. The ONLY provider permitted for SENSITIVE-classified
// data (welfare / financial PII never leaves the VPS).
@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly name: AiProvider = "OLLAMA";
  readonly isLocal = true;
  private readonly env = loadEnv();

  isConfigured(): boolean { return !!this.env.OLLAMA_BASE_URL; }

  async *stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmDelta> {
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages
    ];
    const res = await fetch(`${this.env.OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: req.model || this.env.OLLAMA_MODEL,
        stream: true,
        options: { temperature: req.temperature ?? 0.2, num_predict: req.maxTokens ?? 1024 },
        messages
      })
    });
    if (!res.ok || !res.body) throw new Error(`Ollama error ${res.status}`);

    for await (const obj of readJsonLines(res.body) as AsyncIterable<any>) {
      if (obj.message?.content) yield { type: "text", text: obj.message.content };
      if (obj.done) {
        yield {
          type: "usage",
          inputTokens: obj.prompt_eval_count ?? 0,
          outputTokens: obj.eval_count ?? 0
        };
      }
    }
  }
}
