import { DSH_PINNED_SOURCE, DSH_RESERVED_CODE_TRANSPORT } from "./contract.mjs";

function sameStringSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length || leftSet.size !== rightSet.size) return false;
  return [...leftSet].every(value => rightSet.has(value));
}

const result = (gate, status, reason) => Object.freeze({ gate, status, reason });
const pass = (gate, reason) => result(gate, "pass", reason);
const fail = (gate, reason) => result(gate, "fail", reason);
const pending = (gate, reason) => result(gate, "not_proven", reason);

function sourceIdentityGate(source) {
  const expected = DSH_PINNED_SOURCE;
  const identityMatches =
    source?.identity?.repository === expected.identity.repository &&
    source?.identity?.commit === expected.identity.commit &&
    source?.identity?.packageVersion === expected.identity.packageVersion &&
    source?.identity?.license === expected.identity.license &&
    source?.identity?.releaseChannel === expected.identity.releaseChannel;

  const capabilities = source?.capabilities ?? {};
  const requiredCapabilities = [
    "everythingIsPlugin",
    "explicitToolRestriction",
    "restrictionsIntersect",
    "scopedRegistrationsExemptFromRestriction",
    "reservedCodeTransportExemptFromRestriction",
    "monotonicToolGuard",
    "nativePresentationMode",
    "guardedExecutionPipeline",
    "laterProfileOrHomePatchCanOverrideEarlierRows",
  ].every(key => capabilities[key] === true);

  return identityMatches && requiredCapabilities
    ? pass("pinned_source_identity", "Pinned DSH identity and reviewed source capabilities match the v0.8.1 contract.")
    : fail("pinned_source_identity", "Pinned DSH identity or reviewed source capabilities drifted.");
}

function runtimeGates(source, runtime) {
  const exactSurface = sameStringSet(runtime.exactAllowedTools, runtime.modelVisibleTools);
  const reservedAbsent =
    !runtime.exactAllowedTools.includes(DSH_RESERVED_CODE_TRANSPORT) &&
    !runtime.modelVisibleTools.includes(DSH_RESERVED_CODE_TRANSPORT) &&
    runtime.codeTransportVisible === false;

  return [
    runtime.observedSourceCommit === source.identity.commit && exactSurface && reservedAbsent && runtime.effectiveToolsMode === "native"
      ? pass("structural_model_surface", "Observed model surface equals the reviewed allowlist in native mode with no reserved code transport.")
      : fail("structural_model_surface", "Runtime source, tool surface, presentation mode, or reserved transport violated the structural allowlist."),

    runtime.unreviewedScopedTools.length === 0
      ? pass("scoped_registration_containment", "No unreviewed scope-owned registration escaped inherited restrictions.")
      : fail("scoped_registration_containment", "An unreviewed scope-owned tool remained model-visible."),

    runtime.directNativeCallProbeRejected && runtime.nestedUnreviewedCallProbeRejected && reservedAbsent
      ? pass("nested_dispatch_containment", "Direct, nested, and reserved-code bypass probes were rejected.")
      : fail("nested_dispatch_containment", "A direct, nested, or reserved-code dispatch path was not proven closed."),

    source.capabilities.monotonicToolGuard && runtime.monotonicGuardInstalled &&
      runtime.monotonicGuardRejectedUnreviewedProbe && runtime.deniedProbeBodyExecutionCount === 0
      ? pass("monotonic_dispatch_guard", "Monotonic guard rejected an unreviewed call before its body executed.")
      : fail("monotonic_dispatch_guard", "Monotonic pre-body guard was absent, bypassed, or allowed the denied body to run."),

    !runtime.homePatchEnabled && !runtime.cliPatchEnabled && runtime.expectedConfigDigest.length > 0 &&
      runtime.effectiveConfigDigest === runtime.expectedConfigDigest
      ? pass("managed_profile_immutability", "No later patch layer was enabled and the effective profile digest matched exactly.")
      : fail("managed_profile_immutability", "A later patch layer was enabled or the effective managed profile digest drifted."),

    runtime.directFixtureWrites.length === 0
      ? pass("workspace_write_zero", "Governed DSH made zero direct writes inside the read-only fixture.")
      : fail("workspace_write_zero", "DSH wrote inside the read-only fixture before KerniQ-owned execution."),

    runtime.proposalCount === 1 && runtime.explicitApprovalCount === 1 && runtime.agentFuseDecisionCount === 1 &&
      runtime.durableStartCount === 1 && runtime.kerniqPhysicalExecutionCount === 1 && runtime.dshDirectProductExecutionCount === 0
      ? pass("kerniq_owned_side_effect_authority", "Exactly one proposal -> approval -> AgentFuse -> durable START -> KerniQ execution round trip was observed with zero DSH-owned product execution.")
      : fail("kerniq_owned_side_effect_authority", "Governed round trip was incomplete, duplicated, or DSH retained direct product side-effect authority."),
  ];
}

export function evaluateDshGovernedEngineAdmission(source, runtime) {
  const gates = [sourceIdentityGate(source)];

  if (runtime === undefined) {
    gates.push(
      pending("structural_model_surface", "Requires a real pinned DSH process and captured model-facing surface."),
      pending("scoped_registration_containment", "Requires a real scope-owned registration escape probe."),
      pending("nested_dispatch_containment", "Requires direct, nested, and reserved-transport runtime probes."),
      pending("monotonic_dispatch_guard", "Requires a real pre-body denial probe."),
      pending("managed_profile_immutability", "Requires an isolated Harness home and effective-config digest."),
      pending("workspace_write_zero", "Requires before/after filesystem evidence from a read-only fixture."),
      pending("kerniq_owned_side_effect_authority", "Requires one real KerniQ + AgentFuse governed round trip."),
    );
  } else {
    gates.push(...runtimeGates(source, runtime));
  }

  const hasFailure = gates.some(gate => gate.status === "fail");
  const hasPending = gates.some(gate => gate.status === "not_proven");
  const outcome = hasFailure ? "SOURCE_CONTRACT_FAIL" : hasPending ? "RUNTIME_PROOF_REQUIRED" : "GOVERNED_SPIKE_PASS";

  return Object.freeze({
    outcome,
    productEnablementRecommended: outcome === "GOVERNED_SPIKE_PASS" && source.identity.releaseChannel === "stable",
    gates: Object.freeze(gates),
  });
}
