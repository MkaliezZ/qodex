import { describe, expect, it } from "vitest";
import {
  classifyGovernanceTier,
  createAgentGovernanceEvidence,
  supportsExternalGovernance,
  type AgentGovernanceEvidenceInput,
  type EvidenceTruthValue,
  type GovernanceOutcome,
  type PolicyDecision,
} from "../src/index.js";

describe("agent governance evidence", () => {
  it("classifies only a complete observed block, allow, and fail-closed set as governed", () => {
    const evidence = [
      createAgentGovernanceEvidence(input("block", "blocked", false, false, false)),
      createAgentGovernanceEvidence(input("allow", "succeeded", true, true, true)),
      createAgentGovernanceEvidence(input("ask", "failed_closed", false, false, false)),
    ];

    expect(classifyGovernanceTier(evidence)).toBe("GOVERNED");
    expect(supportsExternalGovernance(classifyGovernanceTier(evidence))).toBe(true);
    expect(classifyGovernanceTier(evidence.slice(0, 2))).toBe("OBSERVED");
    expect(supportsExternalGovernance("OBSERVED")).toBe(false);
  });

  it("does not combine cases from different backend identities", () => {
    const blocked = createAgentGovernanceEvidence(input("block", "blocked", false, false, false));
    const allowed = createAgentGovernanceEvidence({
      ...input("allow", "succeeded", true, true, true),
      agentId: "another-dsh-instance",
    });
    const failedClosed = createAgentGovernanceEvidence(input("ask", "failed_closed", false, false, false));

    expect(classifyGovernanceTier([blocked, allowed, failedClosed])).toBe("OBSERVED");
  });

  it("does not combine cases from different proof tasks or tool actions", () => {
    const blocked = createAgentGovernanceEvidence(input("block", "blocked", false, false, false));
    const anotherTask = createAgentGovernanceEvidence({
      ...input("allow", "succeeded", true, true, true),
      taskId: "another-proof",
    });
    const anotherTool = createAgentGovernanceEvidence({
      ...input("ask", "failed_closed", false, false, false),
      toolName: "another_probe",
    });

    expect(classifyGovernanceTier([blocked, anotherTask, anotherTool])).toBe("OBSERVED");
  });

  it("preserves unknown instead of inferring handler state from an absent side effect", () => {
    const evidence = createAgentGovernanceEvidence(input(
      "block",
      "unknown",
      false,
      "unknown",
      false,
      "unknown",
    ));

    expect(evidence.toolBodyStarted).toEqual({ value: "unknown", provenance: "unknown" });
    expect(evidence.physicalSideEffect).toEqual({ value: false, provenance: "observed" });
    expect(classifyGovernanceTier([evidence])).toBe("OBSERVED");
  });

  it("rejects a claimed non-entry that lacks independent observation", () => {
    const unobserved = input("block", "blocked", false, false, false);
    expect(() => createAgentGovernanceEvidence({
      ...unobserved,
      toolBodyStarted: { value: false, provenance: "derived" },
    })).toThrow("toolBodyStarted=false requires independent observed provenance");
  });

  it("rejects contradictory block and dispatch facts", () => {
    const contradictory = input("block", "blocked", true, true, true);
    expect(() => createAgentGovernanceEvidence(contradictory)).toThrow(
      "blocking policy decision cannot be recorded with dispatchOccurred=true",
    );
  });
});

function input(
  decision: PolicyDecision,
  outcome: GovernanceOutcome,
  dispatch: EvidenceTruthValue,
  body: EvidenceTruthValue,
  sideEffect: EvidenceTruthValue,
  bodyProvenance: "observed" | "unknown" = "observed",
): AgentGovernanceEvidenceInput {
  return {
    taskId: "governance-proof",
    workerRunId: `run-${outcome}`,
    agentId: "dsh-deepseek",
    agentKind: "deepseek-harness",
    agentVersion: "0.1.2-alpha.1",
    toolCallId: `call-${outcome}`,
    toolName: "kerniq_write_probe",
    actionSummary: "Write a fixed harmless marker in an isolated temporary workspace.",
    modelToolCallObserved: { value: true, provenance: "observed" },
    policyDecision: { value: decision, provenance: "observed" },
    policyReason: decision === "ask" ? "requires_approval" : decision === "allow" ? "allowed" : "explicit_denylist",
    preExecuteObserved: { value: true, provenance: "observed" },
    dispatchOccurred: { value: dispatch, provenance: dispatch === "unknown" ? "unknown" : "observed" },
    toolBodyStarted: { value: body, provenance: bodyProvenance },
    physicalSideEffect: { value: sideEffect, provenance: sideEffect === "unknown" ? "unknown" : "observed" },
    outcome,
    provenance: {
      runtimeSource: "deepseek-ai/deepseek-harness@fixture",
      modelProvider: "deepseek-official",
      model: "deepseek-v4-flash",
      policyAdapter: "@dhms-agentfuse/dsh-agentfuse@fixture",
      captureMethod: "pre-execute observer plus tool-body marker and filesystem check",
    },
  };
}
