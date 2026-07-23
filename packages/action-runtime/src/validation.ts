import { ActionRuntimeError } from "./errors.js";
import type { ActionProposal, ActionProposalInput, JsonValue } from "./types.js";

const ACTION_SCHEMA_VERSION = "kerniq.action.v1";

export async function createActionProposal(input: ActionProposalInput): Promise<ActionProposal> {
  const proposalWithoutDigest = {
    schemaVersion: ACTION_SCHEMA_VERSION,
    ...input,
  } satisfies Omit<ActionProposal, "proposalDigest">;
  validateProposalFields(proposalWithoutDigest);
  return {
    ...proposalWithoutDigest,
    proposalDigest: await computeProposalDigest(proposalWithoutDigest),
  };
}

export async function validateActionProposal(proposal: ActionProposal): Promise<void> {
  validateProposalFields(proposal);
  const expected = await computeProposalDigest(proposal);
  if (proposal.proposalDigest !== expected) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal digest does not match its content.");
  }
}

export async function computeProposalDigest(
  proposal: Omit<ActionProposal, "proposalDigest"> | ActionProposal,
): Promise<string> {
  const {
    proposalDigest: _ignored,
    ...digestable
  } = proposal as ActionProposal;
  const encoded = new TextEncoder().encode(canonicalJson(digestable as unknown as JsonValue));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ActionRuntimeError("invalid_proposal", "Action proposal contains a non-finite number.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function validateProposalFields(proposal: Omit<ActionProposal, "proposalDigest"> | ActionProposal): void {
  if (proposal.schemaVersion !== ACTION_SCHEMA_VERSION) {
    throw new ActionRuntimeError("invalid_proposal", "Unsupported action proposal schema version.");
  }
  for (const [name, value] of [
    ["actionId", proposal.actionId],
    ["taskId", proposal.taskId],
    ["actionType", proposal.actionType],
    ["title", proposal.title],
    ["summary", proposal.summary],
    ["requestedAt", proposal.requestedAt],
  ]) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new ActionRuntimeError("invalid_proposal", `${name} must be a non-empty string.`);
    }
  }
  if (!["read", "write", "process", "network", "external"].includes(proposal.risk)) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal risk is invalid.");
  }
  if (Number.isNaN(Date.parse(proposal.requestedAt))) {
    throw new ActionRuntimeError("invalid_proposal", "Action proposal requestedAt is invalid.");
  }
  canonicalJson(proposal.parameters);
}
