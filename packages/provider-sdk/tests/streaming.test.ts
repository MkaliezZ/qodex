import { describe, it, expect } from "vitest";
import { StreamManager } from "../src/streaming/index.js";
import type { ModelChunk } from "../src/types/chunk.js";

/**
 * Helper: create a ReadableStreamDefaultReader from string chunks.
 */
function readerFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return stream.getReader();
}

describe("StreamManager", () => {
  it("parses SSE text chunks", async () => {
    const manager = new StreamManager({
      parser: (raw) => {
        const json = JSON.parse(raw);
        const content = json.choices?.[0]?.delta?.content;
        return content ? ({ type: "text", text: content } as ModelChunk) : null;
      },
    });

    const reader = readerFromChunks([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" World"}}]}\n',
      "data: [DONE]\n",
    ]);

    const results: ModelChunk[] = [];
    for await (const chunk of manager.run(reader)) {
      results.push(chunk);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "text", text: "Hello" });
    expect(results[1]).toEqual({ type: "text", text: " World" });
  });

  it("handles empty stream gracefully", async () => {
    const manager = new StreamManager({
      parser: () => null,
    });

    const reader = readerFromChunks(["data: [DONE]\n"]);
    const results: ModelChunk[] = [];
    for await (const chunk of manager.run(reader)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(0);
  });

  it("handles chunked SSE data across boundaries", async () => {
    const manager = new StreamManager({
      parser: (raw) => {
        const json = JSON.parse(raw);
        const content = json.choices?.[0]?.delta?.content;
        return content ? ({ type: "text", text: content } as ModelChunk) : null;
      },
    });

    // Split a single SSE message across two reads
    const reader = readerFromChunks([
      'data: {"choices":[{"delta":',
      '{"content":"Hi"}}]}\n',
      "data: [DONE]\n",
    ]);

    const results: ModelChunk[] = [];
    for await (const chunk of manager.run(reader)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ type: "text", text: "Hi" });
  });

  it("yields error chunk on parser crash", async () => {
    const manager = new StreamManager({
      parser: () => {
        throw new Error("parser exploded");
      },
    });

    const reader = readerFromChunks(['data: {"bad": json}\n']);
    const results: ModelChunk[] = [];
    for await (const chunk of manager.run(reader)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("error");
  });

  it("respects AbortSignal", async () => {
    const controller = new AbortController();
    const manager = new StreamManager({
      parser: (raw) => {
        const json = JSON.parse(raw);
        const content = json.choices?.[0]?.delta?.content;
        return content ? ({ type: "text", text: content } as ModelChunk) : null;
      },
    });

    const reader = readerFromChunks([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n',
    ]);
    controller.abort();

    const results: ModelChunk[] = [];
    for await (const chunk of manager.run(reader, controller.signal)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ type: "text", text: "" });
  });
});
