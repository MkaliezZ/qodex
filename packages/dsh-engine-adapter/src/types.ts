export type DshAdmissionGateId =
  | "pinned_source_identity"
  | "structural_model_surface"
  | "scoped_registration_containment"
  | "nested_dispatch_containment"
  | "monotonic_dispatch_guard"
  | "managed_profile_immutability"
  | "workspace_write_zero"
  | "kerniq_owned_side_effect_authority";

export type DshAdmissionGateStatus = "pass" | "fail" | "not_proven";

export type DshAdmissionOutcome =
  | "SOURCE_CONTRACT_FAIL"
  | "RUNTIME_PROOF_REQUIRED"
  | "GOVERNED_SPIKE_PASS";

export interface DshPinnedIdentity {
  readonly repository: string;
  readonly commit: string;
  readonly packageVersion: string;
  readonly license: "MIT";
  readonly releaseChannel: "developer_preview" | "stable";
}

export interface DshSourceCapabilities {
  readonly everythingIsPlugin: boolean;
  readonly explicitToolRestriction: boolean;
  readonly restrictionsIntersect: boolean;
  readonly scopedRegistrationsExemptFromRestriction: boolean;
  readonly reservedCodeTransportExemptFromRestriction: boolean;
  readonly monotonicToolGuard: boolean;
  readonly nativePresentationMode: boolean;
  readonly guardedExecutionPipeline: boolean;
  readonly laterProfileOrHomePatchCanOverrideEarlierRows: boolean;
}

export interface DshSourceContractEvidence {
  readonly identity: DshPinnedIdentity;
  readonly capabilities: DshSourceCapabilities;
}

export interface DshRuntimeEvidence {
  readonly observedSourceCommit: string;
  readonly effectiveToolsMode: "native" | "code" | "both";
  readonly exactAllowedTools: readonly string[];
  readonly modelVisibleTools: readonly string[];
  readonly unreviewedScopedTools: readonly string[];
  readonly codeTransportVisible: boolean;
  readonly directNativeCallProbeRejected: boolean;
  readonly nestedUnreviewedCallProbeRejected: boolean;
  readonly monotonicGuardInstalled: boolean;
  readonly monotonicGuardRejectedUnreviewedProbe: boolean;
  readonly deniedProbeBodyExecutionCount: number;
  readonly homePatchEnabled: boolean;
  readonly cliPatchEnabled: boolean;
  readonly expectedConfigDigest: string;
  readonly effectiveConfigDigest: string;
  readonly directFixtureWrites: readonly string[];
  readonly proposalCount: number;
  readonly explicitApprovalCount: number;
  readonly agentFuseDecisionCount: number;
  readonly durableStartCount: number;
  readonly kerniqPhysicalExecutionCount: number;
  readonly dshDirectProductExecutionCount: number;
}

export interface DshAdmissionGateResult {
  readonly gate: DshAdmissionGateId;
  readonly status: DshAdmissionGateStatus;
  readonly reason: string;
}

export interface DshAdmissionReport {
  readonly outcome: DshAdmissionOutcome;
  readonly productEnablementRecommended: boolean;
  readonly gates: readonly DshAdmissionGateResult[];
}
