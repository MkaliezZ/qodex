# KerniQ v0.6.0 Managed Python and Action Runtime

**Date:** 2026-07-24  
**Status:** Implementation complete; final review and CI pending

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
  `8c6ae9875b3618a529d5150c96385da7461099c2`
- Settings runtime status and explicit lifecycle controls
- optional approval-driven allow/deny proof using a trusted in-memory counter
- existing Session ledger evidence for the proof action

## Security Boundaries

The managed interpreter starts without a shell and receives fixed arguments.
The runtime does not use system Python, global pip, project environments,
model-selected downloads, arbitrary imports, arbitrary paths, or provider
credentials. The download manifest is embedded and hash pinned. Archive links,
special entries, absolute paths, and parent traversal are rejected.

The proof handler is not registered in ordinary production builds. It can be
enabled only with `VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1`, accepts a fixed trusted
sandbox ID, and increments one private in-memory counter. It cannot modify the
current project.

## Canonical Decision Boundary

Python DHMS AgentFuse remains authoritative for the proof policy decision.
TypeScript maps contracts and validates evidence; Rust provisions and supervises
the process; Action Runtime alone dispatches the registered handler after an
awaited durable Session receipt.

Patch and Command paths are unchanged and are not routed through AgentFuse in
v0.6.0.

## Deterministic Evidence

Local validation covers:

- Action Runtime contract and at-most-once dispatch tests
- Python Runtime manifest, state, environment, and protocol tests
- AgentFuse Adapter identity, evidence, and failure tests
- Python bridge protocol and pinned canonical source tests
- native path, lock, extraction, promotion, environment, output, and command
  boundary tests
- desktop proof allow, deny, bridge-failure, duplicate-call, and Session ledger
  integration tests

The final validation record must include repository build/lint/test, Desktop
unit and E2E suites, Rust locked checks, debug Tauri build, real macOS managed
runtime provisioning/restart smoke, Draft PR CI, and `git diff --check`.

## Known Limitations

- v0.6.0 is a foundation and one isolated proof, not general Python execution.
- Patch and Command retain their existing safety runtimes.
- The proof counter is disposable and development-only.
- No real Windows provisioning smoke is claimed; Windows CI verifies native
  compilation, path handling, manifest selection, extraction, and orchestration
  tests.
- Managed runtime distribution is not yet a signed installer feature.
