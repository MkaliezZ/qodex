import {
  validateActionApproval,
  validateActionDecision,
  type ActionApproval,
  type ActionDecision,
  type ActionProposal,
  type JsonValue,
} from "@qodex/action-runtime";
import {
  PROJECT_COMMAND_POLICY,
  trustedProjectCommandPolicyDigest,
} from "@qodex/agent-runtime";
import {
  AgentFuseAdapter,
  type AgentFuseBridgeClient,
} from "@qodex/agentfuse-adapter";
import type {
  AppendEntryInput,
  ProjectedSessionState,
  SafeJson,
  SessionRuntime,
} from "@qodex/session-runtime";
import {
  AGENTFUSE_COMMIT,
  AGENTFUSE_POLICY,
  AGENTFUSE_PROTOCOL,
  AGENTFUSE_SCHEMA,
} from "../platform/agentFuseIdentity";
import { validateProjectCommandActionProposal } from "./projectCommandActionMapping";

const MAX_COMPLETED_DECISIONS = 128;

export interface DurableProjectCommandDecisionLedger {
  assertApproved(
    proposal: ActionProposal,
    approval: ActionApproval,
  ): Promise<void>;
  recordDurably(entry: AppendEntryInput): Promise<void>;
}

export interface ProjectCommandDecisionRecorder {
  readonly sessionId: string;
  recordDurably(entry: AppendEntryInput): Promise<void>;
}

export interface ProjectCommandDecisionCoordinatorOptions {
  adapter: AgentFuseAdapter;
  ledger: DurableProjectCommandDecisionLedger;
  clock?: () => Date;
}

export interface ProjectCommandAgentFuseAdapterOptions {
  messageIdFactory?: () => string;
  clock?: () => Date;
}

export class ProjectCommandDecisionPersistenceError extends Error {
  constructor(readonly actionId: string, readonly persistenceCause?: unknown) {
    super("The Project Command decision could not be persisted; command dispatch remains blocked.");
    this.name = "ProjectCommandDecisionPersistenceError";
  }
}

export class ProjectCommandDurableApprovalError extends Error {
  constructor() {
    super("The exact durable Project Command approval is not active.");
    this.name = "ProjectCommandDurableApprovalError";
  }
}

export class ProjectCommandDurableAllowError extends Error {
  constructor() {
    super("The exact durable Project Command allow decision is not active.");
    this.name = "ProjectCommandDurableAllowError";
  }
}

export class ProjectCommandApprovalExpiredDuringDecisionError extends Error {
  constructor() {
    super("The Project Command approval expired during policy evaluation.");
    this.name = "ProjectCommandApprovalExpiredDuringDecisionError";
  }
}

export class ProjectCommandDecisionTimeError extends Error {
  constructor() {
    super("The Project Command decision time is outside the approval window.");
    this.name = "ProjectCommandDecisionTimeError";
  }
}

