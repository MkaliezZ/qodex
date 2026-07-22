import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../src/providers/openai/index.js";
import type { ModelChunk, ModelRequest } from "../src/index.js";

const encoder = new TextEncoder();

function responseFromEvents(events: unknown[]): Response {
  const body = events
    .map((event) => event === "[DONE]" ? "data: [DONE]\n\n" : `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return {
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
  } as Response;
}

async function collect(provider: OpenAIProvider, events: unknown[]): Promise<ModelChunk[]> {
  globalThis.fetch = vi.fn().mockResolvedValue(responseFromEvents(events));
  const result: ModelChunk[] = [];
  for await (const chunk of provider.stream({ model: "gpt-4o", messages: [{ role: "user", content: "go" }] })) {
    result.push(chunk);
  }
  return result;
}

function toolDelta(
  index: number,
  values: { id?: string; name?: string; arguments?: string },
  finishReason: string | null = null,
) {
  return {
    choices: [{
      delta: {
        tool_calls: [{
          index,
          ...(values.id ? { id: values.id } : {}),
          function: {
            ...(values.name !== undefined ? { name: values.name } : {}),
            ...(values.arguments !== undefined ? { arguments: values.arguments } : {}),
          },
        }],
      },
      finish_reason: finishReason,
    }],
  };
}

describe("OpenAI-compatible tool calling", () => {
  let provider: OpenAIProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: "test-key" });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("translates tools and exact call history into the outgoing request", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return responseFromEvents(["[DONE]"]);
    });
    const request: ModelRequest = {
      model: "gpt-4o",
      tools: [{ name: "read_file", description: "Read a project file", inputSchema: { type: "object" } }],
      messages: [
        { role: "user", content: "inspect" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "read_file", arguments: { path: "src/a.ts" } }],
        },
        { role: "tool", toolCallId: "call-1", name: "read_file", content: "{\"ok\":true}" },
      ],
    };

    for await (const _chunk of provider.stream(request)) {
      // Consume the stream so the request is issued.
    }

    expect(requestBody?.tools).toEqual([{
      type: "function",
      function: { name: "read_file", description: "Read a project file", parameters: { type: "object" } },
    }]);
    expect(requestBody?.messages).toEqual([
      { role: "user", content: "inspect" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call-1",
          type: "function",
          function: { name: "read_file", arguments: "{\"path\":\"src/a.ts\"}" },
        }],
      },
      { role: "tool", content: "{\"ok\":true}", tool_call_id: "call-1", name: "read_file" },
    ]);
  });

  it("emits one completed tool call with a stable ID", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-1", name: "read_file", arguments: "{\"path\":\"a.ts\"}" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.filter((chunk) => chunk.type === "tool_call")).toEqual([
      { type: "tool_call", id: "call-1", name: "read_file", arguments: { path: "a.ts" } },
    ]);
  });

  it("aggregates fragmented JSON before parsing", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-fragment", name: "read_file", arguments: "{\"pa" }),
      toolDelta(0, { arguments: "th\":\"src/a.ts\"}" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.find((chunk) => chunk.type === "tool_call")).toEqual({
      type: "tool_call", id: "call-fragment", name: "read_file", arguments: { path: "src/a.ts" },
    });
  });

  it("aggregates fragmented function names", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-name", name: "read_", arguments: "{}" }),
      toolDelta(0, { name: "file" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.find((chunk) => chunk.type === "tool_call")).toMatchObject({
      id: "call-name", name: "read_file",
    });
  });

  it("keeps multiple interleaved calls separate by index and ID", async () => {
    const events = [
      toolDelta(0, { id: "call-a", name: "read_file", arguments: "{\"path\":" }),
      toolDelta(1, { id: "call-b", name: "search_files", arguments: "{\"query\":" }),
      toolDelta(0, { arguments: "\"a.ts\"}" }),
      toolDelta(1, { arguments: "\"needle\"}" }, "tool_calls"),
      "[DONE]",
    ];
    const calls = (await collect(provider, events)).filter((chunk) => chunk.type === "tool_call");
    expect(calls).toEqual([
      { type: "tool_call", id: "call-a", name: "read_file", arguments: { path: "a.ts" } },
      { type: "tool_call", id: "call-b", name: "search_files", arguments: { query: "needle" } },
    ]);
  });

  it("preserves text before a tool call", async () => {
    const chunks = await collect(provider, [
      { choices: [{ delta: { content: "I will inspect." }, finish_reason: null }] },
      toolDelta(0, { id: "call-1", name: "read_file", arguments: "{}" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.findIndex((chunk) => chunk.type === "text"))
      .toBeLessThan(chunks.findIndex((chunk) => chunk.type === "tool_call"));
  });

  it("preserves text after tool-call deltas", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-1", name: "read_file", arguments: "{}" }),
      { choices: [{ delta: { content: "Checking now." }, finish_reason: "tool_calls" }] },
      "[DONE]",
    ]);
    expect(chunks.some((chunk) => chunk.type === "text" && chunk.text === "Checking now.")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "tool_call")).toBe(true);
  });

  it("returns a structured error and never completes malformed arguments", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-bad", name: "read_file", arguments: "{bad" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.some((chunk) => chunk.type === "tool_call")).toBe(false);
    expect(chunks.find((chunk) => chunk.type === "tool_call_error")).toMatchObject({
      id: "call-bad", name: "read_file", argumentsText: "{bad",
    });
  });

  it("preserves an unknown tool name for runtime rejection", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-unknown", name: "delete_everything", arguments: "{}" }, "tool_calls"),
      "[DONE]",
    ]);
    expect(chunks.find((chunk) => chunk.type === "tool_call")).toMatchObject({
      id: "call-unknown", name: "delete_everything",
    });
  });

  it("propagates a provider error that arrives during a partial call", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-partial", name: "read_file", arguments: "{\"path\":" }),
      { error: { message: "upstream interrupted" } },
      "[DONE]",
    ]);
    expect(chunks.some((chunk) => chunk.type === "error" && chunk.message === "upstream interrupted")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "tool_call")).toBe(false);
    expect(chunks.some((chunk) => chunk.type === "tool_call_error")).toBe(false);
  });

  it("emits usage after a completed tool call", async () => {
    const chunks = await collect(provider, [
      toolDelta(0, { id: "call-1", name: "read_file", arguments: "{}" }, "tool_calls"),
      { choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } },
      "[DONE]",
    ]);
    expect(chunks.find((chunk) => chunk.type === "usage")).toEqual({
      type: "usage", inputTokens: 9, outputTokens: 4,
    });
  });

  it("keeps normal text-only streaming unchanged", async () => {
    const chunks = await collect(provider, [
      { choices: [{ delta: { content: "Hello" }, finish_reason: null }] },
      { choices: [{ delta: { content: " world" }, finish_reason: "stop" }] },
      "[DONE]",
    ]);
    expect(chunks.filter((chunk) => chunk.type === "text")).toEqual([
      { type: "text", text: "Hello" },
      { type: "text", text: " world" },
    ]);
  });

  it("advertises verified tool-agent capability", () => {
    expect(provider.capabilities.toolAgentLoop).toBe(true);
  });
});
