import type {
  AgentBackendMessage,
  AgentBackendJsonValue,
  AgentBackendSession,
  AgentBackendSessionInput,
  AgentBackendToolResult,
  AgentBackendTurn,
  DeepSeekHarnessTransport,
  DeepSeekHarnessTransportEvent,
  DeepSeekHarnessTransportStream,
} from "../../src/index.js";

export type MockDeepSeekHarnessEvent =
  | { readonly type: "model.output"; readonly turnId: string; readonly content: string }
  | {
      readonly type: "tool_call.requested";
      readonly turnId: string;
      readonly callId: string;
      readonly toolName: string;
      readonly arguments: AgentBackendJsonValue;
    }
  | {
      readonly type: "tool_call.resolved";
      readonly turnId: string;
      readonly callId: string;
      readonly success: boolean;
      readonly content: AgentBackendToolResult["content"];
    }
  | { readonly type: "turn.completed"; readonly turnId: string }
  | { readonly type: "turn.cancelled"; readonly turnId: string; readonly reason?: string }
  | { readonly type: "runtime.error"; readonly turnId?: string; readonly message: string };

interface MockSessionState {
  sequence: number;
  readonly events: DeepSeekHarnessTransportEvent[];
  readonly listeners: Set<(event: DeepSeekHarnessTransportEvent) => void>;
}

export interface MockDeepSeekHarnessTransportOptions {
  readonly onMessage?: (
    transport: MockDeepSeekHarnessTransport,
    turn: AgentBackendTurn,
    message: AgentBackendMessage,
  ) => void;
  readonly onToolResult?: (
    transport: MockDeepSeekHarnessTransport,
    result: AgentBackendToolResult,
  ) => void;
  readonly onCancel?: (
    transport: MockDeepSeekHarnessTransport,
    sessionId: string,
    turnId: string,
  ) => void;
}

export class MockDeepSeekHarnessTransport implements DeepSeekHarnessTransport {
  readonly sentMessages: Array<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly message: AgentBackendMessage;
  }> = [];
  readonly submittedResults: AgentBackendToolResult[] = [];
  readonly cancelledTurns: Array<{ readonly sessionId: string; readonly turnId: string }> = [];
  readonly toolExecutionCount = 0;

  private readonly sessions = new Map<string, MockSessionState>();
  private sessionCount = 0;
  private turnCount = 0;
  private stopped = false;

  constructor(private readonly options: MockDeepSeekHarnessTransportOptions = {}) {}

  async startSession(input: AgentBackendSessionInput): Promise<AgentBackendSession> {
    this.requireRunning();
    const sessionId = input.sessionId ?? `dsh-session-${++this.sessionCount}`;
    if (this.sessions.has(sessionId)) throw new Error(`Duplicate mock DSH session: ${sessionId}`);
    this.sessions.set(sessionId, { sequence: 0, events: [], listeners: new Set() });
    this.emitSessionStarted(sessionId);
    return {
      sessionId,
      ...(input.workspaceIdentity ? { workspaceIdentity: input.workspaceIdentity } : {}),
    };
  }

  async sendMessage(
    sessionId: string,
    message: AgentBackendMessage,
  ): Promise<AgentBackendTurn> {
    this.requireRunning();
    this.requireSession(sessionId);
    const turn = { sessionId, turnId: `dsh-turn-${++this.turnCount}` };
    this.sentMessages.push({ sessionId, turnId: turn.turnId, message });
    this.options.onMessage?.(this, turn, message);
    return turn;
  }

  async streamEvents(
    sessionId: string,
    afterSequence: number | undefined,
    listener: (event: DeepSeekHarnessTransportEvent) => void,
  ): Promise<DeepSeekHarnessTransportStream> {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    const cursor = afterSequence ?? 0;
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

  async submitToolResult(result: AgentBackendToolResult): Promise<void> {
    this.requireRunning();
    this.requireSession(result.sessionId);
    this.submittedResults.push(result);
    if (this.options.onToolResult) {
      this.options.onToolResult(this, result);
      return;
    }
    this.emit(result.sessionId, {
      type: "tool_call.resolved",
      turnId: result.turnId,
      callId: result.callId,
      success: result.success,
      content: result.content,
    });
  }

  async cancelTurn(sessionId: string, turnId: string): Promise<void> {
    this.requireRunning();
    this.requireSession(sessionId);
    this.cancelledTurns.push({ sessionId, turnId });
    if (this.options.onCancel) {
      this.options.onCancel(this, sessionId, turnId);
      return;
    }
    this.emit(sessionId, { type: "turn.cancelled", turnId, reason: "cancelled_by_kerniq" });
  }

  async shutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    for (const state of this.sessions.values()) state.listeners.clear();
  }

  emit(sessionId: string, event: MockDeepSeekHarnessEvent): DeepSeekHarnessTransportEvent {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    return this.deliver(state, sessionId, event, ++state.sequence);
  }

  emitAtSequence(
    sessionId: string,
    sequence: number,
    event: MockDeepSeekHarnessEvent,
  ): DeepSeekHarnessTransportEvent {
    this.requireRunning();
    const state = this.requireSession(sessionId);
    state.sequence = Math.max(state.sequence, sequence);
    return this.deliver(state, sessionId, event, sequence);
  }

  private deliver(
    state: MockSessionState,
    sessionId: string,
    event: MockDeepSeekHarnessEvent,
    sequence: number,
  ): DeepSeekHarnessTransportEvent {
    const sequenced = Object.freeze({
      ...event,
      sessionId,
      sequence,
    }) as DeepSeekHarnessTransportEvent;
    state.events.push(sequenced);
    for (const listener of state.listeners) listener(sequenced);
    return sequenced;
  }

  private emitSessionStarted(sessionId: string): void {
    const state = this.requireSession(sessionId);
    const event = Object.freeze({
      type: "session.started" as const,
      sessionId,
      sequence: ++state.sequence,
    });
    state.events.push(event);
    for (const listener of state.listeners) listener(event);
  }

  private requireSession(sessionId: string): MockSessionState {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Unknown mock DSH session: ${sessionId}`);
    return state;
  }

  private requireRunning(): void {
    if (this.stopped) throw new Error("Mock DSH transport is shut down.");
  }
}
