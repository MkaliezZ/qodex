# DHMS / KerniQ v0.4 — Phase 1 Proof Boundary Reclassification

```text
REPOSITORY=MkaliezZ/qodex
BRANCH=feat/kerniq-v0.4-cheshire-preview
BASELINE=21d62c4e2b27ea18d18b17c783bb9b1f18768c61
TYPE=documentation-only reclassification
```

## 1. Previous Claim

The Phase 1 final closure report declared:

```text
GOVERNED_RUNTIME_PROVEN=true
```

**That claim was too strong: it exceeded the tested threat model.** This is
not an implementation failure. The interceptor, evidence lifecycle,
identity binding, and fail-closed behaviors all passed their regressions
against the audited runtime. What the final Codex review demonstrated is
that four residual limitations — (1) a pre-bound execute reference captured
before attach, (2) mutable execute replacement that happens before the
attach publishes its guard, (3) the dispatch token not being bound to a
specific tool/call identity, and (4) async context inheritance across
tasks — describe **in-process adversarial runtime behavior**, which Phase 1
was never designed or tested to defeat. A proof claim must match the
boundary that was actually verified; declaring the unqualified
"GOVERNED_RUNTIME_PROVEN" implied coverage of a threat model the prototype
does not address.

The honest correction is to reclassify the claim, not to expand the
mechanisms.

## 2. Proven Capability

Within the audited runtime and the normal execution path, Phase 1 has
demonstrated, with causal regressions (54/54 passing):

### SDK-free attach

An existing Cheshire Cat agent runtime (cheshire-cat-ai==2.0.23) runs under
governance **without agent rewrite, without any `import kerniq` in user
code, and without framework replacement** — attach patches the validated
seam (`Agent.call_tool` → `Tool.execute`) at runtime, with single-owner,
MRO-overlap-checked, atomically published patch lifecycle.

### Governance decision path

Every tool request flows through:

```text
Tool request
  → runtime interceptor
  → AgentFuse decision (dhms-agentfuse==3.7.3, local IPC sidecar,
    six-field identity-bound, unknown/timeout/mismatch fail closed)
  → allow | block
  → evidence lifecycle (REQUESTED → AUTHORIZED/BLOCKED →
    DISPATCH_STARTED → EXECUTED / FAILED_*)
```

Blocked calls never reach `Tool.execute` (execution count 0, proven);
allowed calls dispatch exactly once per `tool_call_id`, including under
concurrent same-id invocation.

### Execution evidence boundary

On the approved dispatch path, `EXECUTED` evidence — and its
`executed_arguments` — is produced only from inside the real audited
`Tool.execute` invocation. A dispatcher that fabricates a result without
executing produces no `EXECUTED` evidence; a pre-existing instance-level
execute override is refused rather than observed.

### Fail-closed behavior

Deny, invalid/unknown decisions, sidecar timeout, IPC identity mismatch,
runtime/version/signature mismatch at admission, evidence write failure,
wrapper replacement during an active attach, and terminal-evidence failure
all degrade or block **before physical execution** — no observation-only
fallback exists.

## 3. Supported Proof Boundary

The reclassified claim:

```text
BOUNDED_RUNTIME_GOVERNANCE_PROVEN=true
```

(Name chosen over `GOVERNED_RUNTIME_PROFILE_PROVEN` to match the
"bounded preview" vocabulary already used throughout v0.3.3.x/v0.4
evidence.)

It holds **only** under all of the following:

```text
runtime          cheshire-cat-ai==2.0.23 (fastmcp==3.4.3)
profile          bounded preview profile (this branch, these tests)
process          single process
ledger           process-local, attach-scoped
identity         attach-scoped IPC identity (six fields)
dispatch path    the audited base Agent.call_tool → audited Tool.execute;
                 admission refuses any override on that resolution path
cooperation      cooperative runtime execution model: the host runtime is
                 not actively adversarial after attach (see threat model)
```

## 4. Explicit Non-Claims

This claim does **not** assert any of the following:

```text
NOT universal Python execution security
NOT hostile in-process code prevention
NOT sandbox isolation
NOT an OS-level security boundary
NOT arbitrary monkey-patch resistance
NOT cross-process exactly-once
NOT production security certification
NOT official Cheshire Cat integration, endorsement, or support promise
```

## 5. Threat Model

**Normal Runtime Threat Model (Phase 1 target).** The governed system is a
correctly functioning agent runtime: tools may misbehave, models may
request dangerous actions, configuration may be wrong — and governance
must decide, enforce, and evidence every dispatch on the audited path.
Phase 1 is built and regression-proven against this model.

**Adversarial In-Process Threat Model (out of scope).** An actor who
already holds arbitrary code execution inside the governed process can, by
construction, capture pre-bound references, mutate the runtime before
attach observes it, inherit async contexts, or race publication windows.
AgentFuse's purpose is governing the **agent runtime execution boundary** —
deciding what the agent's tools may do — not defending a process against
an attacker who already controls it. Defending that boundary requires OS
isolation or runtime embedding, which is outside the SDK-free governance
layer positioning.

## 6. Product Positioning

No product-line change is implied by this reclassification.

```text
AgentFuse (DHMS)  SDK-free Agent Runtime Governance Layer
                   — allow/block semantics, Evidence Schema v1
KerniQ            SDK-free attachment layer for supported Agent runtimes
                   — launcher, interceptor, sidecar, evidence capture
```

The claim correction aligns the public-facing statement with what was
actually verified, which is exactly the posture a governance product must
have: precise, auditable, and honest about its boundary.

## Reclassification summary

```text
BEFORE  GOVERNED_RUNTIME_PROVEN=true            (over-broad)
AFTER   BOUNDED_RUNTIME_GOVERNANCE_PROVEN=true  (audited boundary above)
        GOVERNED_RUNTIME_PROVEN=false           (reserved for a future
                                                milestone that closes the
                                                adversarial in-process gap
                                                or narrows to an embedded
                                                runtime model)
```
