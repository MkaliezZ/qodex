# KerniQ v0.6.0 Managed Python and Action Runtime

**Date:** 2026-07-24  
**Status:** v0.6.0.1 correction and local validation complete; Draft PR CI pending

## Delivered

- `@qodex/action-runtime` with proposal, approval, decision, dispatch, and
  outcome separation
- `@qodex/python-runtime` contracts for manifest selection, lifecycle,
  protocol bounds, and environment policy
- `@qodex/agentfuse-adapter` with strict response validation and fail-closed
  decision errors
- Tauri-managed private CPython provisioning with pinned hashes, safe extraction,
  exclusive locks, recovery, atomic promotion, verification, and removal
- canonical DHMS AgentFuse bridge pinned to commit
  `af08d80abaeb196da1e66d9e74c2d1c7002c9c2e` and public decision-only API
- Settings runtime status and explicit lifecycle controls
- optional approval-driven allow/deny proof using a trusted in-memory counter
- independent `ACTION_DECIDED` Session evidence before generic Action start
- embedded installed-tree integrity anchors for every distribution, canonical
  AgentFuse source, and the KerniQ bridge

## Security Boundaries

The managed interpreter starts without a shell and receives fixed arguments.
The runtime does not use system Python, global pip, project environments,
model-selected downloads, arbitrary imports, arbitrary paths, or provider
credentials. The download manifest is embedded and hash pinned. Unsafe archive
links, special entries, absolute paths, and parent traversal are rejected. Safe
archive-internal symlinks are materialized as ordinary files; escaping targets,
hardlinks, and unresolved links fail closed.

The proof handler is not registered in ordinary production builds. It can be
enabled only with `VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1`, accepts a fixed trusted
sandbox ID, and increments one private in-memory counter. It cannot modify the
current project.

## Canonical Decision Boundary

Python DHMS AgentFuse 3.5.1 remains authoritative for the proof policy decision
through public `RuntimeGuard.evaluate()`.
TypeScript maps contracts and validates evidence; Rust provisions and supervises
the process; Action Runtime alone dispatches the registered handler after an
awaited durable decision record and started receipt.

Patch and Command paths are unchanged and are not routed through AgentFuse in
v0.6.0.

## Deterministic Evidence

Local validation covers:

- strict Action Runtime record validation and at-most-once dispatch tests
- honest interruption and no-replay behavior after settlement persistence failure
- `ACTION_DECIDED` projector order, identity, and legacy-ledger tests
- Python Runtime manifest, state, environment, and protocol tests
- AgentFuse Adapter identity, evidence, and failure tests
- Python bridge protocol and pinned canonical source tests
- native path, lock, extraction, promotion, environment, output, and command
  boundary tests, including embedded-anchor tamper rejection after mutable
  record recalculation
- desktop proof allow, deny, bridge-failure, settlement-fault, restart,
  duplicate-call, and Session ledger integration tests

The one-shot bridge enforces one `bridge_session_timeout=15s` deadline over
hello, decision work, and shutdown. It does not claim independently enforced
startup and request deadlines.

Local validation passed frozen installation, workspace build, 1,460 workspace
tests, Desktop unit tests (54), Desktop E2E (56 passed and four credential-gated
scenarios skipped), canonical Python bridge tests (8), native Rust tests,
verified production runtime/source archive extraction, debug Tauri build, and
`git diff --check`. The workspace lint command completed successfully and
reported that no selected package defines a lint script.

The real macOS x86_64 smoke used an isolated application-data root and a
user-initiated production download. CPython 3.12.13 and canonical AgentFuse
commit `8c6ae9875b3618a529d5150c96385da7461099c2` installed under the private
managed root after SHA-256 verification. Self-check returned allow and deny
with zero deny dispatches. The approval-driven proof dispatched the allow
handler exactly once (`counter=1`) and dispatched the deny handler zero times.
The Session SQLite ledger retained proposal, approval, decision, execution
receipt, outcome, source revision, policy, and schema identities. Full app
stop/restart reverified the runtime and repeated self-check successfully;
system Python remained 3.14.6 and no bridge or bytecode-cache orphan remained.

Visual evidence is stored under `docs/assets/runtime-smoke/v0.6.0/`. Draft PR
CI remains required before the final review verdict.

## v0.6.0.1 Correction

The earlier smoke paragraph above documents the original v0.6.0 candidate and
its then-current pin. v0.6.0.1 supersedes that runtime pin with
`af08d80abaeb196da1e66d9e74c2d1c7002c9c2e` and requires a new correction
smoke. Normal allow must persist `ACTION_DECIDED` before `ACTION_STARTED`.
Injected settlement failure must persist or recover to `Interrupted`, retain
the unmatched execution receipt, expose no ordinary completed/failed result,
and perform no replay. Installed runtime truth now comes from compile-time tree
digests rather than mutable profile evidence.

The correction passed 1,486 workspace tests, 56 Desktop unit tests, 56 Desktop
E2E scenarios with four credential-gated scenarios skipped, 8 canonical bridge
tests, and 34 native Rust tests with two maintenance tests explicitly ignored.
The Action, Session, Python, and AgentFuse Adapter packages passed 35, 73, 15,
and 15 tests respectively. Frozen install, workspace build, formatting, native
check, debug Tauri build, bridge compileall, and `git diff --check` also passed.
The lint command completed successfully and reported no configured package lint
scripts.

The new real macOS x86_64 correction smoke proved durable allow decision before
start, deny without start, and settlement persistence failure as
`Interrupted/unknown_or_interrupted` with one physical mutation and zero
replay. SQLite retained the exact decision, approval, receipt, policy, schema,
and canonical commit identities. Restart offered neither replay nor reapproval.
Tampering with `runtime_guard.py` remained Broken after recalculating the
mutable local record; bridge/proof dispatch stayed unavailable. Explicit
Settings Repair restored Ready and self-check, and a full app stop left zero
orphan managed Python processes.

## Known Limitations

- v0.6.0 is a foundation and one isolated proof, not general Python execution.
- Patch and Command retain their existing safety runtimes.
- The proof counter is disposable and development-only.
- No real Windows provisioning smoke is claimed; Windows CI verifies native
  compilation, path handling, manifest selection, extraction, and orchestration
  tests.
- Managed runtime distribution is not yet a signed installer feature.
