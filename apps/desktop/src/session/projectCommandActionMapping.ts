import {
  createActionProposal,
  validateActionApproval,
  type ActionApproval,
  type ActionProposal,
} from "@qodex/action-runtime";
import {
  createProjectCommandActionParameters,
  PROJECT_COMMAND_POLICY,
  type TrustedProjectCommandDefinition,
} from "@qodex/agent-runtime";

const MAX_COMMAND_LABEL_LENGTH = 96;
const MAX_COMMAND_ID_LENGTH = 160;

export interface ProjectCommandActionProposalInput {
  readonly command: TrustedProjectCommandDefinition;
  readonly toolCallId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly projectBindingId: string;
  readonly projectFingerprint: string;
  readonly requestedAt: string;
}

export interface ProjectCommandActionApprovalInput {
  readonly proposal: ActionProposal;
  readonly approvalId: string;
  readonly sessionApprovalGeneration: number;
  readonly approvedAt: string;
  readonly expiresAt: string;
  readonly now: Date;
}

export async function createProjectCommandActionProposal(
  input: ProjectCommandActionProposalInput,
): Promise<Readonly<ActionProposal>> {
  const parameters = await createProjectCommandActionParameters({
    command: input.command,
    projectBindingId: input.projectBindingId,
    projectFingerprint: input.projectFingerprint,
  });
  const proposal = await createActionProposal({
    actionId: input.toolCallId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    actionType: PROJECT_COMMAND_POLICY.actionType,
    title: `Run project command: ${bounded(input.command.label, MAX_COMMAND_LABEL_LENGTH)}`,
    summary:
      `Run trusted catalog command ${bounded(input.command.id, MAX_COMMAND_ID_LENGTH)} `
      + "in the approved project.",
    risk: PROJECT_COMMAND_POLICY.risk,
    parameters: { ...parameters },
    requestedAt: input.requestedAt,
  });
  Object.freeze(proposal.parameters);
  return Object.freeze(proposal);
}

export function createProjectCommandActionApproval(
  input: ProjectCommandActionApprovalInput,
): Readonly<ActionApproval> {
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new TypeError("Project Command approval validation requires a trusted current time.");
  }
  const generation = sessionApprovalGenerationToActionGeneration(
    input.sessionApprovalGeneration,
  );
  const approval = Object.freeze({
    approvalId: input.approvalId,
    actionId: input.proposal.actionId,
    taskId: input.proposal.taskId,
    proposalDigest: input.proposal.proposalDigest,
    generation,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  });
  validateActionApproval(approval, input.proposal, generation, input.now);
  return approval;
}

export function sessionApprovalGenerationToActionGeneration(
  sessionApprovalGeneration: number,
): number {
  if (
    !Number.isInteger(sessionApprovalGeneration)
    || sessionApprovalGeneration < 0
  ) {
    throw new TypeError(
      "Session approval generation must be a non-negative integer.",
    );
  }
  return sessionApprovalGeneration + 1;
}

function bounded(value: string, maxLength: number): string {
  return [...value].slice(0, maxLength).join("");
}
