# KerniQ v0.3 Governed Multi-Agent Product Wiring

## Resume State

LAST_COMPLETED_PHASE=9
CURRENT_PHASE=COMPLETE
CURRENT_HEAD=c4d90b05e3dd74e6d6bc2d2c2bb80fc68502f0a3 (pre-commit base)
FILES_CHANGED=checkpoint doc; multi-agent control-plane types/governance/supervisor/product runtime/backends/tests; session-runtime safe metadata; desktop product hook/native transports/session ledger/view model/existing UI wiring/tests/styles; pnpm-lock.yaml
TESTS_ALREADY_PASSED=focused product tests 14/14; multi-agent-runtime 219/219; agent-runtime 124/124; session-runtime 88/88; desktop 185/185; repository 1859/1859; Playwright 59/59 plus focused product path 1/1; Tauri 69 passed and 3 ignored; pnpm build; strict multi-agent source typecheck; Desktop visual and console inspection
REAL_RUNTIME_PROOFS_ALREADY_REUSED=v0.2 protocol evidence was reused for design; v0.3 additionally completed real Desktop product BLOCK, ALLOW, and governance-admission fail-closed runs with real Codex and pinned DSH/DeepSeek
NEXT_EXACT_ACTION=Review final diff, run diff and secret checks, create the bounded commit, and push the feature branch.
BLOCKERS=none

## Phase 0 Repository Truth

- Start branch: `feat/kerniq-dsh-agentfuse-governance-v0-2`
- Start and remote v0.2 head: `c4d90b05e3dd74e6d6bc2d2c2bb80fc68502f0a3`
- Working branch: `feat/kerniq-control-plane-product-wiring-v0-3`
- Worktree was clean before v0.3 edits.

## Phase 1 Architecture Audit

Verified facts:

1. Desktop execution remains primarily single-agent. `useRuntime()` owns the current provider loop, bounded patch and Project Command approval flow, and its session recorder.
2. `ControlPlaneSupervisor` is used only by its package tests and validation scripts. Desktop does not import or instantiate it.
3. `useRuntime.ts` is already a large orchestration hook and is not an appropriate owner for backend admission, parallel worker lifecycle, reconciliation, and ledger linking.
4. Universal Session Ledger already provides durable, redacted session entries and safe metadata. It should be extended only with bounded worker correlation fields.
5. The verified v0.2 DSH governance evidence exists as a sanitized proof receipt, but no product `WorkerRun` currently carries that evidence.
6. `ControlPlaneTaskResult.governance` still emits the v0.1 task-level `git push` limitation. This is stale because governance is a worker/runtime/action fact.
7. The current supervisor requires exactly two independent runtime kinds. v0.3 should preserve a two-worker product limit without presenting it as the permanent architecture.
8. `@qodex/agent-runtime` already defines a streaming protocol `AgentBackend`. The multi-agent product contract must compose with it rather than replace its inert tool-request boundary.
9. The Tauri Project Command bridge is deliberately catalog-bound and project-root-authorized. It must not become a generic shell escape for launching agent backends.
10. `ContextPanel` currently renders static Git values (`main`, `0 changed`). They are not observed facts and must not be shown as control-plane execution truth.

## Smallest Integration Seam

Use four narrow pieces:

1. A provider-neutral product backend contract in `multi-agent-runtime` for capability admission and one bounded task execution. It carries identity, lifecycle observations, structured result, worker governance tier/mode, and sanitized evidence.
2. `ControlPlaneSupervisor` remains the bounded two-worker coordinator and reconciliation owner. It snapshots each backend's admitted capabilities and attaches worker-level governance.
3. A separate desktop `ControlPlaneRuntime`/hook owns one active product task, durable worker Session creation, recorder coordination, and view-model state. Existing `useRuntime()` remains responsible for the existing single-agent path.
4. Backend process launch crosses a dedicated, typed, bounded transport. It must validate supported backend/runtime identity and must fail before launch when `governanceRequired=true` cannot be admitted. It must not reuse or weaken the Project Command approval/execution boundary.

The existing `AgentTimeline`, `PromptBar`, `ContextPanel`, `SessionsView`, and Session Ledger remain the presentation and evidence surfaces. DSH `ask` stays fail-closed unless it can use the existing one-shot approval path without introducing a second approval architecture.

## Preserved Safety Boundaries

- AgentFuse protocol and policy evaluation are unchanged.
- Action Runtime and Project Command catalog are unchanged.
- Evidence schema semantics remain unchanged: decision and outcome are distinct, and unknown is never converted to false.
- Agent backends do not execute KerniQ tools, approve actions, or create a second command path.
- No runtime may silently downgrade a governance-required task.

## Phases 2-3 Governance and Backend Contract

- Governance tiers are `OPAQUE`, `OBSERVED`, and `GOVERNED`; integration modes are `none`, `host_dispatch`, `pre_dispatch_plugin`, and `external_decision`.
- Governance capability and per-run evidence now belong to each `WorkerRun`. The stale task-level governance limitation was removed.
- The product `AgentBackend` performs capability admission before `startTask()`. All configured backends are admitted before any worker starts.
- A `governanceRequired` worker whose admitted tier is not `GOVERNED` throws `GovernanceAdmissionError` before either backend starts.
- The ambiguous `supportsExternalGovernance` helper remains only as a deprecated derived alias of `isGovernedTier`; capability records use tier and mode.
- The bounded supervisor limit is explicit as a current product limit of two, not described as a permanent platform architecture.

