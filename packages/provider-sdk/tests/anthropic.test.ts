import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "../src/providers/anthropic/index.js";
import { mapToAnthropicRequest } from "../src/providers/anthropic/mapper.js";
import { normalizeAnthropicError } from "../src/providers/anthropic/errors.js";
import type { ModelRequest } from "../src/types/message.js";

describe("AnthropicProvider", () => {
  describe("constructor", () => {
    it("sets id, name, protocol correctly", () => {
      const p = new AnthropicProvider();
      expect(p.id).toBe("anthropic");
      expect(p.name).toBe("Anthropic");
      expect(p.protocol).toBe("anthropic");
    });

    it("uses default baseUrl", () => {
      const p = new AnthropicProvider();
      expect(p).toBeDefined();
    });

    it("accepts custom baseUrl and version", () => {
      const p = new AnthropicProvider({ baseUrl: "https://custom.anthropic.com", version: "2024-01-01" });
      expect(p).toBeDefined();
    });
  });

  describe("listModels", () => {
    it("returns 4 Claude models", async () => {
      const p = new AnthropicProvider();
      const models = await p.listModels();
      expect(models.length).toBe(4);
      expect(models[0].id).toContain("claude");
    });
  });

  describe("testConnection", () => {
    it("returns false without API key", async () => {
      const p = new AnthropicProvider();
      expect(await p.testConnection()).toBe(false);
    });
  });
});

describe("mapToAnthropicRequest", () => {
  const baseReq: ModelRequest = {
    model: "claude-3-5-sonnet-latest",
    messages: [{ role: "user", content: "Hello" }],
    stream: true,
  };

  it("maps model", () => {
    const r = mapToAnthropicRequest(baseReq);
    expect(r.model).toBe("claude-3-5-sonnet-latest");
  });

  it("maps temperature", () => {
    const r = mapToAnthropicRequest({ ...baseReq, temperature: 0.7 });
    expect(r.temperature).toBe(0.7);
  });

  it("defaults max_tokens", () => {
    const r = mapToAnthropicRequest(baseReq);
    expect(r.max_tokens).toBe(4096);
  });

  it("maps maxTokens", () => {
    const r = mapToAnthropicRequest({ ...baseReq, maxTokens: 2048 });
    expect(r.max_tokens).toBe(2048);
  });

  it("maps system message to top-level system", () => {
    const r = mapToAnthropicRequest({
      ...baseReq,
      messages: [{ role: "system", content: "You are helpful." }, { role: "user", content: "Hi" }],
    });
    expect(r.system).toBe("You are helpful.");
    expect(r.messages.length).toBe(1);
    expect(r.messages[0].role).toBe("user");
  });

  it("joins multiple system messages", () => {
    const r = mapToAnthropicRequest({
      ...baseReq,
      messages: [
        { role: "system", content: "Rule 1" },
        { role: "system", content: "Rule 2" },
        { role: "user", content: "Hi" },
      ],
    });
    expect(r.system).toBe("Rule 1\n\nRule 2");
  });

  it("maps user messages correctly", () => {
    const r = mapToAnthropicRequest({
      ...baseReq,
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(r.messages[0].role).toBe("user");
    expect(r.messages[0].content).toBe("Hello");
  });

  it("maps assistant messages correctly", () => {
    const r = mapToAnthropicRequest({
      ...baseReq,
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!" },
      ],
    });
    expect(r.messages[1].role).toBe("assistant");
    expect(r.messages[1].content).toBe("Hello!");
  });

  it("provides default user message when empty", () => {
    const r = mapToAnthropicRequest({ ...baseReq, messages: [{ role: "system", content: "S" }] });
    expect(r.messages.length).toBe(1);
    expect(r.messages[0].content).toBe("Hello");
  });

  it("sets stream true by default", () => {
    const r = mapToAnthropicRequest(baseReq);
    expect(r.stream).toBe(true);
  });
});

describe("normalizeAnthropicError", () => {
  it("401 → unauthorized", () => {
    const e = normalizeAnthropicError(401, "{}");
    expect(e.type).toBe("unauthorized");
  });

  it("429 → rate_limited", () => {
    const e = normalizeAnthropicError(429, "{}", "30");
    expect(e.type).toBe("rate_limited");
    expect(e.retryAfter).toBe(30);
  });

  it("500 → provider_error", () => {
    const e = normalizeAnthropicError(500, "{}");
    expect(e.type).toBe("provider_error");
  });

  it("529 → overloaded", () => {
    const e = normalizeAnthropicError(529, "{}");
    expect(e.type).toBe("overloaded");
  });

  it("400 → invalid_request", () => {
    const e = normalizeAnthropicError(400, JSON.stringify({ error: { type: "invalid_request_error", message: "Bad request" } }));
    expect(e.type).toBe("invalid_request");
  });
});
