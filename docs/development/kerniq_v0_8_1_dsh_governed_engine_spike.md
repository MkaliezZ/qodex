# KerniQ v0.8.1 DeepSeek Harness Governed Engine Spike

**Date:** 2026-08-13  
**Status:** Source-contract slice implemented; `RUNTIME_PROOF_REQUIRED`  
**KerniQ base:** `8e12526e2f9fc1759bfbd3802bfec4a22182eaad`  
**DeepSeek Harness:** `deepseek-ai/deepseek-harness@47f943859bef60e4160492346772ded9b24f765a`  
**DSH package identity:** `0.1.0-rc.5`, MIT, developer preview

## Question

This spike asks one narrow question:

> Can the exact pinned DeepSeek Harness become a KerniQ intelligence engine,
> without forking DSH, while model-visible capabilities are structurally
> bounded and all reviewed product side-effect authority remains owned by
> KerniQ + DHMS / AgentFuse?

This is an admission spike, not a product-engine migration. It does not import
DSH into Desktop, replace the current Agent Runtime, implement Patch Runtime,
add multi-engine selection, or make DSH a default product engine.

## Why CodeWhale Stops Here

The frozen v0.8.0 CodeWhale spike remains the negative/reference baseline. Its
adapter-only path could not establish one exact structural tool allowlist,
`tool_search` expanded the callable surface, and the runtime wrote a workspace
state lock inside the read-only fixture. The result remains
`THIN_FORK_REQUIRED`.

KerniQ will not implement the CodeWhale thin fork while the DSH admission path
is under review. ADR-023 remains historical design evidence for the CodeWhale
path; it is not the active next implementation instruction.

## Pinned DSH Source Findings

The pinned DSH source is materially more suitable for an admission spike:

- model adapters, tool registry, session log, agent loop, persistence, policy,
  sandbox, approvals, and other capabilities are composed as plugins;
- the architecture explicitly supports replacing behavior through plugin/profile
  composition instead of requiring a privileged-core fork;
- `ToolRestriction` supports explicit `allow` / `deny` filters and multiple
  restrictions intersect;
- the tool runtime exposes a monotonic `ToolGuard` after extensible
  `tools/pre-execute` policy and before the tool body; a guard may deny but
  cannot force-allow a call another guard denied;
- the tool runtime supports native presentation mode, which permits a governed
  profile to require that `run_code` is not part of the model surface.

These are source-contract facts, not runtime-proof results.

## DSH-Specific Escape Surfaces

A strict integration must account for DSH behavior that a superficial
allowlist test would miss:

1. **Scope-owned registration exemption.** A `ToolRestriction` filters inherited
   tools but deliberately does not filter the viewing scope's own tool
   registrations.
2. **Reserved Code Mode transport.** `run_code` is inserted outside the
   filterable registration layers whenever effective presentation is not
   `native`.
3. **Nested Code Mode dispatch.** A `run_code` SDK sub-dispatch carries a parent
   execution token and may call any tool visible to that scope; therefore a
   model-direct allowlist alone is insufficient.
4. **Patch precedence.** Profile composition is intentionally patchable; later
   profile, Harness-home, or command-line `--patch` layers can replace earlier
   configuration rows.

For the KerniQ governed profile, these are fail-closed admission conditions,
not supported extensibility features.

## Eight Admission Gates

A DSH candidate may receive `GOVERNED_SPIKE_PASS` only when all eight gates are
proven for the exact pinned source and runtime configuration.

### 1. Pinned source identity

The repository, commit, package version, license, release channel, and reviewed
source-contract capabilities must match exactly. CI downloads the pinned DSH
commit again and checks the relevant upstream source markers.

### 2. Structural model surface

The effective model-visible tool set must equal the reviewed KerniQ allowlist
as an exact set. The governed profile must use `native` presentation and
`run_code` must be absent.

### 3. Scoped-registration containment

