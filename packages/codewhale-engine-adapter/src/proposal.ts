import { canonicalJson, isSha256, type CanonicalValue } from "./canonical.js";
import { AgentEngineError, type DynamicToolRequest, type DynamicToolResult } from "./types.js";

export const KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL = Object.freeze({
  namespace: "kerniq",
  name: "propose_project_command",
  description: "Create a KerniQ intent for one existing trusted Project Command. This tool never executes the command.",
  input_schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["commandId", "catalogDigest"],
    properties: Object.freeze({
      commandId: Object.freeze({ type: "string", minLength: 1, maxLength: 160 }),
      catalogDigest: Object.freeze({ type: "string", pattern: "^sha256:[0-9a-f]{64}$" }),
    }),
  }),
  defer_loading: false,
});

export interface ProjectCommandIntent {
  readonly kind: "project_command_intent";
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly commandId: string;
  readonly catalogDigest: string;
}

type CallTerminalState = "resolved" | "timed_out" | "canceled" | "historical";

interface PendingCall {
  readonly request: DynamicToolRequest;
  readonly canonicalArguments: string;
  terminal?: CallTerminalState;
}

export class DynamicToolSettlementGuard {
  private readonly calls = new Map<string, PendingCall>();

  register(request: DynamicToolRequest): ProjectCommandIntent {
    const intent = validateProposalRequest(request);
    if (this.calls.has(request.callId)) {
      throw new AgentEngineError("duplicate_result", "The dynamic tool call identity is already registered.");
    }
    this.calls.set(request.callId, {
      request: structuredClone(request),
      canonicalArguments: canonicalJson(request.arguments as CanonicalValue),
    });
    return intent;
  }

  validateResultRoute(request: DynamicToolRequest): void {
    const pending = this.calls.get(request.callId);
    if (!pending || !sameCall(pending.request, request)) {
      throw new AgentEngineError("wrong_call_identity", "The dynamic tool result route does not match the pending call.");
    }
    if (pending.canonicalArguments !== canonicalJson(request.arguments as CanonicalValue)) {
      throw new AgentEngineError("wrong_call_identity", "The dynamic tool arguments changed after the request.");
    }
    if (pending.terminal) {
      throw new AgentEngineError(
        pending.terminal === "resolved" ? "duplicate_result" : "call_terminal",
        "The dynamic tool call is already terminal.",
      );
    }
  }

  accept(request: DynamicToolRequest, result: DynamicToolResult): void {
    this.validateResultRoute(request);
    validateResult(result);
    this.calls.get(request.callId)!.terminal = "resolved";
  }

  timeout(request: DynamicToolRequest): void {
    this.validateResultRoute(request);
    this.calls.get(request.callId)!.terminal = "timed_out";
  }

  cancel(request: DynamicToolRequest): void {
    this.validateResultRoute(request);
    this.calls.get(request.callId)!.terminal = "canceled";
  }

  restoreHistorical(request: DynamicToolRequest): void {
    validateProposalRequest(request);
    this.calls.set(request.callId, {
      request: structuredClone(request),
      canonicalArguments: canonicalJson(request.arguments as CanonicalValue),
      terminal: "historical",
    });
  }

  mayExecute(request: DynamicToolRequest): boolean {
    const call = this.calls.get(request.callId);
    return Boolean(
      call
      && !call.terminal
      && sameCall(call.request, request)
      && call.canonicalArguments === canonicalJson(request.arguments as CanonicalValue),
    );
  }
}

export class EventCursorGate {
  private sequence: number;

  constructor(
    private readonly sessionId: string,
    initialSequence = 0,
  ) {
    if (!Number.isSafeInteger(initialSequence) || initialSequence < 0) {
      throw new TypeError("Event sequence must be a non-negative safe integer.");
    }
    this.sequence = initialSequence;
  }

  accept(event: { readonly sessionId: string; readonly sequence: number }): boolean {
    if (event.sessionId !== this.sessionId) {
      throw new AgentEngineError("wrong_call_identity", "The event belongs to another session.");
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
      throw new TypeError("Event sequence must be a positive safe integer.");
    }
    if (event.sequence <= this.sequence) return false;
    this.sequence = event.sequence;
    return true;
  }

  current(): number {
    return this.sequence;
  }
}

export function validateProposalRequest(request: DynamicToolRequest): ProjectCommandIntent {
  if (
    request.namespace !== KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL.namespace
    || request.toolName !== KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL.name
    || !boundedText(request.sessionId, 256)
    || !boundedText(request.turnId, 256)
    || !boundedText(request.callId, 256)
  ) {
    throw new AgentEngineError("wrong_call_identity", "The dynamic tool identity is not the KerniQ proposal contract.");
  }
  const keys = Object.keys(request.arguments).sort();
  if (keys.length !== 2 || keys[0] !== "catalogDigest" || keys[1] !== "commandId") {
    throw new TypeError("Project Command intent arguments must have the exact bounded shape.");
  }
  const commandId = request.arguments.commandId;
  const catalogDigest = request.arguments.catalogDigest;
  if (!boundedText(commandId, 160) || !isSha256(catalogDigest)) {
    throw new TypeError("Project Command intent identity is invalid.");
  }
  return Object.freeze({
    kind: "project_command_intent",
    sessionId: request.sessionId,
    turnId: request.turnId,
    callId: request.callId,
    commandId,
    catalogDigest,
  });
}

function validateResult(result: DynamicToolResult): void {
  if (
    typeof result.success !== "boolean"
    || !Array.isArray(result.content)
    || result.content.length > 4
    || result.content.some((item) => item.type !== "input_text" || !boundedText(item.text, 4_096))
  ) {
    throw new TypeError("The dynamic tool result exceeds the bounded KerniQ contract.");
  }
}

function sameCall(left: DynamicToolRequest, right: DynamicToolRequest): boolean {
  return left.sessionId === right.sessionId
    && left.turnId === right.turnId
    && left.callId === right.callId
    && left.namespace === right.namespace
    && left.toolName === right.toolName;
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= maxLength;
}
