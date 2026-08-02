import { CODEWHALE_PINNED_IDENTITY } from "./identity.js";
import { managedProfileDigest } from "./profile.js";
import { DynamicToolSettlementGuard, EventCursorGate, KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL } from "./proposal.js";
import type { ManagedCodeWhaleSupervisor, SupervisorStartInput } from "./supervisor.js";
import type { ToolSurfaceAssessment } from "./toolSurface.js";
import {
  AgentEngineError,
  type AgentEngine,
  type AgentEngineEvent,
  type AgentEngineEventCursor,
  type AgentEngineInspection,
  type AgentEngineProcess,
  type AgentEngineSession,
  type AgentEngineSubscription,
  type AgentEngineTurn,
  type DynamicToolRequest,
  type DynamicToolResult,
} from "./types.js";

export interface CodeWhaleRuntimeClient {
  createThread(input: Readonly<Record<string, unknown>>): Promise<unknown>;
  startTurn(sessionId: string, input: Readonly<Record<string, unknown>>): Promise<unknown>;
  subscribe(
    sessionId: string,
    sinceSequence: number,
    listener: (event: unknown) => void,
  ): Promise<AgentEngineSubscription>;
  interruptTurn(sessionId: string, turnId: string): Promise<unknown>;
  submitToolResult(
    sessionId: string,
    turnId: string,
    callId: string,
    result: DynamicToolResult,
  ): Promise<void>;
}

export interface CodeWhaleAdapterOptions {
  readonly supervisor: ManagedCodeWhaleSupervisor;
  readonly supervisorStart: SupervisorStartInput;
  readonly runtime: CodeWhaleRuntimeClient;
  readonly toolSurface: ToolSurfaceAssessment;
}

export class CodeWhaleAgentEngineAdapter implements AgentEngine {
  private readonly settlements = new DynamicToolSettlementGuard();

  constructor(private readonly options: CodeWhaleAdapterOptions) {}

  async inspect(): Promise<AgentEngineInspection> {
    return Object.freeze({
      identity: CODEWHALE_PINNED_IDENTITY,
      process: this.options.supervisor.inspect(),
      managedProfileDigest: await managedProfileDigest(),
      toolSurfaceDigest: this.options.toolSurface.digest,
      outcome: this.options.toolSurface.outcome,
    });
  }

  start(): Promise<AgentEngineProcess> {
    return this.options.supervisor.start(this.options.supervisorStart);
  }

  async health(): Promise<AgentEngineProcess> {
    const process = this.options.supervisor.inspect();
    if (process.status !== "healthy") {
      throw new AgentEngineError("not_started", "The managed CodeWhale process is not healthy.");
    }
    return process;
  }

  async createSession(workspaceIdentity: string): Promise<AgentEngineSession> {
    await this.health();
    const wire = await this.options.runtime.createThread({
      workspace: workspaceIdentity,
      mode: "plan",
      permission_posture: "never",
      allow_shell: false,
      trust_mode: false,
      auto_approve: false,
      dynamic_tools: [KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL],
    });
    const record = recordValue(wire);
    const sessionId = text(record.id);
    if (!sessionId) throw invalidResponse("thread id");
    return Object.freeze({ sessionId, workspaceIdentity });
  }

  async startTurn(sessionId: string, prompt: string): Promise<AgentEngineTurn> {
    await this.health();
    if (!text(sessionId) || !text(prompt)) throw new TypeError("A bounded session and prompt are required.");
    const wire = await this.options.runtime.startTurn(sessionId, {
      prompt,
      mode: "plan",
      permission_posture: "never",
      allow_shell: false,
      trust_mode: false,
      auto_approve: false,
      dynamic_tools: [KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL],
    });
    return parseTurn(wire, sessionId);
  }

  async subscribeEvents(
    sessionId: string,
    cursor: AgentEngineEventCursor | undefined,
    listener: (event: AgentEngineEvent) => void,
  ): Promise<AgentEngineSubscription> {
    await this.health();
    if (cursor && cursor.sessionId !== sessionId) {
      throw new AgentEngineError("wrong_call_identity", "The event cursor belongs to another session.");
    }
    const gate = new EventCursorGate(sessionId, cursor?.sequence ?? 0);
    return this.options.runtime.subscribe(sessionId, gate.current(), (wire) => {
      const event = parseEvent(wire, sessionId);
      if (gate.accept({ sessionId, sequence: event.cursor.sequence })) listener(event);
    });
  }

  async interruptTurn(sessionId: string, turnId: string): Promise<AgentEngineTurn> {
    await this.health();
    return parseTurn(await this.options.runtime.interruptTurn(sessionId, turnId), sessionId);
  }

  async submitToolResult(request: DynamicToolRequest, result: DynamicToolResult): Promise<void> {
    await this.health();
    this.settlements.validateResultRoute(request);
    await this.options.runtime.submitToolResult(request.sessionId, request.turnId, request.callId, result);
    this.settlements.accept(request, result);
  }

  registerToolRequest(request: DynamicToolRequest): void {
    this.settlements.register(request);
  }

  shutdown(): Promise<void> {
    return this.options.supervisor.shutdown();
  }
}

function parseTurn(value: unknown, sessionId: string): AgentEngineTurn {
  const record = recordValue(value);
  const turn = "turn" in record ? recordValue(record.turn) : record;
  const turnId = text(turn.id);
  const status = turn.status;
  if (!turnId || !isTurnStatus(status)) throw invalidResponse("turn");
  return Object.freeze({ sessionId, turnId, status });
}

function parseEvent(value: unknown, sessionId: string): AgentEngineEvent {
  const record = recordValue(value);
  const sequence = record.sequence ?? record.seq;
  const type = text(record.type);
  const payload = record.payload;
  if (!Number.isSafeInteger(sequence) || Number(sequence) < 1 || !type || !isRecord(payload)) {
    throw invalidResponse("event");
  }
  const turnId = text(record.turn_id) ?? undefined;
  return Object.freeze({
    cursor: Object.freeze({ sessionId, sequence: Number(sequence) }),
    ...(turnId ? { turnId } : {}),
    type,
    payload: Object.freeze({ ...payload }),
  });
}

function isTurnStatus(value: unknown): value is AgentEngineTurn["status"] {
  return ["queued", "in_progress", "completed", "failed", "interrupted", "canceled"].includes(String(value));
}

function recordValue(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidResponse("object");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function invalidResponse(surface: string): AgentEngineError {
  return new AgentEngineError("invalid_runtime_response", `CodeWhale returned an invalid ${surface} response.`);
}
