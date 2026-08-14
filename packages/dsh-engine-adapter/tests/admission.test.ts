import { describe, expect, it } from "vitest";
import {
  DSH_PINNED_SOURCE,
  evaluateDshGovernedEngineAdmission,
  type DshRuntimeEvidence,
} from "../src/index.js";

function passingRuntime(): DshRuntimeEvidence {
  return {
    observedSourceCommit: DSH_PINNED_SOURCE.identity.commit,
    effectiveToolsMode: "native",
    exactAllowedTools: ["inspect_project", "propose_project_command"],
    modelVisibleTools: ["propose_project_command", "inspect_project"],
    unreviewedScopedTools: [],
    codeTransportVisible: false,
    directNativeCallProbeRejected: true,
    nestedUnreviewedCallProbeRejected: true,
    monotonicGuardInstalled: true,
    monotonicGuardRejectedUnreviewedProbe: true,
    deniedProbeBodyExecutionCount: 0,
    homePatchEnabled: false,
    cliPatchEnabled: false,
    expectedConfigDigest: "sha256:managed-profile",
    effectiveConfigDigest: "sha256:managed-profile",
    directFixtureWrites: [],
    proposalCount: 1,
    explicitApprovalCount: 1,
    agentFuseDecisionCount: 1,
    durableStartCount: 1,
    kerniqPhysicalExecutionCount: 1,
    dshDirectProductExecutionCount: 0,
  };
}

describe("DSH governed engine admission", () => {
  it("does not convert source review into a runtime pass", () => {
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE);

    expect(report.outcome).toBe("RUNTIME_PROOF_REQUIRED");
    expect(report.productEnablementRecommended).toBe(false);
    expect(report.gates.filter(gate => gate.status === "not_proven")).toHaveLength(7);
  });

  it("passes only when every governed runtime gate is proven", () => {
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, passingRuntime());

    expect(report.outcome).toBe("GOVERNED_SPIKE_PASS");
    expect(report.gates.every(gate => gate.status === "pass")).toBe(true);
    expect(report.productEnablementRecommended).toBe(false);
  });

  it("fails when the pinned source commit drifts", () => {
    const runtime = { ...passingRuntime(), observedSourceCommit: "different" };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "structural_model_surface")?.status).toBe("fail");
  });

  it("fails when an extra model-visible tool escapes the allowlist", () => {
    const runtime = {
      ...passingRuntime(),
      modelVisibleTools: [...passingRuntime().modelVisibleTools, "unexpected_tool"],
    };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "structural_model_surface")?.status).toBe("fail");
  });

  it("fails when run_code or code presentation remains reachable", () => {
    const runtime = {
      ...passingRuntime(),
      effectiveToolsMode: "code" as const,
      codeTransportVisible: true,
      exactAllowedTools: ["inspect_project", "propose_project_command", "run_code"],
      modelVisibleTools: ["inspect_project", "propose_project_command", "run_code"],
    };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "structural_model_surface")?.status).toBe("fail");
    expect(report.gates.find(gate => gate.gate === "nested_dispatch_containment")?.status).toBe("fail");
  });

  it("fails when a scope-owned tool bypasses inherited restrictions", () => {
    const runtime = {
      ...passingRuntime(),
      unreviewedScopedTools: ["scope_owned_side_effect"],
    };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "scoped_registration_containment")?.status).toBe("fail");
  });

  it("fails when a nested call bypasses direct-call restrictions", () => {
    const runtime = { ...passingRuntime(), nestedUnreviewedCallProbeRejected: false };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "nested_dispatch_containment")?.status).toBe("fail");
  });

  it("fails when the monotonic guard is absent or a denied body executes", () => {
    const runtime = {
      ...passingRuntime(),
      monotonicGuardInstalled: false,
      deniedProbeBodyExecutionCount: 1,
    };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "monotonic_dispatch_guard")?.status).toBe("fail");
  });

  it("fails when a home or CLI patch can loosen the managed profile", () => {
    const runtime = { ...passingRuntime(), homePatchEnabled: true };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "managed_profile_immutability")?.status).toBe("fail");
  });

  it("fails on any DSH-owned write inside the read-only fixture", () => {
    const runtime = { ...passingRuntime(), directFixtureWrites: [".dsh/state.lock"] };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "workspace_write_zero")?.status).toBe("fail");
  });

  it("fails unless side-effect authority stays entirely with KerniQ", () => {
    const runtime = {
      ...passingRuntime(),
      agentFuseDecisionCount: 0,
      dshDirectProductExecutionCount: 1,
    };
    const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, runtime);

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "kerniq_owned_side_effect_authority")?.status).toBe("fail");
  });

  it("fails closed when the reviewed source capability contract drifts", () => {
    const source = {
      ...DSH_PINNED_SOURCE,
      capabilities: {
        ...DSH_PINNED_SOURCE.capabilities,
        monotonicToolGuard: false,
      },
    };
    const report = evaluateDshGovernedEngineAdmission(source, passingRuntime());

    expect(report.outcome).toBe("SOURCE_CONTRACT_FAIL");
    expect(report.gates.find(gate => gate.gate === "pinned_source_identity")?.status).toBe("fail");
  });
});
