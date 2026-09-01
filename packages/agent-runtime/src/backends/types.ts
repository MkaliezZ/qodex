export type AgentBackendJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly AgentBackendJsonValue[]
  | { readonly [key: string]: AgentBackendJsonValue };

export interface AgentBackendSessionInput {
  /** Optional KerniQ-owned correlation ID. The backend must not treat it as authority. */
  readonly sessionId?: string;
  readonly workspaceIdentity?: string;
}

export interface AgentBackendSession {
  readonly sessionId: string;
  readonly workspaceIdentity?: string;
}

export interface AgentBackendMessage {
  readonly role: "user" | "model";
  readonly content: string;
}

export interface AgentBackendTurn {
  readonly sessionId: string;
  readonly turnId: string;
}

export interface AgentBackendToolRequest {
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly toolName: string;
  readonly arguments: AgentBackendJsonValue;
}

export interface AgentBackendToolResult {
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly success: boolean;
  readonly content: AgentBackendJsonValue;
}

interface AgentBackendEventBase {
  readonly sessionId: string;
  readonly sequence: number;
}

export interface AgentBackendSessionStartedEvent extends AgentBackendEventBase {
  readonly type: "session_started";
}

export interface AgentBackendMessageEvent extends AgentBackendEventBase {
  readonly type: "message";
  readonly turnId: string;
  readonly message: AgentBackendMessage;
}

export interface AgentBackendToolRequestEvent extends AgentBackendEventBase {
  readonly type: "tool_request";
  readonly turnId: string;
  readonly request: AgentBackendToolRequest;
}

export interface AgentBackendToolResultSubmittedEvent extends AgentBackendEventBase {
  readonly type: "tool_result_submitted";
  readonly turnId: string;
  readonly result: AgentBackendToolResult;
}

export interface AgentBackendTurnCompletedEvent extends AgentBackendEventBase {
  readonly type: "turn_completed";
  readonly turnId: string;
}

export interface AgentBackendTurnCancelledEvent extends AgentBackendEventBase {
  readonly type: "turn_cancelled";
  readonly turnId: string;
  readonly reason?: string;
}

export interface AgentBackendErrorEvent extends AgentBackendEventBase {
  readonly type: "error";
  readonly turnId?: string;
  readonly message: string;
}

export type AgentBackendEvent =
  | AgentBackendSessionStartedEvent
  | AgentBackendMessageEvent
  | AgentBackendToolRequestEvent
  | AgentBackendToolResultSubmittedEvent
  | AgentBackendTurnCompletedEvent
  | AgentBackendTurnCancelledEvent
  | AgentBackendErrorEvent;

export type AgentBackendEventListener = (event: AgentBackendEvent) => void;

export interface AgentBackendEventStream {
  close(): Promise<void>;
}

/**
 * Transport contract for an external agent engine.
 *
 * Tool requests cross this boundary as inert data. KerniQ remains responsible
 * for policy, approval, durable evidence, execution, settlement, and rollback.
 */
export interface AgentBackend {
  readonly id: string;
  startSession(input: AgentBackendSessionInput): Promise<AgentBackendSession>;
  sendMessage(sessionId: string, message: AgentBackendMessage): Promise<AgentBackendTurn>;
  streamEvents(
    sessionId: string,
    afterSequence: number | undefined,
    listener: AgentBackendEventListener,
  ): Promise<AgentBackendEventStream>;
  submitToolResult(
    request: AgentBackendToolRequest,
    result: AgentBackendToolResult,
  ): Promise<void>;
  shutdown(): Promise<void>;
}

export class AgentBackendUnavailableError extends Error {
  constructor(readonly backendId: string) {
    super(`Agent backend "${backendId}" is a placeholder and is not available.`);
    this.name = "AgentBackendUnavailableError";
  }
}
