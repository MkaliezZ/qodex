# KerniQ Control Plane Vertical Slice v0.1

Date: 2026-08-29

Status: PARTIAL

## Repository baseline

- Repository: `MkaliezZ/qodex`
- Default branch: `main`
- Verified implementation baseline: `origin/feat/kerniq-agent-backend-conformance`
- Baseline commit: `b59d4eda5d091cf67becf94454234a248560cd98`
- Open PR at audit time: draft PR #26, unrelated CodeWhale governed-engine spike
- The remote `main` branch did not yet contain the AgentBackend abstraction, DSH adapter boundary, and conformance commits, so this spike starts from the latest verified conformance branch.

## Fresh architecture findings

Current execution paths are separate:

```text
Desktop Agent Mode
  -> AgentLoopRuntime
  -> Provider SDK model stream
  -> read tools OR pending Project Command
  -> human approval
  -> durable COMMAND_APPROVED
  -> AgentFuse decision
  -> durable ACTION_DECIDED
  -> durable COMMAND_STARTED
  -> Tauri cataloged command runner
  -> durable outcome
```

```text
AgentBackend boundary
  -> MockAgentBackend (deterministic tests)
  -> DeepSeekHarnessBackend (injectable transport contract only)
  -> CodeWhaleBackend (placeholder)
```

The existing `multi-agent-runtime` Coordinator is not product evidence. It uses fixed `MOCK_OUTPUTS` and simulated delays. This slice does not reuse it for the real proof.

The existing AgentFuse boundary protects KerniQ-owned Project Command dispatch. It cannot intercept arbitrary shell or tool execution performed inside an opaque Codex or Claude Code subprocess. Moving that boundary would require a supported pre-execution hook or a new AgentFuse bridge capability, both outside this task.

## Real agent availability

### Codex

- Available: yes
- Version: `codex-cli 0.151.0-alpha.7.1`
- Control surface: non-interactive `codex exec --json`
- Observed lifecycle: thread start, turn start/completion, model messages, read-only command tool events, usage
- Real structured output: yes
- External governance interception: no

### DeepSeek Harness

- Locally installed: no
- Executable/SDK version: unavailable locally
- Current official source reviewed: commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`, package/tag `0.1.1-rc.2`
- External control surface: `initialize`, `session/prompt`, event/status notifications, `shutdown`
- Missing for this proof: externally paused tool request, externally supplied tool result, and turn cancellation
- Result: DSH cannot be the second governed real agent in this environment.

### Explicit substitution

- Agent B: Claude Code
- Version: `2.1.91`
- Actual model reported by the process: `deepseek-v4-pro[1m]`
- Control surface: non-interactive `claude -p --output-format stream-json`
- Read-only tools: `Read`
- Observed lifecycle: process initialization, model messages, tool calls, structured output, completion
- External governance interception: no

Codex and Claude Code are independent installed agent runtimes. This is not the same provider called twice and not two functions pretending to be agents.

## Implemented slice

The new `ControlPlaneSupervisor` provides only:

- bounded task and worker statuses;
- explicit adapter capability metadata;
- parallel execution of independent adapters;
- lifecycle and observation collection;
- raw result hash references;
- deterministic file-evidence and bounded semantic reconciliation;
- explicit governance limitation evidence.

It does not provide a workflow DSL, autonomous planning, tool execution, policy evaluation, or a second approval path.

The real CLI adapters live only in the reproducible validation script. Unit tests use injected deterministic adapters but are not counted as product proof.

No dashboard was added. Under Hard Stop B, a UI showing an invented governance decision would be misleading, while a thin process monitor would add little beyond the evidence receipt.

## Real run evidence

Receipt: `validation/evidence/kerniq_control_plane_vertical_slice_v0_1.json`

- Task started: `2026-08-29T13:52:32.638Z`
- Task completed: `2026-08-29T13:59:29.729Z`
- Both workers entered `starting`/`running` from the same supervisor dispatch window.
- Codex completed: `2026-08-29T13:54:00.840Z`
- Claude Code completed: `2026-08-29T13:59:29.729Z`
- Both returned three findings with repository-relative line evidence.
- Both exposed real read-only tool observations.
- Raw outputs are referenced by SHA-256 digest rather than private local paths.
- Supervisor result: `DISAGREEMENT`
- Semantically matched findings: none. Shared file references were not treated as agreement.
- Shared risk files: `apps/desktop/src-tauri/src/lib.rs`, `packages/marketplace-runtime/src/installer/installer.ts`
- Codex-only risk file: `packages/marketplace-runtime/src/registry/sync.ts`
- Claude-only risk file: `packages/agent-runtime/src/agent-loop/runtime.ts`

The receipt contains no API keys, tokens, home-directory paths, or raw process transcripts.

## Governance result

Hard Stop B triggered.

```text
REAL_AGENT_CONTROL=true
AGENTFUSE_REAL_INTERCEPTION=false
STATUS=CONTROL_PROVEN_GOVERNANCE_BLOCKED
```

Candidate action: `git push`

- Decision: `unknown`
- Dispatch occurred: `unknown`
- Handler started: `unknown`
- Outcome: `not_tested`

No push was requested from either agent. No dispatch was attempted. KerniQ cannot currently place AgentFuse before the agents' internal execution boundary, so a denial would not be truthful product proof.

## Product usefulness

- Unified task context: YES
- Parallel agent control: YES
- Lifecycle visibility: PARTIAL
- Result reconciliation: YES
- Unified governance: NO
- Human cognitive load reduction: MODERATE
- Product killer test: PARTIAL

The slice is better than two terminals for one bounded review because it launches both agents under one task, records comparable lifecycle facts, validates structured evidence, and preserves agreement and disagreement. It is not yet a governed control plane. The long-running agent exposes only coarse progress, cancellation is not implemented, and internal tool execution remains outside KerniQ authority.

## Validation notes

- `pnpm --filter @qodex/multi-agent-runtime test -- control-plane.test.ts`: 6/6 passed.
- `pnpm --filter @qodex/multi-agent-runtime test`: 201/201 passed across 23 files.
- `pnpm --filter @qodex/agent-runtime test`: 124/124 passed across 14 files.
- Source-only `tsc --noEmit` for the new control-plane files: passed.
- Package-level TypeScript check remains blocked by the existing `rootDir: src` plus `include: tests` configuration (`TS6059` for all package tests).
- `pnpm build`: passed, including the Desktop production build. Vite reported the existing chunk-size advisory.
- First cold-worktree `pnpm test`: stopped when `coding-pack-agentfuse` could not resolve an unbuilt `coding-pack-store` package entry.
- `pnpm test` after `pnpm build`: 1,836/1,836 passed across all 21 package test scripts.
- `pnpm lint`: unavailable; none of the 21 selected packages defines a `lint` script.
- `node validation/run_kerniq_control_plane_vertical_slice_v0_1.mjs`: completed with both real workers successful and `DISAGREEMENT`.
- `git diff --check`: passed before final commit review.

## Smallest next step

Do not expand the dashboard first. Obtain or define one supported pre-execution adapter boundary for one real agent that pauses a protected call and accepts an externally supplied result. Until that exists, keep `supportsExternalGovernance=false` and do not claim unified governance.