## Phases 4-7 Product Backends and Durable Linkage

- `CodexObservedBackend` and `DshGovernedBackend` share the generic product backend contract and use injectable process transports.
- Codex is admitted only as `OBSERVED` with mode `none`; direct governed-task calls fail before transport execution.
- DSH is admitted as `GOVERNED` only when the compatible runtime, AgentFuse adapter, pre-dispatch seam, governed profile, and evidence capture checks all pass. Admission is repeated at task start to prevent state-drift downgrade.
- `ControlPlaneProductRuntime` creates both worker sessions before Supervisor execution and permits only one top-level control-plane task at a time.
- `DesktopControlPlaneSessionLedger` persists structured findings, lifecycle summaries, tool-call identity, governance facts with provenance, reconciliation, and terminal state. It never persists raw transcripts.
- DSH governance facts use `TOOL_REQUESTED`/`TOOL_COMPLETED` ledger entries and do not impersonate the existing KerniQ `ACTION_DECIDED` approval state machine.

## Phase 8 Existing Desktop UI Wiring

- A separate `useControlPlaneRuntime()` composes `ControlPlaneProductRuntime`, the two product backends, and `DesktopControlPlaneSessionLedger`; existing single-agent execution remains in `useRuntime()`.
- `PromptBar` exposes a bounded `Single Agent` / `Codex + DSH` choice and permits only one active Supervisor task.
- `AgentTimeline` reuses existing cards to show Supervisor, both worker identities, truthful tier/mode, reconciliation, and governance facts. Independently observed facts map to `YES`/`NO`; all other values remain `UNKNOWN`.
- `ContextPanel` shows real control-plane runtime, agent, model, governance, and worker status, and no longer presents static Git values as observed truth in Supervisor mode.
- `SessionsView` is unchanged and receives two completed worker sessions through the existing Session context and ledger.
- Deterministic product-path E2E passed through `PromptBar -> useControlPlaneRuntime -> ControlPlaneProductRuntime -> Session Ledger -> AgentTimeline/Inspector/Sessions`.
- Desktop visual inspection at 1440x900 showed no overlap or clipping in the completed Supervisor state. Browser console warnings/errors were empty.

## Phase 9 Real Product Proof

The acceptance runs originated in the real KerniQ Tauri Desktop through `Open Project`, the existing `PromptBar`, and `Codex + DSH` Supervisor mode. They used the audited DSH `0.1.2-alpha.1` revision `cd5ef8148158c3a752a658978873241fdf8e2bbc`, the installed `@dhms-agentfuse/dsh-agentfuse@0.2.1` adapter, and the real `deepseek-v4-flash` route. DSH telemetry was disabled and the child process was bounded to `workspace-write`.

- BLOCK: real Codex and DSH workers completed. The AgentTimeline showed DSH as `GOVERNED · pre_dispatch_plugin` with `Decision BLOCK`, `Dispatch NO`, `Execution NO`, and `Evidence PROVEN`. The observer recorded one pre-execute request and an adapter `deny`; the adapter boundary normalized that protocol value to KerniQ `block`. No diagnostic body marker or target existed.
- ALLOW: real Codex and DSH workers completed. The AgentTimeline showed `Decision ALLOW`, `Dispatch YES`, `Execution YES`, and `Evidence PROVEN`. The observer recorded pre-execute allow, dispatch, and a non-error result. The body marker matched the tool-call identity and the target bytes exactly matched the configured diagnostic token.
- FAIL CLOSED: with the evidence capture parent deliberately unavailable, DSH admission truthfully downgraded to `OBSERVED`. The Supervisor rejected `governanceRequired=true` before either worker process started; no marker or target existed and there was no fallback execution.
- Codex remained `OBSERVED · none`, executed a real read-only structured review in both positive product runs, and supplied captured results without any governance claim.
- Each BLOCK and ALLOW run created two durable SQLite-backed sessions before execution. The unchanged Sessions view showed four completed worker sessions, and DSH details reconstructed model findings, `Tool Requested`, governed `Tool Completed`, and `Session Completed` entries.
- Both real two-worker runs reached the existing Supervisor reconciliation path and truthfully reported `DISAGREEMENT`; shared file references were not treated as semantic agreement.
- Acceptance screenshots were captured under temporary `/tmp` paths only and were not added to the repository.

## Final Validation

- Focused control-plane unit tests: 14/14 passed.
- Multi-Agent Runtime: 219/219 passed.
- Agent Runtime: 124/124 passed.
- Session Runtime: 88/88 passed.
- Desktop Vitest: 185/185 passed.
- Full workspace tests: 1859/1859 passed.
- Playwright: 59/59 non-real-provider tests passed; focused control-plane product E2E 1/1 passed.
- Tauri: 69 passed, 3 explicitly ignored controlled proofs.
- `pnpm build`: passed, including Desktop `tsc` and Vite production build; the existing large-chunk warning remains non-blocking.
- Strict source-only Multi-Agent Runtime typecheck: passed.
- Standard Agent Runtime and Multi-Agent Runtime package typecheck commands remain blocked by the pre-existing `rootDir: src` plus `include: tests` TS6059 configuration. No v0.3 source error was observed by the passing source-only check, Desktop build, tests, or repository build.
