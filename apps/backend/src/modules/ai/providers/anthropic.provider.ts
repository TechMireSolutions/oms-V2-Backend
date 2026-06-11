import { Injectable } from "@nestjs/common";
import { loadEnv } from "@oms/config";
import type { AiProvider } from "@oms/dto";
import type { LlmProvider, LlmRequest, LlmDelta } from "./provider.interface";
import { readSseLines } from "./sse-parse";

// Hosted — used ONLY for non-sensitive data (redaction pipeline enforces this).
@Injectable()
export class AnthropicProvider implements LlmProvider {
  readonly name: AiProvider = "ANTHROPIC";
  readonly isLocal = false;
  private readonly env = loadEnv();

  isConfigured(): boolean { return !!this.env.ANTHROPIC_API_KEY; }

  async *stream(req: LlmRequest, signal: AbortSignal): AsyncIterable<LlmDelta> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: req.model,
        system: req.system,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.2,
        stream: true,
        messages: req.messages.filter((m) => m.role !== "system")
      })
    });
    if (!res.ok || !res.body) throw new Error(`Anthropic error ${res.status}`);

    for await (const line of readSseLines(res.body)) {
      if (!line.startsWith("data:")) continue;
      const json = line.slice(5).trim();
      if (json === "[DONE]") break;
      let evt: any;
      try { evt = JSON.parse(json); } catch { continue; }
      if (evt.type === "content_block_delta" && evt.delta?.text)
        yield { type: "text", text: evt.delta.text };
      if (evt.type === "message_delta" && evt.usage)
        yield { type: "usage", inputTokens: evt.usage.input_tokens ?? 0, outputTokens: evt.usage.output_tokens ?? 0 };
    }
  }
}
