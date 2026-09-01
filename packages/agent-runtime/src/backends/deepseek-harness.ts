import {
  AgentBackendUnavailableError,
  type AgentBackend,
  type AgentBackendEvent,
  type AgentBackendEventListener,
  type AgentBackendEventStream,
  type AgentBackendJsonValue,
  type AgentBackendMessage,
  type AgentBackendSession,
  type AgentBackendSessionInput,
  type AgentBackendToolRequest,
  type AgentBackendToolResult,
  type AgentBackendTurn,
} from "./types.js";

interface DeepSeekHarnessTransportEventBase {
  readonly sessionId: string;
  readonly sequence: number;
}

export interface DeepSeekHarnessSessionStartedEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "session.started";
}

export interface DeepSeekHarnessModelOutputEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "model.output";
  readonly turnId: string;
  readonly content: string;
}

export interface DeepSeekHarnessToolCallRequestedEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "tool_call.requested";
  readonly turnId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly arguments: AgentBackendJsonValue;
}

export interface DeepSeekHarnessToolCallResolvedEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "tool_call.resolved";
  readonly turnId: string;
  readonly callId: string;
  readonly success: boolean;
  readonly content: AgentBackendJsonValue;
}

export interface DeepSeekHarnessTurnCompletedEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "turn.completed";
  readonly turnId: string;
}

export interface DeepSeekHarnessTurnCancelledEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "turn.cancelled";
  readonly turnId: string;
  readonly reason?: string;
}

export interface DeepSeekHarnessRuntimeErrorEvent
extends DeepSeekHarnessTransportEventBase {
  readonly type: "runtime.error";
  readonly turnId?: string;
  readonly message: string;
}

export type DeepSeekHarnessTransportEvent =
  | DeepSeekHarnessSessionStartedEvent
  | DeepSeekHarnessModelOutputEvent
  | DeepSeekHarnessToolCallRequestedEvent
  | DeepSeekHarnessToolCallResolvedEvent
  | DeepSeekHarnessTurnCompletedEvent
  | DeepSeekHarnessTurnCancelledEvent
  | DeepSeekHarnessRuntimeErrorEvent;

export interface DeepSeekHarnessTransportStream {
  close(): Promise<void>;
}

/**
 * Injectable governed DSH transport.
 *
 * A conforming connector must pause protected calls before emitting
 * `tool_call.requested`. The audited public DSH SDK does not yet implement
 * this contract, so no default connector is provided.
 */
export interface DeepSeekHarnessTransport {
  startSession(input: AgentBackendSessionInput): Promise<AgentBackendSession>;
  sendMessage(sessionId: string, message: AgentBackendMessage): Promise<AgentBackendTurn>;
  streamEvents(
    sessionId: string,
    afterSequence: number | undefined,
    listener: (event: DeepSeekHarnessTransportEvent) => void,
  ): Promise<DeepSeekHarnessTransportStream>;
  submitToolResult(result: AgentBackendToolResult): Promise<void>;
  cancelTurn(sessionId: string, turnId: string): Promise<void>;
  shutdown(): Promise<void>;
}

export interface DeepSeekHarnessBackendOptions {
  readonly transport: DeepSeekHarnessTransport;
}

interface DeepSeekHarnessSessionState {
  lastSequence: number;
  streamOpen: boolean;
  sessionStarted: boolean;
  readonly pendingRequests: Map<string, AgentBackendToolRequest>;
  readonly submittedResults: Map<string, AgentBackendToolResult>;
  readonly terminalCalls: Set<string>;
  readonly terminalTurns: Set<string>;
  readonly cancellationRequests: Set<string>;
}

export class DeepSeekHarnessProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekHarnessProtocolError";
  }
}

/**
 * Provider-neutral KerniQ adapter for a governed DeepSeek Harness transport.
 * It translates and routes inert data only; it owns no tool execution,
 * approval, policy, AgentFuse, evidence, or rollback behavior.
 */
export class DeepSeekHarnessBackend implements AgentBackend {
  readonly id = "deepseek-harness";

  private readonly transport?: DeepSeekHarnessTransport;
  private readonly sessions = new Map<string, DeepSeekHarnessSessionState>();
  private stopped = false;

  constructor(options?: DeepSeekHarnessBackendOptions) {
    this.transport = options?.transport;
  }