export class SessionProjectCommandDecisionLedger
implements DurableProjectCommandDecisionLedger {
  constructor(
    private readonly runtime: Pick<SessionRuntime, "projectCurrentState">,
    private readonly recorder: ProjectCommandDecisionRecorder,
  ) {}

  async assertApproved(
    proposal: ActionProposal,
    approval: ActionApproval,
  ): Promise<void> {
    if (proposal.sessionId !== this.recorder.sessionId) {
      throw new ProjectCommandDurableApprovalError();
    }
    let projected: ProjectedSessionState;
    try {
      projected = await this.runtime.projectCurrentState(this.recorder.sessionId);
    } catch {
      throw new ProjectCommandDurableApprovalError();
    }
    const pending = projected.pendingAction;
    const approvalGeneration = toSessionApprovalGeneration(approval.generation);
    if (
      !pending
      || pending.kind !== "command"
      || pending.actionId !== proposal.actionId
      || pending.taskId !== proposal.taskId
      || pending.proposalDigest !== proposal.proposalDigest
      || !pending.approved
      || pending.approvalId !== approval.approvalId
      || pending.approvalGeneration !== approvalGeneration
      || pending.started
      || pending.settled
      || pending.decisionRecorded
    ) {
      throw new ProjectCommandDurableApprovalError();
    }
  }

  async assertAllowed(
    proposal: ActionProposal,
    approval: ActionApproval,
    decision: ActionDecision,
  ): Promise<void> {
    if (proposal.sessionId !== this.recorder.sessionId) {
      throw new ProjectCommandDurableAllowError();
    }
    let projected: ProjectedSessionState;
    try {
      projected = await this.runtime.projectCurrentState(this.recorder.sessionId);
    } catch {
      throw new ProjectCommandDurableAllowError();
    }
    const pending = projected.pendingAction;
    const approvalGeneration = toSessionApprovalGeneration(approval.generation);
    if (
      !pending
      || pending.kind !== "command"
      || pending.actionId !== proposal.actionId
      || pending.taskId !== proposal.taskId
      || pending.proposalDigest !== proposal.proposalDigest
      || !pending.approved
      || pending.approvalId !== approval.approvalId
      || pending.approvalGeneration !== approvalGeneration
      || pending.started
      || pending.settled
      || !pending.decisionRecorded
      || pending.decision !== "allow"
      || pending.decisionId !== decision.decisionId
      || decision.decision !== "allow"
    ) {
      throw new ProjectCommandDurableAllowError();
    }
  }

  recordDurably(entry: AppendEntryInput): Promise<void> {
    return this.recorder.recordDurably(entry);
  }
}

export class ProjectCommandDecisionCoordinator {
  private readonly inFlightDecisions = new Map<string, Promise<ActionDecision>>();
  private readonly completedDecisions = new Map<string, ActionDecision>();
  private readonly clock: () => Date;

  constructor(private readonly options: ProjectCommandDecisionCoordinatorOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  decideAndPersist(
    proposal: ActionProposal,
    approval: ActionApproval,
    signal: AbortSignal,
  ): Promise<ActionDecision> {
    const key = JSON.stringify([
      proposal.sessionId,
      proposal.actionId,
      approval.approvalId,
      approval.generation,
      proposal.proposalDigest,
    ]);
    const completed = this.completedDecisions.get(key);
    if (completed) {
      throwIfAborted(signal);
      this.completedDecisions.delete(key);
      this.completedDecisions.set(key, completed);
      return Promise.resolve(completed);
    }
    const inFlight = this.inFlightDecisions.get(key);
    if (inFlight) return inFlight;

    let tracked: Promise<ActionDecision>;
    tracked = this.decideAndPersistOnce(proposal, approval, signal)
      .then((decision) => {
        this.cacheCompleted(key, decision);
        return decision;
      })
      .finally(() => {
        if (this.inFlightDecisions.get(key) === tracked) {
          this.inFlightDecisions.delete(key);
        }
      });
    this.inFlightDecisions.set(key, tracked);
    return tracked;
  }

  private async decideAndPersistOnce(
    proposal: ActionProposal,
    approval: ActionApproval,
    signal: AbortSignal,
  ): Promise<ActionDecision> {
    await validateProjectCommandActionProposal(proposal);
    validateActionApproval(
      approval,
      proposal,
      approval.generation,
      this.trustedNow(),
    );
    await this.options.ledger.assertApproved(proposal, approval);
    throwIfAborted(signal);

    const decision = await this.options.adapter.decide(proposal, approval, signal);
    throwIfAborted(signal);
    validateActionDecision(decision, proposal);
    if (decision.decision === "hold") {
      throw new TypeError("Project Command AgentFuse decisions do not support hold.");
    }
    this.revalidateApprovalAfterDecision(proposal, approval);
    validateDecisionTimeWithinApproval(decision, approval);
    throwIfAborted(signal);

    const sessionApprovalGeneration = toSessionApprovalGeneration(approval.generation);
    const evidence = decisionEvidence(decision.evidence);
    const entry: AppendEntryInput = {
      type: "ACTION_DECIDED",
      payload: {
        actionId: proposal.actionId,
        proposalDigest: proposal.proposalDigest,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        summary: decision.summary,
        decidedAt: decision.decidedAt,
        evidence: decision.evidence as SafeJson,
      },
      safeMetadata: {
        actionId: proposal.actionId,
        taskId: proposal.taskId,
        proposalDigest: proposal.proposalDigest,
        approvalId: approval.approvalId,
        approvalGeneration: sessionApprovalGeneration,
        decisionId: decision.decisionId,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        policyVersion: decision.policyVersion,
        decisionSchemaVersion: evidence.schemaVersion,
        agentFuseCommit: evidence.agentFuseCommit,
        decidedAt: decision.decidedAt,
      },
      createdAt: decision.decidedAt,
    };
    try {
      await this.options.ledger.recordDurably(entry);
    } catch (cause) {
      throw new ProjectCommandDecisionPersistenceError(
        proposal.actionId,
        cause,
      );
    }
    return decision;
  }

  private revalidateApprovalAfterDecision(
    proposal: ActionProposal,
    approval: ActionApproval,
  ): void {
    try {
      validateActionApproval(
        approval,
        proposal,
        approval.generation,
        this.trustedNow(),
      );
    } catch (error) {
      if (isErrorWithCode(error, "approval_expired")) {
        throw new ProjectCommandApprovalExpiredDuringDecisionError();
      }
      throw error;
    }
  }

  private trustedNow(): Date {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Project Command decision validation requires a trusted current time.");
    }
    return now;
  }

