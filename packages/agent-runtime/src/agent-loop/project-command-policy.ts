import type {
  ProjectCommandCategory,
  ProjectCommandDefinition,
} from "./types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PROJECT_COMMAND_CATEGORIES = new Set<ProjectCommandCategory>([
  "test",
  "check",
  "lint",
  "typecheck",
  "build",
]);

export const PROJECT_COMMAND_POLICY = Object.freeze({
  actionType: "kerniq.project-command.run",
  risk: "process",
  approval: "explicit_once",
  maxTimeoutMs: 120_000,
  policyProfileId: "kerniq-project-command-v1",
} as const);

export type TrustedProjectCommandPolicy = typeof PROJECT_COMMAND_POLICY;

export interface TrustedProjectCommandDefinition extends ProjectCommandDefinition {
  readonly policy: TrustedProjectCommandPolicy;
}

export interface ProjectCommandActionParameters {
  readonly commandId: string;
  readonly catalogDigest: string;
  readonly commandCategory: ProjectCommandCategory;
  readonly projectBindingId: string;
  readonly projectFingerprint: string;
  readonly policyProfileId: string;
  readonly policyDigest: string;
}

export interface ProjectCommandActionParameterInput {
  readonly command: TrustedProjectCommandDefinition;
  readonly projectBindingId: string;
  readonly projectFingerprint: string;
}

export function serializeTrustedProjectCommandPolicy(
  policy: TrustedProjectCommandPolicy = PROJECT_COMMAND_POLICY,
): string {
  assertTrustedPolicy(policy);
  return JSON.stringify({
    actionType: policy.actionType,
    risk: policy.risk,
    approval: policy.approval,
    maxTimeoutMs: policy.maxTimeoutMs,
    policyProfileId: policy.policyProfileId,
  });
}

export async function createProjectCommandActionParameters(
  input: ProjectCommandActionParameterInput,
): Promise<Readonly<ProjectCommandActionParameters>> {
  if (input.command.policy !== PROJECT_COMMAND_POLICY) {
    throw new TypeError("Project Command policy metadata must come from the trusted KerniQ catalog.");
  }
  if (!text(input.command.id)) {
    throw new TypeError("Project Command action parameters require a command ID.");
  }
  if (!input.command.catalogDigest || !SHA256_PATTERN.test(input.command.catalogDigest)) {
    throw new TypeError("Project Command action parameters require a trusted catalog digest.");
  }
  if (!PROJECT_COMMAND_CATEGORIES.has(input.command.category)) {
    throw new TypeError("Project Command action parameters require a trusted command category.");
  }
  if (!text(input.projectBindingId)) {
    throw new TypeError("Project Command action parameters require a project binding ID.");
  }
  if (!SHA256_PATTERN.test(input.projectFingerprint)) {
    throw new TypeError("Project Command action parameters require a project fingerprint.");
  }

  return Object.freeze({
    commandId: input.command.id,
    catalogDigest: input.command.catalogDigest,
    commandCategory: input.command.category,
    projectBindingId: input.projectBindingId,
    projectFingerprint: input.projectFingerprint,
    policyProfileId: PROJECT_COMMAND_POLICY.policyProfileId,
    policyDigest: await computeTrustedProjectCommandPolicyDigest(),
  });
}

async function computeTrustedProjectCommandPolicyDigest(): Promise<string> {
  const serialized = serializeTrustedProjectCommandPolicy();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function createTrustedProjectCommandDefinition(
  definition: ProjectCommandDefinition,
): TrustedProjectCommandDefinition {
  return {
    ...definition,
    policy: PROJECT_COMMAND_POLICY,
  };
}

function assertTrustedPolicy(policy: TrustedProjectCommandPolicy): void {
  if (
    policy.actionType !== PROJECT_COMMAND_POLICY.actionType
    || policy.risk !== PROJECT_COMMAND_POLICY.risk
    || policy.approval !== PROJECT_COMMAND_POLICY.approval
    || policy.maxTimeoutMs !== PROJECT_COMMAND_POLICY.maxTimeoutMs
    || policy.policyProfileId !== PROJECT_COMMAND_POLICY.policyProfileId
  ) {
    throw new TypeError("Project Command policy metadata does not match the KerniQ policy.");
  }
}

function text(value: string): boolean {
  return value.trim().length > 0;
}
