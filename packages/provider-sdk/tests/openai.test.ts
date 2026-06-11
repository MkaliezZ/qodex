import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "../src/providers/openai/index.js";

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: "sk-test" });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("has correct id and name", () => {
    expect(provider.id).toBe("openai");
    expect(provider.name).toBe("OpenAI");
    expect(provider.protocol).toBe("openai-chat");
    expect(provider.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("returns default models without network call", async () => {
    const models = await provider.listModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBe("gpt-4o");
  });

  it("testConnection returns false when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const ok = await provider.testConnection();
    expect(ok).toBe(false);
  });

  it("testConnection returns true on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    const ok = await provider.testConnection();
    expect(ok).toBe(true);
  });

  it("stream yields text chunks from mock response", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"role":"assistant","content":"Hello"}}]}\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n',
      "data: [DONE]\n",
    ];
    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    });

    const request = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Hi" }],
    };

    const results: any[] = [];
    for await (const chunk of provider.stream(request)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "text", text: "Hello" });
    expect(results[1]).toEqual({ type: "text", text: " world" });
  });

  it("stream yields error chunk on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    const request = {
      model: "gpt-4o",
      messages: [{ role: "user" as const, content: "Hi" }],
    };

    const results: any[] = [];
    for await (const chunk of provider.stream(request)) {
      results.push(chunk);
    }
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("error");
    expect((results[0] as any).message).toContain("auth");
  });
});
