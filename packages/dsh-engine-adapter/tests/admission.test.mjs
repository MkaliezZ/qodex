import assert from "node:assert/strict";
import test from "node:test";
import { DSH_PINNED_SOURCE, evaluateDshGovernedEngineAdmission } from "../src/index.mjs";

function passingRuntime() {
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

function gate(report, id) {
  return report.gates.find(entry => entry.gate === id);
}

test("source review alone never becomes a runtime pass", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE);
  assert.equal(report.outcome, "RUNTIME_PROOF_REQUIRED");
  assert.equal(report.productEnablementRecommended, false);
  assert.equal(report.gates.filter(entry => entry.status === "not_proven").length, 7);
});

test("all eight gates are required for a governed spike pass", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, passingRuntime());
  assert.equal(report.outcome, "GOVERNED_SPIKE_PASS");
  assert.equal(report.gates.length, 8);
  assert.equal(report.gates.every(entry => entry.status === "pass"), true);
  assert.equal(report.productEnablementRecommended, false);
});

test("source commit drift fails closed", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    observedSourceCommit: "different",
  });
  assert.equal(report.outcome, "SOURCE_CONTRACT_FAIL");
  assert.equal(gate(report, "structural_model_surface")?.status, "fail");
});

test("extra model-visible tool fails structural admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    modelVisibleTools: [...passingRuntime().modelVisibleTools, "unexpected_tool"],
  });
  assert.equal(report.outcome, "SOURCE_CONTRACT_FAIL");
  assert.equal(gate(report, "structural_model_surface")?.status, "fail");
});

test("run_code or code mode fails admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    effectiveToolsMode: "code",
    codeTransportVisible: true,
    exactAllowedTools: ["inspect_project", "propose_project_command", "run_code"],
    modelVisibleTools: ["inspect_project", "propose_project_command", "run_code"],
  });
  assert.equal(report.outcome, "SOURCE_CONTRACT_FAIL");
  assert.equal(gate(report, "structural_model_surface")?.status, "fail");
  assert.equal(gate(report, "nested_dispatch_containment")?.status, "fail");
});

test("scope-owned tool escape fails admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    unreviewedScopedTools: ["scope_owned_side_effect"],
  });
  assert.equal(gate(report, "scoped_registration_containment")?.status, "fail");
});

test("nested dispatch bypass fails admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    nestedUnreviewedCallProbeRejected: false,
  });
  assert.equal(gate(report, "nested_dispatch_containment")?.status, "fail");
});

test("missing monotonic guard or executed denied body fails admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    monotonicGuardInstalled: false,
    deniedProbeBodyExecutionCount: 1,
  });
  assert.equal(gate(report, "monotonic_dispatch_guard")?.status, "fail");
});

test("later home or CLI patch fails managed profile admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    homePatchEnabled: true,
  });
  assert.equal(gate(report, "managed_profile_immutability")?.status, "fail");
});

test("any DSH-owned fixture write fails admission", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    directFixtureWrites: [".dsh/state.lock"],
  });
  assert.equal(gate(report, "workspace_write_zero")?.status, "fail");
});

test("side-effect authority must stay with KerniQ and AgentFuse", () => {
  const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, {
    ...passingRuntime(),
    agentFuseDecisionCount: 0,
    dshDirectProductExecutionCount: 1,
  });
  assert.equal(gate(report, "kerniq_owned_side_effect_authority")?.status, "fail");
});

test("reviewed source capability drift fails pinned-source gate", () => {
  const source = {
    ...DSH_PINNED_SOURCE,
    capabilities: {
      ...DSH_PINNED_SOURCE.capabilities,
      monotonicToolGuard: false,
    },
  };
  const report = evaluateDshGovernedEngineAdmission(source, passingRuntime());
  assert.equal(report.outcome, "SOURCE_CONTRACT_FAIL");
  assert.equal(gate(report, "pinned_source_identity")?.status, "fail");
});
