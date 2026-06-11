/**
 * Qodex Provider SDK — Utilities
 *
 * Shared helpers: HTTP client (thin fetch wrapper) and SSE parser.
 */

import { errorFromHttpStatus, errorFromException } from "../errors/index.js";
import type { ProviderError } from "../errors/index.js";

/** HTTP request options */
export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

/** Thin fetch wrapper with unified error handling */
export async function httpRequest(
  url: string,
  options: HttpOptions = {},
): Promise<Response> {
  const { method = "GET", headers = {}, body, signal } = options;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => undefined);
    throw errorFromHttpStatus(response.status, text);
  }

  return response;
}

/** Async generator that parses Server-Sent Events */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) break;

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }

  // Flush remaining buffer
  if (buffer.startsWith("data: ")) {
    const data = buffer.slice(6).trim();
    if (data !== "[DONE]") yield data;
  }
}

/** Attempt to parse JSON safely, returning undefined on failure */
export function tryParseJSON(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
