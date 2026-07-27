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
  SafeJson,
} from "@qodex/session-runtime";
import {
  AGENTFUSE_COMMIT,
  AGENTFUSE_POLICY,
  AGENTFUSE_PROTOCOL,
  AGENTFUSE_SCHEMA,
} from "../platform/agentFuseIdentity";
import { validateProjectCommandActionProposal } from "./projectCommandActionMapping";

export interface DurableProjectCommandDecisionRecorder {
  recordDurably(entry: AppendEntryInput): Promise<void>;
}

export interface ProjectCommandDecisionCoordinatorOptions {
  adapter: AgentFuseAdapter;
  recorder: DurableProjectCommandDecisionRecorder;
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

export class ProjectCommandDecisionCoordinator {
  private readonly decisions = new Map<string, Promise<ActionDecision>>();
  private readonly clock;

  constructor(private readonly options: ProjectCommandDecisionCoordinatorOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  decideAndPersist(
    proposal: ActionProposal,
    approval: ActionApproval,
    signal: AbortSignal,
  ): Promise<ActionDecision> {
    const key = JSON.stringify([
      proposal.actionId,
      approval.approvalId,
      approval.generation,
      proposal.proposalDigest,
    ]);
    const existing = this.decisions.get(key);
    if (existing) return existing;
    const operation = this.decideAndPersistOnce(proposal, approval, signal);
    this.decisions.set(key, operation);
    return operation;
  }

  private async decideAndPersistOnce(
    proposal: ActionProposal,
    approval: ActionApproval,
    signal: AbortSignal,
  ): Promise<ActionDecision> {
    await validateProjectCommandActionProposal(proposal);
    validateActionApproval(approval, proposal, approval.generation, this.clock());
    const sessionApprovalGeneration = toSessionApprovalGeneration(approval.generation);
    throwIfAborted(signal);

    const decision = await this.options.adapter.decide(proposal, approval, signal);
    validateActionDecision(decision, proposal);
    if (decision.decision === "hold") {
      throw new TypeError("Project Command AgentFuse decisions do not support hold.");
    }
    throwIfAborted(signal);

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
      await this.options.recorder.recordDurably(entry);
    } catch (cause) {
      throw new ProjectCommandDecisionPersistenceError(
        proposal.actionId,
        cause,
      );
    }
    return decision;
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