  async startSession(input: AgentBackendSessionInput): Promise<AgentBackendSession> {
    this.requireRunning();
    const session = await this.requireTransport().startSession(input);
    requireText(session.sessionId, "DSH session id");
    if (this.sessions.has(session.sessionId)) {
      throw new DeepSeekHarnessProtocolError(
        `DeepSeek Harness reused session id "${session.sessionId}".`,
      );
    }
    this.sessions.set(session.sessionId, {
      lastSequence: 0,
      streamOpen: false,
      sessionStarted: false,
      pendingRequests: new Map(),
      submittedResults: new Map(),
      terminalCalls: new Set(),
      terminalTurns: new Set(),
      cancellationRequests: new Set(),
    });
    return Object.freeze({ ...session });
  }

  async sendMessage(
    sessionId: string,
    message: AgentBackendMessage,
  ): Promise<AgentBackendTurn> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    requireText(message.content, "DSH message content");
    if (message.role !== "user" && message.role !== "model") {
      throw new TypeError("DSH message role must be user or model.");
    }
    const turn = await this.requireTransport().sendMessage(sessionId, message);
    if (turn.sessionId !== sessionId) {
      throw new DeepSeekHarnessProtocolError("DSH returned a turn for another session.");
    }
    requireText(turn.turnId, "DSH turn id");
    if (state.terminalTurns.has(turn.turnId)) {
      throw new DeepSeekHarnessProtocolError("DSH reused a terminal turn id.");
    }
    return Object.freeze({ ...turn });
  }

  async streamEvents(
    sessionId: string,
    afterSequence: number | undefined,
    listener: AgentBackendEventListener,
  ): Promise<AgentBackendEventStream> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    if (state.streamOpen) {
      throw new DeepSeekHarnessProtocolError("Only one DSH event stream may be active per session.");
    }
    const cursor = afterSequence ?? 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new TypeError("DSH event cursor must be a non-negative integer.");
    }
    if (cursor > state.lastSequence) {
      throw new DeepSeekHarnessProtocolError("DSH event cursor skips unobserved events.");
    }
    state.streamOpen = true;
    let transportStream: DeepSeekHarnessTransportStream;
    try {
      transportStream = await this.requireTransport().streamEvents(
        sessionId,
        cursor,
        (event) => {
          const mapped = this.translateEvent(state, sessionId, event);
          if (mapped) listener(mapped);
        },
      );
    } catch (error) {
      state.streamOpen = false;
      throw error;
    }
    let closed = false;
    return {
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          await transportStream.close();
        } finally {
          state.streamOpen = false;
        }
      },
    };
  }

  /** Translate one paused DSH tool call into inert KerniQ request data. */
  receiveToolRequest(
    event: DeepSeekHarnessToolCallRequestedEvent,
  ): AgentBackendToolRequest {
    const state = this.requireSession(event.sessionId);
    requireText(event.turnId, "DSH tool-call turn id");
    requireText(event.callId, "DSH tool-call id");
    requireText(event.toolName, "DSH tool name");
    requireJsonValue(event.arguments, "DSH tool arguments");
    if (state.terminalTurns.has(event.turnId)) {
      throw new DeepSeekHarnessProtocolError("DSH emitted a tool call for a terminal turn.");
    }
    const key = callKey(event.turnId, event.callId);
    if (
      state.pendingRequests.has(key)
      || state.submittedResults.has(key)
      || state.terminalCalls.has(key)
    ) {
      throw new DeepSeekHarnessProtocolError("DSH emitted a duplicate tool-call identity.");
    }
    const request = Object.freeze({
      sessionId: event.sessionId,
      turnId: event.turnId,
      callId: event.callId,
      toolName: event.toolName,
      arguments: event.arguments,
    });
    state.pendingRequests.set(key, request);
    return request;
  }

  async submitToolResult(
    request: AgentBackendToolRequest,
    result: AgentBackendToolResult,
  ): Promise<void> {
    this.requireRunning();
    const state = this.requireSession(request.sessionId);
    const key = callKey(request.turnId, request.callId);
    const pending = state.pendingRequests.get(key);
    if (!sameRequestIdentity(pending, request)) {
      throw new DeepSeekHarnessProtocolError(
        "DSH tool result does not match a pending request.",
      );
    }
    if (state.terminalTurns.has(request.turnId) || state.terminalCalls.has(key)) {
      throw new DeepSeekHarnessProtocolError("DSH tool call is already terminal.");
    }
    if (state.submittedResults.has(key)) {
      throw new DeepSeekHarnessProtocolError("DSH tool result was already submitted.");
    }
    if (!sameResultIdentity(request, result)) {
      throw new DeepSeekHarnessProtocolError(
        "DSH tool result identity does not match the request.",
      );
    }
    requireJsonValue(result.content, "DSH tool result content");
    const submitted = Object.freeze({ ...result });
    state.submittedResults.set(key, submitted);
    try {
      await this.requireTransport().submitToolResult(submitted);
    } catch (error) {
      state.submittedResults.delete(key);
      throw error;
    }
  }

  async cancelTurn(sessionId: string, turnId: string): Promise<void> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    requireText(turnId, "DSH turn id");
    if (state.terminalTurns.has(turnId) || state.cancellationRequests.has(turnId)) return;
    state.cancellationRequests.add(turnId);
    try {
      await this.requireTransport().cancelTurn(sessionId, turnId);
    } catch (error) {
      state.cancellationRequests.delete(turnId);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    try {
      await this.transport?.shutdown();
    } finally {
      this.sessions.clear();
    }
  }

  private translateEvent(
    state: DeepSeekHarnessSessionState,
    sessionId: string,
    event: DeepSeekHarnessTransportEvent,
  ): AgentBackendEvent | null {
    if (event.sessionId !== sessionId) {
      throw new DeepSeekHarnessProtocolError("DSH emitted an event for another session.");
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
      throw new DeepSeekHarnessProtocolError("DSH event sequence is invalid.");
    }
    if (event.sequence <= state.lastSequence) return null;
    if (event.sequence !== state.lastSequence + 1) {
      throw new DeepSeekHarnessProtocolError("DSH event sequence contains a gap.");
    }

    const mapped = this.mapOrderedEvent(state, event);
    state.lastSequence = event.sequence;
    return mapped;
  }

  private mapOrderedEvent(
    state: DeepSeekHarnessSessionState,
    event: DeepSeekHarnessTransportEvent,
  ): AgentBackendEvent {
    switch (event.type) {
      case "session.started":
        if (state.sessionStarted) {
          throw new DeepSeekHarnessProtocolError("DSH emitted session.started twice.");
        }
        state.sessionStarted = true;
        return Object.freeze({
          type: "session_started",
          sessionId: event.sessionId,
          sequence: event.sequence,
        });

      case "model.output":
        this.requireActiveTurn(state, event.turnId);
        requireText(event.content, "DSH model output");
        return Object.freeze({
          type: "message",
          sessionId: event.sessionId,
          sequence: event.sequence,
          turnId: event.turnId,
          message: Object.freeze({ role: "model", content: event.content }),
        });

      case "tool_call.requested": {
        const request = this.receiveToolRequest(event);
        return Object.freeze({
          type: "tool_request",
          sessionId: event.sessionId,
          sequence: event.sequence,
          turnId: event.turnId,
          request,
        });
      }

      case "tool_call.resolved":
        return this.resolveToolCall(state, event);

      case "turn.completed":
        this.completeTurn(state, event.turnId);
        return Object.freeze({
          type: "turn_completed",
          sessionId: event.sessionId,
          sequence: event.sequence,
          turnId: event.turnId,
        });

      case "turn.cancelled":
        this.cancelPendingTurn(state, event.turnId);
        return Object.freeze({
          type: "turn_cancelled",
          sessionId: event.sessionId,
          sequence: event.sequence,
          turnId: event.turnId,
          ...(event.reason ? { reason: event.reason } : {}),
        });

      case "runtime.error":
        requireText(event.message, "DSH runtime error");
        return Object.freeze({
          type: "error",
          sessionId: event.sessionId,
          sequence: event.sequence,
          ...(event.turnId ? { turnId: event.turnId } : {}),
          message: event.message,
        });
    }
  }

  private resolveToolCall(
    state: DeepSeekHarnessSessionState,
    event: DeepSeekHarnessToolCallResolvedEvent,
  ): AgentBackendEvent {
    const key = callKey(event.turnId, event.callId);
    const request = state.pendingRequests.get(key);
    const submitted = state.submittedResults.get(key);
    if (!request || !submitted) {
      throw new DeepSeekHarnessProtocolError(
        "DSH resolved a tool call without a KerniQ-submitted result.",
      );
    }
    requireJsonValue(event.content, "DSH resolved tool content");
    if (submitted.success !== event.success || !jsonEquals(submitted.content, event.content)) {
      throw new DeepSeekHarnessProtocolError(
        "DSH resolved tool content does not match the KerniQ result.",
      );
    }
    state.pendingRequests.delete(key);
    state.submittedResults.delete(key);
    state.terminalCalls.add(key);
    return Object.freeze({
      type: "tool_result_submitted",
      sessionId: event.sessionId,
      sequence: event.sequence,
      turnId: event.turnId,
      result: submitted,
    });
  }

  private completeTurn(state: DeepSeekHarnessSessionState, turnId: string): void {
    this.requireActiveTurn(state, turnId);
    if (hasPendingTurnCall(state, turnId)) {
      throw new DeepSeekHarnessProtocolError(
        "DSH completed a turn with an unresolved tool call.",
      );
    }
    state.terminalTurns.add(turnId);
    state.cancellationRequests.delete(turnId);
  }

  private cancelPendingTurn(state: DeepSeekHarnessSessionState, turnId: string): void {
    if (state.terminalTurns.has(turnId)) {
      throw new DeepSeekHarnessProtocolError("DSH emitted a duplicate terminal turn event.");
    }
    state.terminalTurns.add(turnId);
    state.cancellationRequests.delete(turnId);
    for (const [key, request] of state.pendingRequests) {
      if (request.turnId !== turnId) continue;
      state.pendingRequests.delete(key);
      state.submittedResults.delete(key);
      state.terminalCalls.add(key);
    }
  }

  private requireActiveTurn(state: DeepSeekHarnessSessionState, turnId: string): void {
    requireText(turnId, "DSH turn id");
    if (state.terminalTurns.has(turnId)) {
      throw new DeepSeekHarnessProtocolError("DSH emitted activity for a terminal turn.");
    }
  }

  private requireTransport(): DeepSeekHarnessTransport {
    if (!this.transport) throw new AgentBackendUnavailableError(this.id);
    return this.transport;
  }

  private requireSession(sessionId: string): DeepSeekHarnessSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new DeepSeekHarnessProtocolError(`Unknown DSH session "${sessionId}".`);
    return state;
  }

  private requireRunning(): void {
    if (this.stopped) throw new DeepSeekHarnessProtocolError("DeepSeek Harness backend is shut down.");
  }
}

