// Minimal SSE line reader for provider streaming responses (fetch + ReadableStream).
export async function* readSseLines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield line;
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}

// Read newline-delimited JSON (Ollama streams one JSON object per line).
export async function* readJsonLines(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  for await (const line of readSseLines(body)) {
    try { yield JSON.parse(line); } catch { /* skip partial */ }
  }
}
