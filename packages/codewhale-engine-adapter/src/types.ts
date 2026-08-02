export type AgentEngineProcessStatus =
  | "stopped"
  | "starting"
  | "healthy"
  | "stopping"
  | "failed";

export type AgentEngineErrorCode =
  | "identity_mismatch"
  | "digest_mismatch"
  | "unsafe_tool_surface"
  | "invalid_runtime_response"
  | "runtime_unavailable"
  | "runtime_timeout"
  | "runtime_exited"
  | "wrong_call_identity"
  | "duplicate_result"
  | "call_terminal"
  | "not_started";

export class AgentEngineError extends Error {
  constructor(
    readonly code: AgentEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentEngineError";
  }
}

export interface AgentEngineIdentity {
  readonly engineId: "codewhale";
  readonly sourceRepository: string;
  readonly sourceCommit: string;
  readonly sourceArchiveSha256: string;
  readonly executableSha256: string;
  readonly transport: "authenticated_loopback_http_sse";
}

export interface AgentEngineProcess {
  readonly status: AgentEngineProcessStatus;
  readonly pid?: number;
  readonly startedAt?: string;
}

export interface AgentEngineSession {
  readonly sessionId: string;
  readonly workspaceIdentity: string;
}

export interface AgentEngineTurn {
  readonly sessionId: string;
  readonly turnId: string;
  readonly status: "queued" | "in_progress" | "completed" | "failed" | "interrupted" | "canceled";
}

export interface AgentEngineEventCursor {
  readonly sessionId: string;
  readonly sequence: number;
}

export interface AgentEngineEvent {
  readonly cursor: AgentEngineEventCursor;
  readonly turnId?: string;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface DynamicToolRequest {
  readonly sessionId: string;
  readonly turnId: string;
  readonly callId: string;
  readonly namespace: string;
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface DynamicToolResult {
  readonly success: boolean;
  readonly content: readonly {
    readonly type: "input_text";
    readonly text: string;
  }[];
}

export interface AgentEngineInspection {
  readonly identity: AgentEngineIdentity;
  readonly process: AgentEngineProcess;
  readonly managedProfileDigest: string;
  readonly toolSurfaceDigest: string;
  readonly outcome: "ADAPTER_ONLY_PASS" | "THIN_FORK_REQUIRED";
}

export interface AgentEngineSubscription {
  close(): Promise<void>;
}

export interface AgentEngine {
  inspect(): Promise<AgentEngineInspection>;
  start(): Promise<AgentEngineProcess>;
  health(): Promise<AgentEngineProcess>;
  createSession(workspaceIdentity: string): Promise<AgentEngineSession>;
  startTurn(sessionId: string, prompt: string): Promise<AgentEngineTurn>;
  subscribeEvents(
    sessionId: string,
    cursor: AgentEngineEventCursor | undefined,
    listener: (event: AgentEngineEvent) => void,
  ): Promise<AgentEngineSubscription>;
  interruptTurn(sessionId: string, turnId: string): Promise<AgentEngineTurn>;
  submitToolResult(request: DynamicToolRequest, result: DynamicToolResult): Promise<void>;
  shutdown(): Promise<void>;
}