function callKey(turnId: string, callId: string): string {
  return `${turnId}:${callId}`;
}

function sameRequestIdentity(
  expected: AgentBackendToolRequest | undefined,
  actual: AgentBackendToolRequest,
): boolean {
  return expected !== undefined
    && expected.sessionId === actual.sessionId
    && expected.turnId === actual.turnId
    && expected.callId === actual.callId
    && expected.toolName === actual.toolName;
}

function sameResultIdentity(
  request: AgentBackendToolRequest,
  result: AgentBackendToolResult,
): boolean {
  return request.sessionId === result.sessionId
    && request.turnId === result.turnId
    && request.callId === result.callId;
}

function hasPendingTurnCall(state: DeepSeekHarnessSessionState, turnId: string): boolean {
  for (const request of state.pendingRequests.values()) {
    if (request.turnId === turnId) return true;
  }
  return false;
}

function requireText(value: string, label: string): void {
  if (!value.trim()) throw new DeepSeekHarnessProtocolError(`${label} is empty.`);
}

function requireJsonValue(value: unknown, label: string): asserts value is AgentBackendJsonValue {
  if (!isJsonValue(value)) {
    throw new DeepSeekHarnessProtocolError(`${label} is not valid JSON data.`);
  }
}

function isJsonValue(value: unknown): value is AgentBackendJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isJsonValue);
}

function jsonEquals(left: AgentBackendJsonValue, right: AgentBackendJsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => jsonEquals(value, right[index]!));
  }
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) {
    return false;
  }
  const leftRecord = left as { readonly [key: string]: AgentBackendJsonValue };
  const rightRecord = right as { readonly [key: string]: AgentBackendJsonValue };
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index]
      && jsonEquals(leftRecord[key]!, rightRecord[key]!)
    ));
}
