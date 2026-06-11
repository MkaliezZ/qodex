import { describe, it, expect } from "vitest";
import { MockStreamingProvider } from "../src/providers/mock.js";

describe("MockStreamingProvider", () => {
  it("returns models", async () => {
    const provider = new MockStreamingProvider();
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBe("mock-model-1");
  });

  it("testConnection returns true", async () => {
    const provider = new MockStreamingProvider();
    expect(await provider.testConnection()).toBe(true);
  });

  it("streams default chunks", async () => {
    const provider = new MockStreamingProvider({ chunkDelayMs: 1 });
    const chunks: string[] = [];

    for await (const chunk of provider.stream({
      model: "mock-model-1",
      messages: [{ role: "user", content: "Hi" }],
    })) {
      if (chunk.type === "text") chunks.push(chunk.text);
    }

    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks[0]).toContain("Processing");
  });

  it("streams custom chunks", async () => {
    const provider = new MockStreamingProvider({
      chunks: ["A", "B", "C"],
      chunkDelayMs: 1,
    });
    const texts: string[] = [];
    for await (const chunk of provider.stream({
      model: "m1",
      messages: [{ role: "user", content: "x" }],
    })) {
      if (chunk.type === "text") texts.push(chunk.text);
    }
    // First chunk is the response header, then A, B, C
    expect(texts).toHaveLength(4);
    expect(texts[1]).toBe("A");
    expect(texts[2]).toBe("B");
    expect(texts[3]).toBe("C");
  });

  it("has correct id and protocol", () => {
    const provider = new MockStreamingProvider();
    expect(provider.id).toBe("mock");
    expect(provider.protocol).toBe("openai-chat");
  });
});
