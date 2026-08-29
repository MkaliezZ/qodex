import type { GovernanceTier } from "./types.js";

export const GOVERNANCE_EVIDENCE_SCHEMA_VERSION = "kerniq.agent-governance-evidence.v0.2" as const;

export type EvidenceProvenance =
  | "observed"
  | "derived"
  | "asserted_by_contract"
  | "unknown";

export type EvidenceTruthValue = boolean | "unknown";
export type PolicyDecision = "allow" | "block" | "ask" | "error-deny" | "unknown";
export type GovernanceOutcome = "blocked" | "succeeded" | "failed_closed" | "error" | "unknown";

export interface EvidenceFact<T> {
  readonly value: T;
  readonly provenance: EvidenceProvenance;
}

export interface GovernanceEvidenceProvenance {
  readonly runtimeSource: string;
  readonly modelProvider: string;
  readonly model: string;
  readonly policyAdapter: string;
  readonly captureMethod: string;
}

export interface AgentGovernanceEvidenceInput {
  readonly taskId: string;
  readonly workerRunId: string;
  readonly agentId: string;
  readonly agentKind: string;
  readonly agentVersion: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly actionSummary: string;
  readonly modelToolCallObserved: EvidenceFact<EvidenceTruthValue>;
  readonly policyDecision: EvidenceFact<PolicyDecision>;
  readonly policyReason: string;
  readonly preExecuteObserved: EvidenceFact<EvidenceTruthValue>;
  readonly dispatchOccurred: EvidenceFact<EvidenceTruthValue>;
  readonly toolBodyStarted: EvidenceFact<EvidenceTruthValue>;
  readonly physicalSideEffect: EvidenceFact<EvidenceTruthValue>;
  readonly outcome: GovernanceOutcome;
  readonly provenance: GovernanceEvidenceProvenance;
}

export interface AgentGovernanceEvidence extends AgentGovernanceEvidenceInput {
  readonly schemaVersion: typeof GOVERNANCE_EVIDENCE_SCHEMA_VERSION;
}

export function createAgentGovernanceEvidence(
  input: AgentGovernanceEvidenceInput,
): AgentGovernanceEvidence {
  validateNonEmptyFields(input);
  validateEvidenceConsistency(input);
  return Object.freeze({
    schemaVersion: GOVERNANCE_EVIDENCE_SCHEMA_VERSION,
    ...input,
    modelToolCallObserved: freezeFact(input.modelToolCallObserved),
    policyDecision: freezeFact(input.policyDecision),
    preExecuteObserved: freezeFact(input.preExecuteObserved),
    dispatchOccurred: freezeFact(input.dispatchOccurred),
    toolBodyStarted: freezeFact(input.toolBodyStarted),
    physicalSideEffect: freezeFact(input.physicalSideEffect),
    provenance: Object.freeze({ ...input.provenance }),
  });
}

export function classifyGovernanceTier(
  evidence: readonly AgentGovernanceEvidence[],
): GovernanceTier {
  const groups = new Map<string, AgentGovernanceEvidence[]>();
  for (const item of evidence) {
    const group = groups.get(governanceIdentity(item)) ?? [];
    group.push(item);
    groups.set(governanceIdentity(item), group);
  }
  for (const group of groups.values()) {
    const hasBlocked = group.some((item) => provesCase(item, "blocked", "block"));
    const hasAllowed = group.some((item) => provesCase(item, "succeeded", "allow"));
    const hasFailedClosed = group.some((item) => (
      (item.policyDecision.value === "ask" || item.policyDecision.value === "error-deny")
      && provesCommonBoundary(item)
      && observedValue(item.dispatchOccurred, false)
      && observedValue(item.toolBodyStarted, false)
      && observedValue(item.physicalSideEffect, false)
      && item.outcome === "failed_closed"
    ));
    if (hasBlocked && hasAllowed && hasFailedClosed) return "GOVERNED";
  }
  return "OBSERVED";
}

export function supportsExternalGovernance(tier: GovernanceTier): boolean {
  return tier === "GOVERNED";
}

