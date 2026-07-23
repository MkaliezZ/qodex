import { PythonRuntimeError } from "./errors.js";

export const BRIDGE_PROTOCOL_VERSION = "kerniq.agentfuse.bridge.v1";
export const DEFAULT_MESSAGE_LIMIT = 64 * 1024;

export interface BridgeMessage<TPayload = unknown> {
  protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
  messageId: string;
  messageType: string;
  payload: TPayload;
}

export function encodeBridgeMessage(
  message: BridgeMessage,
  limit = DEFAULT_MESSAGE_LIMIT,
): string {
  const encoded = JSON.stringify(message);
  if (new TextEncoder().encode(encoded).byteLength > limit) {
    throw new PythonRuntimeError("message_too_large", "Bridge message exceeds the configured bound.");
  }
  return `${encoded}\n`;
}

export function parseBridgeMessage(
  raw: string,
  expectedMessageId?: string,
  limit = DEFAULT_MESSAGE_LIMIT,
): BridgeMessage {
  if (new TextEncoder().encode(raw).byteLength > limit) {
    throw new PythonRuntimeError("message_too_large", "Bridge response exceeds the configured bound.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PythonRuntimeError("protocol_mismatch", "Bridge response is not valid JSON.");
  }
  if (
    !isRecord(value)
    || value.protocolVersion !== BRIDGE_PROTOCOL_VERSION
    || typeof value.messageId !== "string"
    || value.messageId.length === 0
    || typeof value.messageType !== "string"
    || value.messageType.length === 0
    || !("payload" in value)
    || (expectedMessageId !== undefined && value.messageId !== expectedMessageId)
  ) {
    throw new PythonRuntimeError("protocol_mismatch", "Bridge response does not match the protocol.");
  }
  return value as unknown as BridgeMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