  private cacheCompleted(key: string, decision: ActionDecision): void {
    this.completedDecisions.set(key, decision);
    while (this.completedDecisions.size > MAX_COMPLETED_DECISIONS) {
      const oldest = this.completedDecisions.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.completedDecisions.delete(oldest);
    }
  }
}

export async function createProjectCommandAgentFuseAdapter(
  bridge: AgentFuseBridgeClient,
  options: ProjectCommandAgentFuseAdapterOptions = {},
): Promise<AgentFuseAdapter> {
  return new AgentFuseAdapter({
    bridge,
    expectedAgentFuseCommit: AGENTFUSE_COMMIT,
    expectedProtocolVersion: AGENTFUSE_PROTOCOL,
    expectedSchemaVersion: AGENTFUSE_SCHEMA,
    expectedPolicyVersion: AGENTFUSE_POLICY,
    policyProfileId: PROJECT_COMMAND_POLICY.policyProfileId,
    expectedPolicyDigest: await trustedProjectCommandPolicyDigest(),
    ...(options.messageIdFactory ? { messageIdFactory: options.messageIdFactory } : {}),
    ...(options.clock ? { clock: options.clock } : {}),
  });
}

function toSessionApprovalGeneration(actionGeneration: number): number {
  if (!Number.isSafeInteger(actionGeneration) || actionGeneration <= 0) {
    throw new TypeError("Project Command Action approval generation is not safe.");
  }
  return actionGeneration - 1;
}

function decisionEvidence(value: JsonValue): {
  agentFuseCommit: string;
  schemaVersion: string;
} {
  if (!isRecord(value)) {
    throw new TypeError("Project Command decision evidence must be an object.");
  }
  return {
    agentFuseCommit: requiredText(value.agentFuseCommit, "agentFuseCommit"),
    schemaVersion: requiredText(value.schemaVersion, "schemaVersion"),
  };
}

function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === code;
}

function validateDecisionTimeWithinApproval(
  decision: ActionDecision,
  approval: ActionApproval,
): void {
  const decidedAt = Date.parse(decision.decidedAt);
  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (decidedAt < approvedAt || decidedAt >= expiresAt) {
    throw new ProjectCommandDecisionTimeError();
  }
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: JsonValue | undefined, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`Project Command decision evidence requires ${field}.`);
  }
  return value;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Project Command decision request was cancelled.", "AbortError");
  }
}