function provesCase(
  evidence: AgentGovernanceEvidence,
  outcome: "blocked" | "succeeded",
  decision: "block" | "allow",
): boolean {
  const expectedEffect = outcome === "succeeded";
  return evidence.outcome === outcome
    && evidence.policyDecision.value === decision
    && provesCommonBoundary(evidence)
    && observedValue(evidence.dispatchOccurred, expectedEffect)
    && observedValue(evidence.toolBodyStarted, expectedEffect)
    && observedValue(evidence.physicalSideEffect, expectedEffect);
}

function provesCommonBoundary(evidence: AgentGovernanceEvidence): boolean {
  return observedValue(evidence.modelToolCallObserved, true)
    && observedValue(evidence.preExecuteObserved, true)
    && evidence.policyDecision.provenance === "observed";
}

function observedValue(fact: EvidenceFact<EvidenceTruthValue>, value: boolean): boolean {
  return fact.value === value && fact.provenance === "observed";
}

function governanceIdentity(evidence: AgentGovernanceEvidence): string {
  return [
    evidence.taskId,
    evidence.agentId,
    evidence.agentKind,
    evidence.agentVersion,
    evidence.toolName,
    evidence.provenance.runtimeSource,
    evidence.provenance.modelProvider,
    evidence.provenance.model,
    evidence.provenance.policyAdapter,
  ].join("\u0000");
}

function validateNonEmptyFields(input: AgentGovernanceEvidenceInput): void {
  const fields = [
    input.taskId,
    input.workerRunId,
    input.agentId,
    input.agentKind,
    input.agentVersion,
    input.toolCallId,
    input.toolName,
    input.actionSummary,
    input.policyReason,
    input.provenance.runtimeSource,
    input.provenance.modelProvider,
    input.provenance.model,
    input.provenance.policyAdapter,
    input.provenance.captureMethod,
  ];
  if (fields.some((value) => !value.trim())) {
    throw new TypeError("Governance evidence identifiers, summaries, reasons, and provenance must be non-empty.");
  }
}

function validateEvidenceConsistency(input: AgentGovernanceEvidenceInput): void {
  if (input.toolBodyStarted.value === false && input.toolBodyStarted.provenance !== "observed") {
    throw new TypeError("toolBodyStarted=false requires independent observed provenance.");
  }
  if (input.dispatchOccurred.value === false && input.toolBodyStarted.value === true) {
    throw new TypeError("A tool body cannot start when dispatch did not occur.");
  }
  if (input.toolBodyStarted.value === false && input.physicalSideEffect.value === true) {
    throw new TypeError("A physical side effect cannot be attributed to a tool body proven not to start.");
  }
  if (
    (input.policyDecision.value === "block" || input.policyDecision.value === "error-deny")
    && input.dispatchOccurred.value === true
  ) {
    throw new TypeError("A blocking policy decision cannot be recorded with dispatchOccurred=true.");
  }
  if (input.outcome === "blocked") {
    requireValues(input, "block", false, false, "Blocked evidence");
  }
  if (input.outcome === "succeeded") {
    requireValues(input, "allow", true, true, "Successful evidence");
    if (input.toolBodyStarted.value !== true) {
      throw new TypeError("Successful evidence requires toolBodyStarted=true.");
    }
  }
  if (input.outcome === "failed_closed") {
    if (input.policyDecision.value !== "ask" && input.policyDecision.value !== "error-deny") {
      throw new TypeError("Fail-closed evidence requires an ask or error-deny policy decision.");
    }
    if (input.dispatchOccurred.value !== false || input.physicalSideEffect.value !== false) {
      throw new TypeError("Fail-closed evidence requires no dispatch and no physical side effect.");
    }
  }
}

function requireValues(
  input: AgentGovernanceEvidenceInput,
  decision: "allow" | "block",
  dispatch: boolean,
  sideEffect: boolean,
  label: string,
): void {
  if (
    input.policyDecision.value !== decision
    || input.dispatchOccurred.value !== dispatch
    || input.physicalSideEffect.value !== sideEffect
  ) {
    throw new TypeError(`${label} contains contradictory policy, dispatch, or side-effect facts.`);
  }
}

function freezeFact<T>(fact: EvidenceFact<T>): EvidenceFact<T> {
  return Object.freeze({ ...fact });
}
