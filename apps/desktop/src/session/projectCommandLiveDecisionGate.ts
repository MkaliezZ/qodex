import {
  validateActionApproval,
  type ActionApproval,
  type ActionDecision,
  type ActionProposal,
} from "@qodex/action-runtime";
import {
  PROJECT_COMMAND_POLICY,
  type PendingCommandApproval,
  type TrustedProjectCommandDefinition,
} from "@qodex/agent-runtime";
import type { AgentFuseAdapter } from "@qodex/agentfuse-adapter";
import type { SafeJson, SessionRuntime } from "@qodex/session-runtime";
import {
  ProjectCommandDecisionCoordinator,
  SessionProjectCommandDecisionLedger,
  type ProjectCommandDecisionRecorder,
} from "./projectCommandDecisionCoordinator";
import {
  createProjectCommandActionApproval,
  createProjectCommandActionProposal,
} from "./projectCommandActionMapping";

export const PROJECT_COMMAND_APPROVAL_TTL_MS = 5 * 60 * 1000;

export interface ProjectCommandLiveDecisionGateOptions {
  runtime: SessionRuntime;
  recorder: ProjectCommandDecisionRecorder;
  adapter: AgentFuseAdapter;
  projectBindingId: string;
  projectFingerprint: string;
  clock?: () => Date;
}

export interface LiveProjectCommandProposal {
  proposal: Readonly<ActionProposal>;
  pending: PendingCommandApproval;
}

export interface LiveProjectCommandDecision {
  proposal: Readonly<ActionProposal>;
  approval: Readonly<ActionApproval>;
  decision: ActionDecision;
}

export class ProjectCommandLiveDecisionGate {
  private readonly clock: () => Date;
  private readonly ledger: SessionProjectCommandDecisionLedger;
  private readonly coordinator: ProjectCommandDecisionCoordinator;

  constructor(private readonly options: ProjectCommandLiveDecisionGateOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.ledger = new SessionProjectCommandDecisionLedger(
      options.runtime,
      options.recorder,
    );
    this.coordinator = new ProjectCommandDecisionCoordinator({
      adapter: options.adapter,
      ledger: this.ledger,
      clock: this.clock,
    });
  }

  async propose(
    taskId: string,
    pending: PendingCommandApproval,
    requestedAt: string,
  ): Promise<LiveProjectCommandProposal> {
    const proposal = await createProjectCommandActionProposal({
      command: pending.command as TrustedProjectCommandDefinition,
      toolCallId: pending.toolCall.id,
      taskId,
      sessionId: this.options.recorder.sessionId,
      projectBindingId: this.options.projectBindingId,
      projectFingerprint: this.options.projectFingerprint,
      requestedAt,
    });
    await this.options.recorder.recordDurably({
      type: "COMMAND_PROPOSED",
      payload: commandProposalPayload(pending, proposal),
      safeMetadata: {
        recordKey: `command-proposed:${proposal.actionId}`,
        taskId,
        toolCallId: pending.toolCall.id,
        actionId: proposal.actionId,
        proposalDigest: proposal.proposalDigest,
        policyProfileId: PROJECT_COMMAND_POLICY.policyProfileId,
        requestedAt: proposal.requestedAt,
      },
      createdAt: proposal.requestedAt,
    });
    return { proposal, pending };
  }

  async approveAndDecide(
    proposed: LiveProjectCommandProposal,
    approvalId: string,
    signal: AbortSignal,
  ): Promise<LiveProjectCommandDecision> {
    throwIfAborted(signal);
    const projected = await this.options.runtime.projectCurrentState(
      this.options.recorder.sessionId,
    );
    const pending = projected.pendingAction;
    if (
      !pending
      || pending.kind !== "command"
      || pending.actionId !== proposed.proposal.actionId
      || pending.taskId !== proposed.proposal.taskId
      || pending.proposalDigest !== proposed.proposal.proposalDigest
      || pending.approved
      || pending.started
      || pending.settled
      || pending.decisionRecorded
    ) {
      throw new Error("The live Project Command proposal is no longer current.");
    }

    const approvedAt = this.trustedNow();
    const expiresAt = new Date(
      approvedAt.getTime() + PROJECT_COMMAND_APPROVAL_TTL_MS,
    );
    const approval = await createProjectCommandActionApproval({
      proposal: proposed.proposal,
      approvalId,
      sessionApprovalGeneration: pending.approvalGeneration,
      approvedAt: approvedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      now: approvedAt,
    });
    throwIfAborted(signal);
    await this.options.recorder.recordDurably({
      type: "COMMAND_APPROVED",
      payload: { actionId: proposed.proposal.actionId },
      safeMetadata: {
        recordKey: `command-approved:${proposed.proposal.actionId}`,
        taskId: proposed.proposal.taskId,
        toolCallId: proposed.pending.toolCall.id,
        actionId: proposed.proposal.actionId,
        proposalDigest: proposed.proposal.proposalDigest,
        approvalId: approval.approvalId,
        approvalGeneration: pending.approvalGeneration,
        approvedAt: approval.approvedAt,
        expiresAt: approval.expiresAt,
      },
      createdAt: approval.approvedAt,
    });
    throwIfAborted(signal);
    const decision = await this.coordinator.decideAndPersist(
      proposed.proposal,
      approval,
      signal,
    );
    return { proposal: proposed.proposal, approval, decision };
  }

  async recordStarted(
    context: LiveProjectCommandDecision,
    pending: PendingCommandApproval,
    executionReceiptId: string,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    validateActionApproval(
      context.approval,
      context.proposal,
      context.approval.generation,
      this.trustedNow(),
    );
    await this.ledger.assertAllowed(
      context.proposal,
      context.approval,
      context.decision,
    );
    throwIfAborted(signal);
    const approvalGeneration = context.approval.generation - 1;
    await this.options.recorder.recordDurably({
      type: "COMMAND_STARTED",
      payload: {
        actionId: context.proposal.actionId,
        commandId: pending.command.id,
      },
      safeMetadata: {
        recordKey: `command-started:${context.proposal.actionId}`,
        taskId: context.proposal.taskId,
        toolCallId: pending.toolCall.id,
        actionId: context.proposal.actionId,
        proposalDigest: context.proposal.proposalDigest,
        approvalId: context.approval.approvalId,
        approvalGeneration,
        decisionId: context.decision.decisionId,
        executionReceiptId,
        executionStatus: "running",
      },
    });
  }

  private trustedNow(): Date {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Project Command lifecycle requires a trusted current time.");
    }
    return now;
  }
}

function commandProposalPayload(
  pending: PendingCommandApproval,
  proposal: ActionProposal,
): SafeJson {
  return {
    actionId: proposal.actionId,
    toolCallId: pending.toolCall.id,
    proposalDigest: proposal.proposalDigest,
    requestedAt: proposal.requestedAt,
    command: {
      id: pending.command.id,
      label: pending.command.label,
      executable: pending.command.executable,
      args: [...pending.command.args],
      cwd: pending.command.cwd,
      source: pending.command.source,
      category: pending.command.category,
      catalogDigest: pending.command.catalogDigest ?? "unavailable",
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException(
      "Project Command decision request was cancelled.",
      "AbortError",
    );
  }
}
