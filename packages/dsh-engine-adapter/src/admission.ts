import { DSH_PINNED_SOURCE, DSH_RESERVED_CODE_TRANSPORT } from "./contract.js";
import type {
  DshAdmissionGateId,
  DshAdmissionGateResult,
  DshAdmissionReport,
  DshRuntimeEvidence,
  DshSourceContractEvidence,
} from "./types.js";

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  if (leftSet.size !== rightSet.size) return false;
  for (const value of leftSet) {
    if (!rightSet.has(value)) return false;
  }
  return true;
}

function pass(gate: DshAdmissionGateId, reason: string): DshAdmissionGateResult {
  return { gate, status: "pass", reason };
}

function fail(gate: DshAdmissionGateId, reason: string): DshAdmissionGateResult {
  return { gate, status: "fail", reason };
}

function pending(gate: DshAdmissionGateId, reason: string): DshAdmissionGateResult {
  return { gate, status: "not_proven", reason };
}

function sourceIdentityGate(source: DshSourceContractEvidence): DshAdmissionGateResult {
  const expected = DSH_PINNED_SOURCE;
  const identityMatches =
    source.identity.repository === expected.identity.repository &&
    source.identity.commit === expected.identity.commit &&
    source.identity.packageVersion === expected.identity.packageVersion &&
    source.identity.license === expected.identity.license &&
    source.identity.releaseChannel === expected.identity.releaseChannel;

  const requiredCapabilities =
    source.capabilities.everythingIsPlugin &&
    source.capabilities.explicitToolRestriction &&
    source.capabilities.restrictionsIntersect &&
    source.capabilities.scopedRegistrationsExemptFromRestriction &&
    source.capabilities.reservedCodeTransportExemptFromRestriction &&
    source.capabilities.monotonicToolGuard &&
    source.capabilities.nativePresentationMode &&
    source.capabilities.guardedExecutionPipeline &&
    source.capabilities.laterProfileOrHomePatchCanOverrideEarlierRows;

  return identityMatches && requiredCapabilities
    ? pass("pinned_source_identity", "Pinned DSH identity and reviewed source capabilities match the v0.8.1 contract.")
    : fail("pinned_source_identity", "Pinned DSH identity or reviewed source capabilities drifted.");
}

