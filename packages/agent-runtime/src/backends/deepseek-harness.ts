import {
  AgentBackendUnavailableError,
  type AgentBackend,
  type AgentBackendEventListener,
  type AgentBackendEventStream,
  type AgentBackendMessage,
  type AgentBackendSession,
  type AgentBackendSessionInput,
  type AgentBackendToolRequest,
  type AgentBackendToolResult,
  type AgentBackendTurn,
} from "./types.js";

/** Future adapter location. No DeepSeek Harness runtime is connected yet. */
export class DeepSeekHarnessBackend implements AgentBackend {
  readonly id = "deepseek-harness";

  startSession(_input: AgentBackendSessionInput): Promise<AgentBackendSession> {
    return Promise.reject(this.unavailable());
  }

  sendMessage(_sessionId: string, _message: AgentBackendMessage): Promise<AgentBackendTurn> {
    return Promise.reject(this.unavailable());
  }

  streamEvents(
    _sessionId: string,
    _afterSequence: number | undefined,
    _listener: AgentBackendEventListener,
  ): Promise<AgentBackendEventStream> {
    return Promise.reject(this.unavailable());
  }

  submitToolResult(
    _request: AgentBackendToolRequest,
    _result: AgentBackendToolResult,
  ): Promise<void> {
    return Promise.reject(this.unavailable());
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  private unavailable(): AgentBackendUnavailableError {
    return new AgentBackendUnavailableError(this.id);
  }
}
