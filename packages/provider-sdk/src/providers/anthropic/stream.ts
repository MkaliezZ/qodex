import type { ModelChunk } from "../../types/chunk.js";

interface AnthropicSSEEvent {
  type: string;
  delta?: { type: string; text?: string };
  usage?: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

export async function* parseAnthropicSSE(body: ReadableStream<Uint8Array> | null): AsyncIterable<AnthropicSSEEvent> {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";
      let eventData = "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event: ")) {
          eventType = trimmed.slice(7).trim();
        } else if (trimmed.startsWith("data: ")) {
          eventData = trimmed.slice(6).trim();
        } else if (trimmed === "" && eventData) {
          try {
            const data = JSON.parse(eventData);
            const event: AnthropicSSEEvent = { type: eventType || "unknown" };
            if (data.type === "content_block_delta" && data.delta) {
              event.delta = data.delta;
            }
            if (eventType === "message_stop" || eventType === "message_delta") {
              if (data.usage) event.usage = data.usage;
            }
            if (eventType === "error") {
              event.error = data.error;
            }
            yield event;
          } catch {
            // skip unparseable events
          }
          eventType = "";
          eventData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function mapSSEToChunks(event: AnthropicSSEEvent, model: string): ModelChunk | null {
  if (event.error) {
    throw Object.assign(new Error(event.error.message || "Stream error"), { type: "stream_error" });
  }
  if (event.delta?.text) {
    return { type: "text", text: event.delta.text, model };
  }
  if (event.usage) {
    return { type: "usage", usage: { inputTokens: event.usage.input_tokens, outputTokens: event.usage.output_tokens }, model };
  }
  return null;
}