function runtimeGates(source: DshSourceContractEvidence, runtime: DshRuntimeEvidence): DshAdmissionGateResult[] {
  const sourceCommitMatches = runtime.observedSourceCommit === source.identity.commit;
  const exactSurface = sameStringSet(runtime.exactAllowedTools, runtime.modelVisibleTools);
  const reservedAbsent =
    !runtime.exactAllowedTools.includes(DSH_RESERVED_CODE_TRANSPORT) &&
    !runtime.modelVisibleTools.includes(DSH_RESERVED_CODE_TRANSPORT) &&
    runtime.codeTransportVisible === false;
  const nativeOnly = runtime.effectiveToolsMode === "native";

  const structuralModelSurface = sourceCommitMatches && exactSurface && reservedAbsent && nativeOnly
    ? pass("structural_model_surface", "The observed model surface equals the reviewed allowlist in native mode with no reserved code transport.")
    : fail("structural_model_surface", "The runtime source, model-visible surface, presentation mode, or reserved transport violated the exact structural allowlist.");

  const scopedRegistrationContainment = runtime.unreviewedScopedTools.length === 0
    ? pass("scoped_registration_containment", "No unreviewed scope-owned registration escaped inherited restrictions.")
    : fail("scoped_registration_containment", "One or more unreviewed scope-owned tools remained model-visible.");

  const nestedDispatchContainment =
    runtime.directNativeCallProbeRejected &&
    runtime.nestedUnreviewedCallProbeRejected &&
    reservedAbsent
    ? pass("nested_dispatch_containment", "Direct and nested unreviewed dispatch probes were rejected and run_code stayed unavailable.")
    : fail("nested_dispatch_containment", "A direct/native, nested, or reserved-code dispatch path was not proven closed.");

  const monotonicDispatchGuard =
    source.capabilities.monotonicToolGuard &&
    runtime.monotonicGuardInstalled &&
    runtime.monotonicGuardRejectedUnreviewedProbe &&
    runtime.deniedProbeBodyExecutionCount === 0
    ? pass("monotonic_dispatch_guard", "A monotonic guard rejected an unreviewed call before its body executed.")
    : fail("monotonic_dispatch_guard", "The monotonic pre-body guard was absent, bypassed, or allowed a denied probe body to run.");

  const managedProfileImmutability =
    !runtime.homePatchEnabled &&
    !runtime.cliPatchEnabled &&
    runtime.expectedConfigDigest.length > 0 &&
    runtime.effectiveConfigDigest === runtime.expectedConfigDigest
    ? pass("managed_profile_immutability", "No later user/CLI patch was enabled and the effective managed profile digest matched exactly.")
    : fail("managed_profile_immutability", "A later patch layer was enabled or the effective managed profile digest drifted.");

  const workspaceWriteZero = runtime.directFixtureWrites.length === 0
    ? pass("workspace_write_zero", "The governed DSH runtime made zero direct writes inside the read-only fixture.")
    : fail("workspace_write_zero", "DSH wrote directly inside the read-only fixture before KerniQ-owned execution.");

  const kerniqOwnedAuthority =
    runtime.proposalCount === 1 &&
    runtime.explicitApprovalCount === 1 &&
    runtime.agentFuseDecisionCount === 1 &&
    runtime.durableStartCount === 1 &&
    runtime.kerniqPhysicalExecutionCount === 1 &&
    runtime.dshDirectProductExecutionCount === 0
    ? pass("kerniq_owned_side_effect_authority", "One complete proposal -> approval -> AgentFuse -> durable START -> KerniQ execution round trip was observed with zero DSH-owned product execution.")
    : fail("kerniq_owned_side_effect_authority", "The governed round trip was incomplete, duplicated, or DSH retained direct product side-effect authority.");

  return [
    structuralModelSurface,
    scopedRegistrationContainment,
    nestedDispatchContainment,
    monotonicDispatchGuard,
    managedProfileImmutability,
    workspaceWriteZero,
    kerniqOwnedAuthority,
  ];
}

export function evaluateDshGovernedEngineAdmission(
  source: DshSourceContractEvidence,
  runtime?: DshRuntimeEvidence,
): DshAdmissionReport {
  const gates: DshAdmissionGateResult[] = [sourceIdentityGate(source)];

  if (runtime === undefined) {
    gates.push(
      pending("structural_model_surface", "Requires a real pinned DSH process and captured model-facing tool surface."),
      pending("scoped_registration_containment", "Requires a real scoped-registration escape probe."),
      pending("nested_dispatch_containment", "Requires direct, nested, and reserved-transport runtime probes."),
      pending("monotonic_dispatch_guard", "Requires a real pre-body denial probe."),
      pending("managed_profile_immutability", "Requires a real isolated Harness home and effective-config digest."),
      pending("workspace_write_zero", "Requires before/after filesystem evidence from a read-only fixture."),
      pending("kerniq_owned_side_effect_authority", "Requires one real governed KerniQ + AgentFuse round trip."),
    );
  } else {
    gates.push(...runtimeGates(source, runtime));
  }

  const hasFailure = gates.some(gate => gate.status === "fail");
  const hasPending = gates.some(gate => gate.status === "not_proven");
  const outcome = hasFailure
    ? "SOURCE_CONTRACT_FAIL"
    : hasPending
      ? "RUNTIME_PROOF_REQUIRED"
      : "GOVERNED_SPIKE_PASS";

  return {
    outcome,
    productEnablementRecommended: outcome === "GOVERNED_SPIKE_PASS" && source.identity.releaseChannel !== "developer_preview",
    gates,
  };
}
