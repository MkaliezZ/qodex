import type {
  AgentBackend,
  AgentBackendEvent,
  AgentBackendEventListener,
  AgentBackendEventStream,
  AgentBackendJsonValue,
  AgentBackendMessage,
  AgentBackendSession,
  AgentBackendSessionInput,
  AgentBackendToolRequest,
  AgentBackendToolResult,
  AgentBackendTurn,
} from "./types.js";

export type MockAgentBackendEventTemplate =
  | {
      readonly type: "message";
      readonly role?: "user" | "model";
      readonly content: string;
    }
  | {
      readonly type: "tool_request";
      readonly callId: string;
      readonly toolName: string;
      readonly arguments: AgentBackendJsonValue;
    }
  | {
      readonly type: "turn_completed";
    }
  | {
      readonly type: "turn_cancelled";
      readonly reason?: string;
    }
  | {
      readonly type: "error";
      readonly message: string;
    };

export interface MockAgentBackendOptions {
  readonly turns?: readonly (readonly MockAgentBackendEventTemplate[])[];
}

interface MockSessionState {
  sequence: number;
  readonly events: AgentBackendEvent[];
  readonly listeners: Set<AgentBackendEventListener>;
  readonly pendingRequests: Map<string, AgentBackendToolRequest>;
  readonly completedTurns: Set<string>;
}

export class MockAgentBackend implements AgentBackend {
  readonly id = "mock-agent-backend";

