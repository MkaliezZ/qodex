import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { DeepSeekProvider } from "../src/providers/deepseek/index.js";

describe("DeepSeekProvider", () => {
  let provider: DeepSeekProvider;

  beforeEach(() => {
    provider = new DeepSeekProvider({ apiKey: "sk-ds-test" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct id and name", () => {
    expect(provider.id).toBe("deepseek");
    expect(provider.name).toBe("DeepSeek");
    expect(provider.protocol).toBe("openai-chat");
    expect(provider.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  it("returns default models", async () => {
    const models = await provider.listModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("deepseek-chat");
    expect(models[1].id).toBe("deepseek-reasoner");
  });

  it("stream works with mock data", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"你好"}}]}\n',
      'data: {"choices":[{"delta":{"content":"，我是DeepSeek"}}]}\n',
    ];
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const results: any[] = [];
    for await (const chunk of provider.stream({
      model: "deepseek-chat",
      messages: [{ role: "user", content: "你是谁" }],
    })) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "text", text: "你好" });
    expect(results[1]).toEqual({ type: "text", text: "，我是DeepSeek" });
  });

  it("testConnection returns false without API key", async () => {
    const noKeyProvider = new DeepSeekProvider();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const ok = await noKeyProvider.testConnection();
    expect(ok).toBe(false);
  });
});
