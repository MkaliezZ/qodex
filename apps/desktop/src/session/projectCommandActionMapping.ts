import {
  createActionProposal,
  validateActionApproval,
  validateActionProposal,
  type ActionApproval,
  type ActionProposal,
} from "@qodex/action-runtime";
import {
  createProjectCommandActionParameters,
  PROJECT_COMMAND_POLICY,
  trustedProjectCommandPolicyDigest,
  type TrustedProjectCommandDefinition,
} from "@qodex/agent-runtime";

const MAX_COMMAND_LABEL_LENGTH = 96;
const MAX_COMMAND_ID_LENGTH = 160;
const MAX_IDENTITY_LENGTH = 256;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PROJECT_COMMAND_CATEGORIES = new Set([
  "test",
  "check",
  "lint",
  "typecheck",
  "build",
]);
const PROJECT_COMMAND_PARAMETER_KEYS = [
  "catalogDigest",
  "commandCategory",
  "commandId",
  "policyDigest",
  "policyProfileId",
  "projectBindingId",
  "projectFingerprint",
] as const;

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

export async function validateProjectCommandActionProposal(
  proposal: ActionProposal,
): Promise<void> {
  await validateActionProposal(proposal);
  if (proposal.actionType !== PROJECT_COMMAND_POLICY.actionType) {
    throw new TypeError("Project Command proposal action type is not trusted.");
  }
  if (proposal.risk !== PROJECT_COMMAND_POLICY.risk) {
    throw new TypeError("Project Command proposal risk is not trusted.");
  }
  if (!boundedText(proposal.sessionId, MAX_IDENTITY_LENGTH)) {
    throw new TypeError("Project Command proposal requires a bounded Session ID.");
  }
  if (!isPlainRecord(proposal.parameters)) {
    throw new TypeError("Project Command proposal parameters must be a plain JSON object.");
  }
  const parameterKeys = Object.keys(proposal.parameters).sort();
  if (
    Object.getOwnPropertySymbols(proposal.parameters).length > 0
    || parameterKeys.length !== PROJECT_COMMAND_PARAMETER_KEYS.length
    || parameterKeys.some((key, index) => key !== PROJECT_COMMAND_PARAMETER_KEYS[index])
  ) {
    throw new TypeError("Project Command proposal parameters must have the exact trusted shape.");
  }

  const parameters = proposal.parameters;
  if (!boundedText(parameters.commandId, MAX_COMMAND_ID_LENGTH)) {
    throw new TypeError("Project Command proposal commandId is invalid.");
  }
  if (!digest(parameters.catalogDigest)) {
    throw new TypeError("Project Command proposal catalogDigest is invalid.");
  }
  if (
    typeof parameters.commandCategory !== "string"
    || !PROJECT_COMMAND_CATEGORIES.has(parameters.commandCategory)
  ) {
    throw new TypeError("Project Command proposal commandCategory is invalid.");
  }
  if (!boundedText(parameters.projectBindingId, MAX_IDENTITY_LENGTH)) {
    throw new TypeError("Project Command proposal projectBindingId is invalid.");
  }
  if (!digest(parameters.projectFingerprint)) {
    throw new TypeError("Project Command proposal projectFingerprint is invalid.");
  }
  if (parameters.policyProfileId !== PROJECT_COMMAND_POLICY.policyProfileId) {
    throw new TypeError("Project Command proposal policyProfileId is not trusted.");
  }
  if (parameters.policyDigest !== await trustedProjectCommandPolicyDigest()) {
    throw new TypeError("Project Command proposal policyDigest is not trusted.");
  }
}

export async function createProjectCommandActionApproval(
  input: ProjectCommandActionApprovalInput,
): Promise<Readonly<ActionApproval>> {
  if (!(input.now instanceof Date) || Number.isNaN(input.now.getTime())) {
    throw new TypeError("Project Command approval validation requires a trusted current time.");
  }
  await validateProjectCommandActionProposal(input.proposal);
  const generation = sessionApprovalGenerationToActionGeneration(
    input.sessionApprovalGeneration,
  );
  const approval: ActionApproval = {
    approvalId: input.approvalId,
    actionId: input.proposal.actionId,
    taskId: input.proposal.taskId,
    proposalDigest: input.proposal.proposalDigest,
    generation,
    approvedAt: input.approvedAt,
    expiresAt: input.expiresAt,
  };
  validateActionApproval(approval, input.proposal, generation, input.now);
  return Object.freeze(approval);
}

export function sessionApprovalGenerationToActionGeneration(
  sessionApprovalGeneration: number,
): number {
  if (
    !Number.isSafeInteger(sessionApprovalGeneration)
    || sessionApprovalGeneration < 0
    || sessionApprovalGeneration >= Number.MAX_SAFE_INTEGER
  ) {
    throw new TypeError(
      "Session approval generation must convert to a positive safe integer.",
    );
  }
  return sessionApprovalGeneration + 1;
}

function bounded(value: string, maxLength: number): string {
  return [...value].slice(0, maxLength).join("");
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && [...value].length <= maxLength;
}

function digest(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