A real probe must show that no unreviewed scope-owned tool becomes model-visible
outside the reviewed KerniQ capability set, despite DSH's intentional
scope-owned-registration exemption.

### 4. Nested-dispatch containment

Direct, nested, and reserved-transport probes must fail closed. No transport or
nested dispatch route may reach an unreviewed native tool.

### 5. Monotonic dispatch guard

A KerniQ-owned monotonic tool guard must be installed at the DSH execution seam.
A denied probe must be rejected before its body starts, with body execution
count exactly zero.

The intended future bridge is:

```text
DSH intelligence
  -> KerniQ intent/proposal
  -> explicit application approval
  -> AgentFuse decision
  -> durable KerniQ START
  -> KerniQ-owned physical executor
```

DSH is not granted product side-effect authority by this spike.

### 6. Managed-profile immutability

The isolated governed runtime must disable or exclude user/home/CLI patch
layers that can loosen the managed profile. The effective configuration digest
must equal the expected managed configuration digest exactly.

### 7. Zero direct fixture writes

A before/after filesystem receipt from a read-only test fixture must show zero
DSH-owned writes before KerniQ-owned physical execution.

### 8. KerniQ-owned side-effect authority

One controlled real round trip must produce exactly one proposal, one explicit
approval, one AgentFuse decision, one durable START, and one KerniQ physical
execution, while DSH performs zero direct product side effects.

## Fail-Closed Admission Evaluator

The isolated package `packages/dsh-engine-adapter/` implements the gate
vocabulary and evaluator without entering the product dependency graph.

Source-contract review alone returns:

```text
OUTCOME=RUNTIME_PROOF_REQUIRED
```

Synthetic unit evidence can test the evaluator's logic but cannot change the
real runtime-proof status. Any extra model-visible tool, scope-owned escape,
`run_code`, nested-dispatch escape, missing monotonic guard, later patch layer,
fixture write, incomplete AgentFuse lifecycle, or DSH-owned product execution
causes fail-closed admission.

Even if every runtime gate later passes, the current pinned DSH build is a
**developer preview**. Therefore this slice does not recommend default product
enablement automatically.

## CI Boundary

The DSH spike is intentionally excluded from the normal pnpm product workspace.
It is dependency-free and has its own CI job that:

1. syntax-checks the isolated spike source;
2. runs fail-closed Node admission tests;
3. downloads the exact pinned DSH GitHub commit and verifies the reviewed source
   contract against upstream files; and
4. asserts that the spike has not entered the Desktop/product dependency graph.

This keeps the experiment reviewable without silently making DSH a product
runtime dependency.

## Runtime Phase Still Required

The next proof slice must use a real process built or run from the exact pinned
DSH source with an isolated Harness home. It must capture machine-readable
evidence for:

- effective profile/config identity and digest;
- exact first-request model tool surface;
- scope-owned registration escape attempts;
- `run_code` / nested-dispatch attempts;
- monotonic pre-body denial with a zero-execution sentinel;
- before/after fixture filesystem state; and
- one real KerniQ proposal -> approval -> AgentFuse -> durable START -> KerniQ
  executor round trip.

No default engine switch is permitted before that proof is reviewed.

## Current Outcome

```text
V0_7_CODING_PACK_FROZEN=true
CODEWHALE_ENGINE_STATUS=FROZEN_REFERENCE_BASELINE
CODEWHALE_THIN_FORK_ACTIVE=false
DSH_SOURCE_CONTRACT_PASS=true
DSH_RUNTIME_PROOF_PASS=false
DSH_DEFAULT_PRODUCT_ENGINE=false
DSH_FORK_REQUIRED=UNPROVEN
PATCH_RUNTIME_IMPLEMENTED=false
MULTI_ENGINE_IMPLEMENTED=false
OUTCOME=RUNTIME_PROOF_REQUIRED
```

The source contract is promising enough to replace the CodeWhale thin fork as
the active engine investigation. It is not yet evidence that DSH satisfies the
full governed runtime boundary.
