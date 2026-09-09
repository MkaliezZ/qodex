export const DSH_PINNED_SOURCE = Object.freeze({
  identity: Object.freeze({
    repository: "deepseek-ai/deepseek-harness",
    commit: "47f943859bef60e4160492346772ded9b24f765a",
    packageVersion: "0.1.0-rc.5",
    license: "MIT",
    releaseChannel: "developer_preview",
  }),
  capabilities: Object.freeze({
    everythingIsPlugin: true,
    explicitToolRestriction: true,
    restrictionsIntersect: true,
    scopedRegistrationsExemptFromRestriction: true,
    reservedCodeTransportExemptFromRestriction: true,
    monotonicToolGuard: true,
    nativePresentationMode: true,
    guardedExecutionPipeline: true,
    laterProfileOrHomePatchCanOverrideEarlierRows: true,
  }),
});

export const DSH_RESERVED_CODE_TRANSPORT = "run_code";
