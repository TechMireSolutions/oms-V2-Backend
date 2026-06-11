import { Injectable } from "@nestjs/common";
import { loadEnv } from "@oms/config";
import type { AiProvider } from "@oms/dto";
import type { LlmProvider, LlmRequest, LlmDelta } from "./provider.interface";
import { readSseLines } from "./sse-parse";

// Hosted — non-sensitive data only.
@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name: AiProvider = "OPENAI";
  readonly isLocal = false;
  private readonly env = loadEnv();

  isConfigured(): boolean { return !!this.env.OPENAI_API_KEY; }

  async *stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmDelta> {
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      ...req.messages
    ];
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 1024,
        stream: true,
        stream_options: { include_usage: true },
        messages
      })
    });
    if (!res.ok || !res.body) throw new Error(`OpenAI error ${res.status}`);

    for await (const line of readSseLines(res.body)) {
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (json === "[DONE]") break;
      let evt: any;
      try { evt = JSON.parse(json); } catch { continue; }
      const delta = evt.choices?.[0]?.delta?.content;
      if (delta) yield { type: "text", text: delta };
      if (evt.usage)
        yield { type: "usage", inputTokens: evt.usage.prompt_tokens ?? 0, outputTokens: evt.usage.completion_tokens ?? 0 };
    }
  }
}
