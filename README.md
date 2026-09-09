# KerniQ

<p align="center">
  <img src="docs/assets/kerniq-logo.png" alt="KerniQ" width="520">
</p>

**English** | [中文](README.zh-CN.md)

> Desktop-first, vendor-neutral control plane for real AI agents.

**Orchestrate independent runtimes. Govern only where a real pre-dispatch boundary exists. Preserve explicit evidence and unknowns when stronger control is unavailable.**

KerniQ was previously known as Qodex. Releases up to and including
v0.2.0-beta.1 may still reference the Qodex name.

![Beta](https://img.shields.io/badge/status-beta-blue)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Tauri)-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
[![CI](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml/badge.svg)](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml)
![Built With](https://img.shields.io/badge/built%20with-Tauri%20%7C%20React-cyan)

---

## What is KerniQ?

KerniQ is a desktop-first, vendor-neutral control plane for AI agent workflows. It coordinates agent/runtime lifecycles, reconciles outputs, classifies what each runtime can truthfully expose, applies AgentFuse governance only where a reviewed execution-before boundary exists, and preserves explicit evidence and unknowns when stronger control is unavailable.

KerniQ is also a working coding-agent product surface: it includes provider abstraction, context assembly, skills, MCP, diff-first editing, Git checkpoints, session/action runtimes, multi-agent orchestration, and bounded native execution paths. Those product capabilities remain important, but they are no longer the whole definition of the project.

The integration direction is **SDK-free by default**. KerniQ should not require users to inherit a KerniQ base class, import KerniQ into business logic, rewrite tools around a KerniQ SDK, or fork their agent framework. Existing native hooks, event streams, plugin seams, and process/runtime boundaries may be used when they already exist.

---

## Why KerniQ?

KerniQ is built around a different question from “which model is best?”: **what can the runtime actually control, observe, and prove?**

| Question | KerniQ approach |
|:--|:--|
| Can several independent agents/runtimes be coordinated from one place? | Use a control-plane model for lifecycle, orchestration, and result reconciliation. |
| Can policy really block before execution? | Claim `GOVERNED` only when a reviewed pre-dispatch seam exists. |
| What if the runtime exposes no safe control seam? | Downgrade the capability instead of pretending execution control exists. |
| Is a policy decision the same as an execution result? | No. Decision and outcome are separate evidence. |
| What was actually observed versus inferred? | Evidence v0.2 keeps known and unknown facts distinct, records source references, and refuses unsupported projections instead of inventing values. |

---

## Capability Model

KerniQ classifies runtime integrations by what can be demonstrated, not by what would be convenient to claim.

| Tier | Meaning |
|:--|:--|
| **GOVERNED** | A reviewed real execution-before / pre-dispatch seam exists and policy can prevent dispatch. |
| **OBSERVED** | KerniQ can observe or control lifecycle/evidence, but cannot truthfully claim pre-dispatch governance. |
| **OPAQUE** | The runtime does not expose enough trustworthy control/evidence surface for a stronger claim. |

Core invariants:

- **Unknown > fabricated certainty.**
- **Projection != Execution Control.**
- **Decision != Outcome.**
- **Blocked != Failed.**

---

## What Is Proven Today?

Current claims are intentionally bounded.

| Area | Proven status |
|:--|:--|
| **KerniQ native Desktop Project Command** | One bounded AgentFuse-protected pre-dispatch path is proven for the reviewed Project Command scope. This is not a claim that every KerniQ action is governed. |
| **Evidence v0.2** | Frozen conformance proof exists for the canonical Evidence contract and its known/unknown boundaries. |
| **DSH source projection** | One reviewed real-source offline projection into Evidence v0.2 is proven. |
| **LangChain source projection** | One fixed real-source **limited offline projection profile** is proven. Full-capture qualification remains **REJECTED** and F-01 remains **UNRESOLVED**. This is not universal LangChain support. |
| **External validation / adoption** | **Not proven yet.** A minimal local external validation CLI exists for one frozen OBSERVED LangChain profile (see [External Validation](#external-validation)); the first internal 10-minute usability run failed on documentation friction and a fresh rerun is pending. |

The current Evidence Projection freeze is recorded in
[`kerniq_evidence_projection_v0_5_2_freeze.md`](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md).

### Not claimed

KerniQ does **not** currently claim:

- universal LangChain support;
- universal framework governance;
- universal runtime projection;
- proof of physical side effects from a terminal event alone;
- generic cross-process exactly-once execution;
- external validation or production adoption;
- that every action is protected by AgentFuse.

For the frozen LangChain track specifically:

```text
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
```

---

## Architecture

### Control-plane and evidence view

```text
Agent / Runtime Sources
  ├─ KerniQ native runtimes
  ├─ external agent CLIs / runtimes
  └─ structured traces / event exports
                ↓
        KerniQ Control Plane
  lifecycle · orchestration · reconciliation
                ↓
        Capability Classification
        ├─ GOVERNED ─→ AgentFuse decision gate
        ├─ OBSERVED ─→ lifecycle / evidence
        └─ OPAQUE   ─→ explicit unsupported / unknown
                ↓
       Evidence v0.2 / Projection
```

The control plane does not turn an observed runtime into a governed one. A runtime moves into `GOVERNED` only when a real, reviewed pre-dispatch boundary supports that claim.

### Desktop coding surface

```text
User Input → ContextEngine → MultiAgentRuntime → AgentRuntime → Provider SDK
               ↓                  ↓                   ↓
             Skills             Planner            Streaming
             Memory          Review/Refactor/         ↓
            Metadata       Research/Testing       DiffEngine
              Files            Agents            Patch Proposal
                                 ↓                   ↓
                             Aggregated          Apply/Reject
                               Report                ↓
                                                  Git Checkpoint
```

---

## External Validation

The current proofs are engineering proofs produced inside the project and independently reviewed against preserved sources. KerniQ does **not** yet claim external validation or adoption.

A **minimal local external validator CLI** now exists (see the
[pilot README](docs/development/kerniq_langchain_external_validator_v0_6_3.md)):
it validates exactly ONE frozen `OBSERVED` LangChain profile
(`langchain-create-agent-tool-run-jsonl-v0.1`), takes an existing
compatible archive only (no capture path), runs entirely local, read-only,
and offline, performs strict source qualification and Evidence v0.2
projection, and verifies the result artifact by replay. The first internal
10-minute usability run failed honestly on a documentation friction (the
documented Python command did not cover a `python3`-only fresh host); the
docs were corrected and a fresh rerun is pending. That failed run and this
CLI are still not external validation.

The next Evidence-track milestone remains an **External Validation Pilot**:
an outside developer or agent-runtime maintainer runs one bounded validation
against their own real source/run and returns a machine-verifiable result
artifact. The goal is validation, not an integration commitment. Until that
pilot succeeds: no general LangChain support, no automatic capture path, no
governance or physical-execution proof, and no external validation or
adoption is claimed.

Interested in being an early validation partner? Open an issue at
[github.com/MkaliezZ/qodex/issues](https://github.com/MkaliezZ/qodex/issues).

---

## Quick Start

```bash
# Requirements: Node.js 18+, pnpm 9+
pnpm install
cd apps/desktop && pnpm dev
```

Open http://localhost:1420.

Full guide: [QUICK_START.md](docs/QUICK_START.md)

---

## Features

### Control, trust, and evidence

| Feature | Description |
|:--|:--|
| **Control Plane** | Coordinate agent/runtime lifecycle, orchestration, and result reconciliation without pretending every runtime exposes the same control surface. |
| **Capability Classification** | Distinguish `GOVERNED`, `OBSERVED`, and `OPAQUE` integrations. |
| **Action Runtime** | Proposal/approval/decision/outcome contracts with durable pre-dispatch evidence on supported paths. |
| **Session Runtime** | Append-only local session history, deterministic projection, and approval-safe restart recovery. |
| **AgentFuse Integration** | Policy evaluation on reviewed execution-before seams; an allow decision is not treated as execution success. |
| **Evidence v0.2** | Canonical evidence contract that keeps request, authorization/decision, argument binding, execution lifecycle, and outcome distinct. |
| **Runtime Projection** | Offline projection from approved source profiles into canonical Evidence while preserving unknowns and source limitations. |

### Coding-agent product surface

| Feature | Description |
|:--|:--|
| **Provider SDK** | Unified interface for OpenAI, DeepSeek, OpenRouter, and compatible endpoints. |
| **Context Engine** | Structured prompt assembly: Rules → Memory → Skills → Metadata → Files → Task. |
| **Agent Runtime** | Task lifecycle with streaming, cancellation, and event bus. |
| **Managed Python** | User-installed private CPython runtime for pinned, reviewed bridge/proof paths. |
| **Diff Engine** | User-approved patches for selected local text files, with stale-content checks, verified writes, and session rollback. |
| **Git Runtime** | Checkpoints, commits, branches, and restore operations. |
| **Skill Runtime** | Domain-specific guidelines via Markdown skills and keyword resolution. |
| **MCP Runtime** | External tool discovery with permission-gated execution. |
| **Multi-Agent Runtime** | Coordinator + specialists for review, refactor, research, and testing workflows. |
| **Project Runtime** | Open local projects, build file trees, and read/select files. |

---

## Repository Structure

```text
qodex/                      ← legacy repository name
├── apps/desktop/           ← Tauri + React desktop UI
├── packages/
│   ├── provider-sdk/       ← model provider abstraction
│   ├── agent-runtime/      ← task execution orchestration
│   ├── session-runtime/    ← durable session ledger and recovery
│   ├── project-runtime/    ← file system access
│   ├── context-engine/     ← context assembly pipeline
│   ├── diff-engine/        ← patch generation and apply
│   ├── git-runtime/        ← Git operations and checkpoints
│   ├── planning-runtime/   ← task planning and dependencies
│   ├── execution-graph-runtime/ ← graph-based execution
│   ├── i18n-runtime/       ← internationalization
│   ├── marketplace-runtime/← skill marketplace and registry
│   ├── skill-runtime/      ← skill loading and resolution
│   ├── mcp-runtime/        ← MCP tool management
│   └── multi-agent-runtime/← multi-agent orchestration
├── python/
│   ├── kerniq_evidence_conformance/ ← Evidence v0.2 conformance
│   ├── kerniq_evidence_projection/  ← reviewed offline source projection
│   └── kerniq_external_validation/  ← minimal local external validator (pilot)
├── docs/                   ← specifications, proofs, guides, development logs
└── qodex-config/           ← AI agent workspace (rules, memory, ADRs, skills)
```

> **Legacy compatibility:** The `@qodex/*` package scope, `qodex-config/`, and
> related persisted identifiers remain unchanged during the KerniQ brand
> migration to avoid breaking existing integrations and local data.

---

## Validation & Tests

Core workspace tests:

```bash
pnpm -r test
```

GitHub CI status is shown by the workflow badge at the top of this README. Static repository-wide test-count badges are intentionally avoided because test scopes evolve independently.

The Evidence Projection v0.5.2 freeze independently executed these offline suites on CPython 3.11 and 3.13:

| Suite | Count |
|:--|--:|
| LangChain limited projection | 32 passed |
| DSH projection | 21 passed |
| Evidence v0.2 conformance | 46 passed |
| **Total** | **99 passed** |

The existing GitHub CI workflow does **not** currently execute those three new offline Evidence suites; the 99-test result above is independent freeze-time validation, not remote Evidence CI coverage. See the
[v0.5.2 freeze record](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md) for the exact command and claim boundary.

---

## Documentation

| Document | Description |
|:--|:--|
| [Quick Start](docs/QUICK_START.md) | Get running in 10 minutes |
| [Installation](docs/INSTALLATION.md) | Setup for macOS / Windows / Linux |
| [Architecture](docs/ARCHITECTURE.md) | Product architecture |
| [Evidence Projection v0.5.2 Freeze](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md) | Frozen Evidence v0.2 / DSH / limited LangChain projection claims and non-claims |
| [External Validator Pilot README](docs/development/kerniq_langchain_external_validator_v0_6_3.md) | Minimal local external validation CLI for one frozen OBSERVED LangChain profile |
| [Dev Log](docs/development/DEVLOG.md) | Development history |
| [Product Roadmap](docs/development/PRODUCT_ROADMAP.md) | Product and distribution milestones |
| [ADR Records](qodex-config/adr/) | Architecture Decision Records |
| [Release Notes](docs/development/RELEASE_NOTES_v0.2.0-beta.2.md) | v0.2.0-beta.2 changelog |

---

## Version Tracks

KerniQ has more than one development track:

- **Product/runtime milestones** cover the desktop product, native execution, Coding Pack, installation, and runtime integrations.
- **Evidence/protocol proof milestones** cover Evidence contracts, source qualification, projection, and proof boundaries.

These tracks intentionally use their own milestone numbering. **Evidence Projection v0.5.2 is not a claim that the whole KerniQ product release has moved backward to product v0.5.2.** Historical product milestones such as v0.6.x and v0.7.x remain valid in their own track.

---

## Development History / Proven Milestones

The sections below preserve bounded historical product milestones and their original non-claims. They should not be read as expanding the current capability model above.

## Minimal Agent Loop v0.4

KerniQ can run a bounded multi-turn coding-agent loop with verified
OpenAI-compatible providers. Agent Mode can search eligible project text,
read bounded file ranges, propose existing-file patches, and return approved
project test results to the model for a limited failure-to-fix iteration.

Two separate approval boundaries remain mandatory:

- Source changes use `KERNIQ_PATCH_V1`, an exact Diff Viewer, explicit Apply or
  Reject, stale-content checks, and write readback verification.
- Project commands must come from the trusted `package.json` or Cargo catalog.
  Every execution displays the exact executable, arguments, relative working
  directory, and source before a one-time Approve or Deny decision.

Applied patches are retained in per-task memory so the latest patch or all task
patches can be rolled back in reverse order with conflict and readback checks.

Agent Mode is deliberately constrained. Cataloged project scripts are not an OS
sandbox and may have side effects. KerniQ does not provide an arbitrary terminal,
automatic approval, new-file creation, file deletion, automatic Git commits,
MCP tools, or persistent task history in v0.4. Native command execution is
desktop-only; browser mode keeps read tools, approved patches, and rollback but
returns an explicit unsupported result for commands. Tool-agent support is
limited to verified OpenAI-compatible providers and models.

## Real Patch Loop v0.3

KerniQ supports a first real model-to-file patch loop for selected existing local
text files. A configured model may return a versioned `KERNIQ_PATCH_V1` proposal;
KerniQ parses and validates it, shows the generated unified diff, and writes only
after explicit approval. Applied changes are re-read for verification and can be
rolled back to their exact original contents during the current app session.

This flow is approval-driven, not autonomous. It does not create or delete files
or persist rollback data across app restarts.

In Tauri desktop mode, KerniQ uses the native directory dialog and grants file
access only to the project directory selected for that session. Browser
development mode keeps the File System Access API fallback. Both modes replace
only selected existing text files through the same Diff Engine approval flow.
Project selection and rollback history are not persisted across restarts, and
installer artifacts are not yet published.

## Session Restart Safety v0.5.1

Mutating Agent actions use a durable pre-dispatch receipt: patch writes and
cataloged commands start only after fresh approval evidence and a started event
have committed to the local session ledger. A restart with started-but-unsettled
evidence is shown as `Interrupted`; KerniQ does not replay it or offer another
approval. Pending actions that never started require project reauthorization
and a new approval generation.

Session persistence and redacted export apply bounded local scanning for
recognised credential and absolute-path patterns. Sensitive patch contents are
not retained for recovery. This is defense in depth and does not claim to detect
every possible secret.

## Settlement Evidence Honesty v0.5.2

KerniQ distinguishes persistence failure before dispatch from failure to record
the final outcome after dispatch. If approval or started evidence cannot be
committed, the filesystem write or command process does not start. If dispatch
has started but its settlement evidence cannot be committed, the Session becomes
`Interrupted` with an unknown physical outcome, or retains the unmatched started
receipt for recovery to classify the same way.

An ordinary completed, failed, cancelled, or limit-reached Session event cannot
hide a started-but-unsettled action. Recovery checks that evidence before trusting
a cached terminal status. KerniQ does not replay or reapprove the action and does
not continue the provider. SQLite evidence and external filesystem or process
side effects are not transactionally atomic, so the product deliberately avoids
inventing whether the physical operation completed.

## Managed Python and AgentFuse Foundation v0.6.0

KerniQ can explicitly install and verify a private CPython runtime without
changing system Python or a project environment. The v0.6.0 bridge pins the
canonical DHMS AgentFuse source and uses it for one development-only bounded
counter proof. AgentFuse allow is a pre-dispatch policy decision, not an
execution-success claim. Patch and Command behavior is unchanged and is not
routed through AgentFuse in this milestone.

The v0.6.0.1 correction validates every approval, decision, started receipt,
and outcome before dispatch or settlement. A durable `ACTION_DECIDED` record
precedes every generic Action dispatch. If terminal evidence cannot be
committed after a handler runs, the Action is `Interrupted` with an unknown
physical outcome and is not replayed. Managed runtime verification compares
all installed trees with compile-time trusted digests, and the bridge uses the
public DHMS AgentFuse 3.6.0 `evaluate()` API under one 15-second bridge-session
deadline.

The DHMS historical evidence milestone remains `v3.5.2`; the package version
is independent, and the evidence schema remains
`agentfuse-evidence-schema-v0.1`.

## Project Command AgentFuse Gate v0.6.1

KerniQ has one bounded native Desktop Project Command path protected by
explicit approval, canonical AgentFuse decision evidence, durable start
evidence, and native catalog re-resolution. It retains direct no-shell
execution and honest interruption when final persistence is uncertain.

The real Tauri proof covers allow, human deny, canonical block, decision/start
persistence barriers, settlement uncertainty, restart no-replay, invalidation
of unstarted pre-restart authority, and controlled duplicate approval. This
does not claim that every project script is harmless, every KerniQ action is
AgentFuse-protected, browser execution is protected, or arbitrary direct IPC
calls have permanent global exactly-once semantics.

See the
[Project Command adapter plan](docs/development/kerniq_project_command_action_runtime_adapter_planning_v0_6_1.md)
and [real Tauri proof](docs/development/kerniq_project_command_real_tauri_proof_v0_6_1_6.md).
The [final freeze seal](docs/development/kerniq_v0_6_1_project_command_final_freeze.md)
records the exact merged evidence chain and bounded non-claims. It is active on
`main`; the next implementation milestone has not started.

## Coding Pack v0.7

KerniQ now includes the browser-safe v0.7.1 manifest contracts, the merged
v0.7.2 deterministic selection/privacy core, and the merged v0.7.3 read-only
Desktop preview for explicitly selected files. v0.7.3 adds exact authorized
byte reads, manual refresh, and an in-memory confirmation bound to that exact
preview. A shared path-only read plan excludes private, credential-like,
vendor, generated, project-ignored, and binary-like paths before source bytes
are requested. Candidate count is checked before reading, cumulative eligible
bytes are bounded during reading, and selected-path identity is recomputed from
the complete selection evidence. The Tauri path rejects symlinks and junctions
observed during bounded pre-read checks; it does not claim race-free protection
against concurrent filesystem replacement. v0.7.4.1 merged in
`c3f7c9cef73cb9660f9b4d39c325dc8c4e3f5170` and adds a dedicated durable
Coding Pack store, opaque local destination bindings,
exact export proposals, and separate export approvals. It records only
`PACK_PROPOSED` and `PACK_CONFIRMED`; confirmation reports “No files written”
and does not imply a policy decision. The reviewed hardening follow-up uses
UTF-8 byte canonical identity, exact pack/destination formats, 24-hour proposal
and approval limits, immutable destination bindings, atomic operation
snapshots, native digest and chronology validation before persistence, and
SQLite WAL with `synchronous=FULL`. Recovered operations remain non-actionable
historical records. v0.7.4.2 merged through
`6d592a199d5d4ee65663f107f64dfbb91cd1d8e5` and adds the independent
`kerniq-coding-pack-export-v1` AgentFuse profile and a trusted digest-only
request. It durably records exactly one `PACK_DECIDED` allow, deny, or error
event in store schema v2. Each attempt binds `evaluationStartedAt`; a late
allow/block is persisted as terminal error evidence, while bridge errors may be
recorded after expiry when evaluation began in-window. Responses use exact-key
validation and the destination capability is revalidated immediately before
evaluation. The durable event is at-most-once, while AgentFuse invocation is
guarded only within the current process and is not claimed exactly-once across
crashes. v0.7.4.3 adds the first Tauri-only physical export. A current preview
and confirmation, live proposal and approval, durable policy allow, trusted
private project/destination bindings, and native exact-source revalidation are
required before `PACK_EXPORT_STARTED`. The command stages the canonical
`manifest.json` and included source bytes relative to one retained destination
directory handle, uses macOS handle-relative rename-exclusive promotion, and
then durably syncs that destination before persisting
`PACK_EXPORT_COMPLETED`; pre-promotion failure records
`PACK_EXPORT_INTERRUPTED`. Completion-persistence failure keeps the promoted
target and reports an uncertain `export_started` state without automatic
retry. A post-promotion destination-sync failure also remains
`export_started`, with a distinct uncertainty error and no automatic retry.
Windows physical export fails closed before START because this release does
not provide a reviewed handle-relative Windows promotion primitive; the UI
states that limitation. Browser mode reports “Native Desktop required for
atomic export.”
Recovered records remain historical and non-actionable. The
[v0.7 plan](docs/development/kerniq_v0_7_coding_pack_product_integration_planning.md)
and [ADR-022](qodex-config/adr/ADR-022-Coding-Pack-Product-Integration.md)
define the lifecycle. Automatic repository discovery, `.gitignore` parsing,
content secret scanning, browser physical export, restart replay, and Action
Runtime export dispatch are not implemented. There is no cross-filesystem copy
fallback.
The v0.6.1 Project Command freeze is unchanged.

v0.7.4.3 merged through `4b0379e051a15cf49a6a9134f5b73d9f8171231b`.
The [controlled real native proof](docs/development/kerniq_v0_7_4_4_native_export_proof.md)
passed on macOS with real SQLite, pinned AgentFuse, and real native filesystem
promotion. The
[v0.7 result review](docs/development/kerniq_v0_7_coding_pack_result_review_and_freeze.md)
freezes this bounded Coding Pack line. Post-freeze changes are limited to
security, proof, installation, compatibility, and real-user-feedback defects.

---

## Roadmap

The authoritative roadmap is maintained in
[PRODUCT_ROADMAP.md](docs/development/PRODUCT_ROADMAP.md). v0.4.1 is frozen;
v0.6 is merged and frozen as the managed Python and universal action
foundation. The bounded native Desktop Project Command path is implemented and
its v0.6.1.6 implementation, real proof, and final freeze seal are merged. The
v0.6.1 Project Command scope is frozen. Coding Pack v0.7.3 is merged through
`5d5152ca25c0fc2772cec730dd6229dd44aa88cb`; v0.7.4.1 merged through
`c3f7c9cef73cb9660f9b4d39c325dc8c4e3f5170`; v0.7.4.2 merged through
`6d592a199d5d4ee65663f107f64dfbb91cd1d8e5`; and v0.7.4.3 Tauri-only native
atomic export merged through `4b0379e051a15cf49a6a9134f5b73d9f8171231b`.
The controlled v0.7.4.4 real proof passed and the v0.7 Coding Pack boundary is
frozen. Patch remains outside this scope.
Installer work is planned for v0.8, and the Stage 2 namespace-wide rename
remains explicitly deferred.

---

> **Status note:** KerniQ was formerly Qodex. Brand migration, logo/icon assets,
> TypeScript build fixes, and GitHub Actions CI are complete. Signed installer
> and release artifact work is planned for v0.8. Stage 2 internal namespace
> rename is deferred.

---

## For Contributors

- Setup: `pnpm install && cd apps/desktop && pnpm dev`
- Tests: `pnpm -r test`
- ADRs: `qodex-config/adr/`
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full details

---

## License

MIT — see [LICENSE](LICENSE).