  private readonly sessions = new Map<string, MockSessionState>();
  private readonly turnScripts: readonly (readonly MockAgentBackendEventTemplate[])[];
  private sessionCount = 0;
  private turnCount = 0;
  private stopped = false;
  private readonly recordedMessages: Array<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly message: AgentBackendMessage;
  }> = [];
  private readonly recordedToolResults: AgentBackendToolResult[] = [];

  constructor(options: MockAgentBackendOptions = {}) {
    this.turnScripts = options.turns ?? [];
  }

  get sentMessages(): readonly Readonly<{
    sessionId: string;
    turnId: string;
    message: AgentBackendMessage;
  }>[] {
    return this.recordedMessages;
  }

  get submittedToolResults(): readonly AgentBackendToolResult[] {
    return this.recordedToolResults;
  }

  async startSession(input: AgentBackendSessionInput): Promise<AgentBackendSession> {
    this.requireRunning();
    const sessionId = input.sessionId ?? `mock-session-${++this.sessionCount}`;
    if (this.sessions.has(sessionId)) {
      throw new Error(`Agent backend session already exists: ${sessionId}`);
    }
    this.sessions.set(sessionId, {
      sequence: 0,
      events: [],
      listeners: new Set(),
      pendingRequests: new Map(),
      completedTurns: new Set(),
    });
    this.emit(sessionId, { type: "session_started", sessionId, sequence: 0 });
    return Object.freeze({
      sessionId,
      ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
    });
  }

  async sendMessage(sessionId: string, message: AgentBackendMessage): Promise<AgentBackendTurn> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    if (!message.content.trim()) throw new TypeError("Agent backend messages cannot be empty.");
    const turnId = `mock-turn-${++this.turnCount}`;
    this.recordedMessages.push(Object.freeze({ sessionId, turnId, message: Object.freeze({ ...message }) }));

    const script = this.turnScripts[this.turnCount - 1] ?? [
      { type: "message", role: "model", content: `[mock] ${message.content}` },
      { type: "turn_completed" },
    ];
    for (const template of script) this.emitTemplate(state, sessionId, turnId, template);
    return Object.freeze({ sessionId, turnId });
  }

  async streamEvents(
    sessionId: string,
    afterSequence: number | undefined,
    listener: AgentBackendEventListener,
  ): Promise<AgentBackendEventStream> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    const cursor = afterSequence ?? 0;
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new TypeError("Agent backend event cursor must be a non-negative integer.");
    }
    for (const event of state.events) {
      if (event.sequence > cursor) listener(event);
    }
    state.listeners.add(listener);
    let closed = false;
    return {
      close: async () => {
        if (closed) return;
        closed = true;
        state.listeners.delete(listener);
      },
    };
  }

  async submitToolResult(
    request: AgentBackendToolRequest,
    result: AgentBackendToolResult,
  ): Promise<void> {
    this.requireRunning();
    const state = this.requireSession(request.sessionId);
    const key = requestKey(request.turnId, request.callId);
    const pending = state.pendingRequests.get(key);
    if (
      !pending
      || pending.sessionId !== request.sessionId
      || pending.turnId !== request.turnId
      || pending.callId !== request.callId
      || pending.toolName !== request.toolName
    ) {
      throw new Error("Tool result does not match a pending backend request.");
    }
    if (
      result.sessionId !== request.sessionId
      || result.turnId !== request.turnId
      || result.callId !== request.callId
    ) {
      throw new Error("Tool result identity does not match the backend request.");
    }
    state.pendingRequests.delete(key);
    this.recordedToolResults.push(Object.freeze({ ...result }));
    this.emit(request.sessionId, {
      type: "tool_result_submitted",
      sessionId: request.sessionId,
      turnId: request.turnId,
      sequence: 0,
      result: Object.freeze({ ...result }),
    });
    if (!hasPendingTurnRequest(state, request.turnId) && !state.completedTurns.has(request.turnId)) {
      state.completedTurns.add(request.turnId);
      this.emit(request.sessionId, {
        type: "turn_completed",
        sessionId: request.sessionId,
        turnId: request.turnId,
        sequence: 0,
      });
    }
  }

  async shutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const state of this.sessions.values()) state.listeners.clear();
  }

  private emitTemplate(
    state: MockSessionState,
    sessionId: string,
    turnId: string,
    template: MockAgentBackendEventTemplate,
  ): void {
    if (template.type === "message") {
      this.emit(sessionId, {
        type: "message",
        sessionId,
        turnId,
        sequence: 0,
        message: Object.freeze({ role: template.role ?? "model", content: template.content }),
      });
      return;
    }
    if (template.type === "tool_request") {
      const request: AgentBackendToolRequest = Object.freeze({
        sessionId,
        turnId,
        callId: template.callId,
        toolName: template.toolName,
        arguments: template.arguments,
      });
      state.pendingRequests.set(requestKey(turnId, template.callId), request);
      this.emit(sessionId, {
        type: "tool_request",
        sessionId,
        turnId,
        sequence: 0,
        request,
      });
      return;
    }
    if (template.type === "error") {
      this.emit(sessionId, {
        type: "error",
        sessionId,
        turnId,
        sequence: 0,
        message: template.message,
      });
      return;
    }
    if (template.type === "turn_cancelled") {
      state.completedTurns.add(turnId);
      for (const [key, request] of state.pendingRequests) {
        if (request.turnId === turnId) state.pendingRequests.delete(key);
      }
      this.emit(sessionId, {
        type: "turn_cancelled",
        sessionId,
        turnId,
        sequence: 0,
        ...(template.reason ? { reason: template.reason } : {}),
      });
      return;
    }
    state.completedTurns.add(turnId);
    this.emit(sessionId, {
      type: "turn_completed",
      sessionId,
      turnId,
      sequence: 0,
    });
  }

  private emit(sessionId: string, event: AgentBackendEvent): void {
    const state = this.requireSession(sessionId);
    const sequenced = Object.freeze({ ...event, sequence: ++state.sequence }) as AgentBackendEvent;
    state.events.push(sequenced);
    for (const listener of state.listeners) listener(sequenced);
  }

  private requireSession(sessionId: string): MockSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Unknown agent backend session: ${sessionId}`);
    return state;
  }

  private requireRunning(): void {
    if (this.stopped) throw new Error("Mock agent backend is shut down.");
  }
}

function requestKey(turnId: string, callId: string): string {
  return `${turnId}:${callId}`;
}

function hasPendingTurnRequest(state: MockSessionState, turnId: string): boolean {
  for (const request of state.pendingRequests.values()) {
    if (request.turnId === turnId) return true;
  }
  return false;
}
