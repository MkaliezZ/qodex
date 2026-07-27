import {
  validateActionApproval,
  type ActionApproval,
  type ActionDecision,
  type ActionProposal,
} from "@qodex/action-runtime";
import {
  PROJECT_COMMAND_POLICY,
  trustedProjectCommandPolicyDigest,
  type PendingCommandApproval,
  type ProjectCommandActionParameters,
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
  validateProjectCommandActionProposal,
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
  command: TrustedProjectCommandDefinition;
}

export interface LiveProjectCommandStartReceipt {
  readonly command: TrustedProjectCommandDefinition;
  readonly decisionId: string;
  readonly executionReceiptId: string;
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
    return {
      proposal: proposed.proposal,
      approval,
      decision,
      command: proposed.pending.command as TrustedProjectCommandDefinition,
    };
  }

  async recordStarted(
    context: LiveProjectCommandDecision,
    pending: PendingCommandApproval,
    executionReceiptId: string,
    signal: AbortSignal,
  ): Promise<Readonly<LiveProjectCommandStartReceipt>> {
    throwIfAborted(signal);
    validateActionApproval(
      context.approval,
      context.proposal,
      context.approval.generation,
      this.trustedNow(),
    );
    await assertProjectCommandDispatchIdentity(
      context.proposal,
      pending,
      context.command,
      this.options.projectBindingId,
      this.options.projectFingerprint,
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
    return Object.freeze({
      command: context.command,
      decisionId: context.decision.decisionId,
      executionReceiptId,
    });
  }

  release(context: LiveProjectCommandDecision): void {
    this.coordinator.release(context.proposal, context.approval);
  }

  private trustedNow(): Date {
    const now = this.clock();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("Project Command lifecycle requires a trusted current time.");
    }
    return now;
  }
}

export async function assertProjectCommandDispatchIdentity(
  proposal: ActionProposal,
  pending: PendingCommandApproval,
  approvedCommand: TrustedProjectCommandDefinition,
  projectBindingId: string,
  projectFingerprint: string,
): Promise<void> {
  await validateProjectCommandActionProposal(proposal);
  const parameters = proposal.parameters as unknown as ProjectCommandActionParameters;
  if (pending.toolCall.id !== proposal.actionId) {
    throw new TypeError("Project Command dispatch targets a different tool call.");
  }
  if (pending.command !== approvedCommand) {
    throw new TypeError("Project Command dispatch targets a different trusted command snapshot.");
  }
  if (
    !Object.isFrozen(approvedCommand)
    || !Object.isFrozen(approvedCommand.args)
    || approvedCommand.policy !== PROJECT_COMMAND_POLICY
  ) {
    throw new TypeError("Project Command dispatch requires an immutable trusted command.");
  }
  if (pending.command.id !== parameters.commandId) {
    throw new TypeError("Project Command dispatch command ID does not match the proposal.");
  }
  if (pending.command.catalogDigest !== parameters.catalogDigest) {
    throw new TypeError("Project Command dispatch catalog digest does not match the proposal.");
  }
  if (pending.command.category !== parameters.commandCategory) {
    throw new TypeError("Project Command dispatch category does not match the proposal.");
  }
  if (projectBindingId !== parameters.projectBindingId) {
    throw new TypeError("Project Command dispatch project binding does not match the proposal.");
  }
  if (projectFingerprint !== parameters.projectFingerprint) {
    throw new TypeError("Project Command dispatch project fingerprint does not match the proposal.");
  }
  if (parameters.policyProfileId !== PROJECT_COMMAND_POLICY.policyProfileId) {
    throw new TypeError("Project Command dispatch policy profile does not match the trusted policy.");
  }
  if (parameters.policyDigest !== await trustedProjectCommandPolicyDigest()) {
    throw new TypeError("Project Command dispatch policy digest does not match the trusted policy.");
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
