import type { ModelRequest, ModelMessage } from "../../types/message.js";

interface AnthropicMessage { role: "user" | "assistant"; content: string; }
interface AnthropicRequest { model: string; max_tokens: number; messages: AnthropicMessage[]; system?: string; temperature?: number; stream?: boolean; }

export function mapToAnthropicRequest(request: ModelRequest): AnthropicRequest {
  const nonSystem = request.messages.filter((m: ModelMessage) => m.role !== "system");
  const systemMsgs = request.messages.filter((m: ModelMessage) => m.role === "system");
  const system = systemMsgs.length > 0 ? systemMsgs.map((m) => m.content).join("\n\n") : undefined;

  const messages: AnthropicMessage[] = nonSystem.map((m: ModelMessage) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
  }));

  if (messages.length === 0) {
    messages.push({ role: "user", content: "Hello" });
  }

  return {
    model: request.model,
    max_tokens: request.maxTokens ?? 4096,
    messages,
    ...(system ? { system } : {}),
    ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
    stream: request.stream ?? true,
  };
}
