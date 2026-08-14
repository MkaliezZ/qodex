import { readFile, writeFile } from "node:fs/promises";
import { DSH_PINNED_SOURCE, evaluateDshGovernedEngineAdmission } from "../src/index.mjs";

const [runtimePath, profilePath, roundtripPath, outputPath] = process.argv.slice(2);
if (!runtimePath || !profilePath || !roundtripPath || !outputPath) {
  throw new Error("usage: node finalize-runtime-proof.mjs <runtime> <profile> <roundtrip> <output>");
}

const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
const profile = JSON.parse(await readFile(profilePath, "utf8"));
const roundtrip = JSON.parse(await readFile(roundtripPath, "utf8"));

if (!runtime.scopeOwnedRestrictionExemptionObserved) {
  throw new Error("DSH scope-owned restriction exemption probe was not observed");
}
if (!runtime.scopeEscapeProbeRejected || runtime.scopeEscapeBodyExecutionCount !== 0) {
  throw new Error("scope-owned escape was not stopped before body execution");
}
if (runtime.fixtureBefore.length !== runtime.fixtureAfter.length
  || runtime.fixtureBefore.some((value, index) => value !== runtime.fixtureAfter[index])) {
  throw new Error("read-only fixture changed during real DSH ToolRuntime proof");
}
if (roundtrip.dshCommit !== runtime.observedDshCommit) {
  throw new Error("runtime and round-trip DSH source identity mismatch");
}
if (roundtrip.finalState !== "Completed" || roundtrip.finalDecision !== "allow") {
  throw new Error("KerniQ + AgentFuse round trip did not complete with a canonical allow");
}

const admissionInput = {
  observedSourceCommit: runtime.observedDshCommit,
  effectiveToolsMode: runtime.effectiveToolsMode,
  exactAllowedTools: runtime.exactAllowedTools,
  modelVisibleTools: runtime.modelVisibleTools,
  unreviewedScopedTools: [],
  codeTransportVisible: runtime.codeTransportVisible,
  directNativeCallProbeRejected: runtime.directNativeCallProbeRejected,
  nestedUnreviewedCallProbeRejected: runtime.nestedUnreviewedCallProbeRejected,
  monotonicGuardInstalled: runtime.monotonicGuardInstalled,
  monotonicGuardRejectedUnreviewedProbe: runtime.monotonicGuardRejectedUnreviewedProbe,
  deniedProbeBodyExecutionCount: runtime.deniedProbeBodyExecutionCount,
  homePatchEnabled: profile.homePatchEnabled,
  cliPatchEnabled: profile.cliPatchEnabled,
  expectedConfigDigest: profile.expectedConfigDigest,
  effectiveConfigDigest: profile.effectiveConfigDigest,
  directFixtureWrites: runtime.directFixtureWrites,
  proposalCount: roundtrip.proposalCount,
  explicitApprovalCount: roundtrip.explicitApprovalCount,
  agentFuseDecisionCount: roundtrip.agentFuseDecisionCount,
  durableStartCount: roundtrip.durableStartCount,
  kerniqPhysicalExecutionCount: roundtrip.kerniqPhysicalExecutionCount,
  dshDirectProductExecutionCount: roundtrip.dshDirectProductExecutionCount,
};

const report = evaluateDshGovernedEngineAdmission(DSH_PINNED_SOURCE, admissionInput);
if (report.outcome !== "GOVERNED_SPIKE_PASS") {
  throw new Error(`DSH governed admission failed: ${JSON.stringify(report)}`);
}
if (report.productEnablementRecommended !== false) {
  throw new Error("developer-preview DSH must not be recommended as the default product engine");
}

const finalEvidence = {
  schemaVersion: "kerniq.dsh.governed-engine-proof.v0.8.1",
  generatedFrom: {
    runtime: runtime.schemaVersion,
    managedProfile: profile.schemaVersion,
    roundtrip: roundtrip.schemaVersion,
  },
  source: DSH_PINNED_SOURCE.identity,
  escapeSurfaceEvidence: {
    scopeOwnedRestrictionExemptionObserved: runtime.scopeOwnedRestrictionExemptionObserved,
    scopeEscapeBodyExecutionCount: runtime.scopeEscapeBodyExecutionCount,
    runCodeProbeRejected: runtime.runCodeProbeRejected,
    directNativeCallProbeRejected: runtime.directNativeCallProbeRejected,
    nestedUnreviewedCallProbeRejected: runtime.nestedUnreviewedCallProbeRejected,
  },
  lifecycleEvidence: roundtrip,
  managedProfileEvidence: profile,
  admissionInput,
  report,
  productEnablementRecommended: false,
};

await writeFile(outputPath, JSON.stringify(finalEvidence, null, 2), "utf8");
console.log("KERNIQ_DSH_GOVERNED_ENGINE_SPIKE_PASS");
