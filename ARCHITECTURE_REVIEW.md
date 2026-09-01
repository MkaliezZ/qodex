# KerniQ Agent Backend Architecture Review

## Review baseline

- Branch: `feat/kerniq-agent-backend-abstraction`
- Baseline commit: `8e12526e2f9fc1759bfbd3802bfec4a22182eaad`
- Baseline working tree: clean
- Review scope: `agent-runtime`, `provider-sdk`, `context-engine`, `action-runtime`, `session-runtime`, the desktop AgentFuse bridge, and the existing CodeWhale adapter package
- Constraint: this milestone introduces a transport boundary only. It does not wire an external backend into Desktop or change any governed side-effect path.

## Current execution flow

KerniQ currently has two related but distinct agent paths.

### Single-turn runtime

1. Desktop builds an assembled prompt with `ContextEngine`.
2. Desktop constructs `AgentRuntime` with a `ModelProvider` from `provider-sdk`.
3. `AgentRuntime.runTask` calls `ModelProvider.stream` directly.
4. Text chunks become task output and in-memory runtime events.

This path has no tool loop and is the normal single-turn fallback.

### Governed Agent Mode

1. Desktop builds an assembled prompt with `ContextEngine` and creates a durable session.
2. Desktop constructs `AgentLoopRuntime` with a `ModelProvider`, project read access, patch adapter, optional native command runner, and `AgentSessionLedgerRecorder`.
3. `AgentLoopRuntime` calls `ModelProvider.stream` with the canonical tool catalog.
4. Read-only tool requests are validated and executed by `AgentToolRegistry`.
5. A patch proposal pauses in `WaitingForPatchApproval`; no write occurs before explicit approval.
6. A Project Command request is resolved against the trusted command catalog and pauses in `WaitingForCommandApproval`.
7. After human approval, the desktop lifecycle records durable approval evidence and invokes the AgentFuse bridge through the Project Command decision coordinator.
8. Only a durable `allow` decision followed by durable started evidence permits `ProjectCommandRunner` dispatch.
9. Outcomes are recorded through the session lifecycle. Rollback remains owned by KerniQ's patch adapter and runtime.

The durable lifecycle remains:

`proposal -> approval -> decision -> started -> outcome`

The session ledger is append-only and projects recovery state from those events. An Agent Backend must not emit authoritative approval, decision, started, outcome, or rollback evidence.

## Existing backend coupling

- `AgentRuntimeOptions` requires a `ModelProvider` for single-turn execution.
- `AgentLoopRuntimeOptions` requires a `ModelProvider` and consumes provider-specific stream normalization through `ModelChunk`.
- `AgentLoopRuntime` currently owns conversation turns, tool-call collection, tool-result return, limits, and wait states.
- Desktop selects a provider/model and constructs `AgentLoopRuntime` directly.
- The existing `codewhale-engine-adapter` defines a CodeWhale-specific `AgentEngine` contract, process supervisor, identity pinning, SSE cursor handling, and dynamic-tool settlement. It is not a provider-neutral KerniQ boundary and is not wired into the current Desktop governed loop.
- No common contract currently allows CodeWhale and DeepSeek Harness to be selected as interchangeable external agent engines.

## Reusable interfaces

- `provider-sdk`: provider-neutral `ModelMessage`, `ModelToolCall`, `ModelToolResultMessage`, and `ModelChunk` types for direct model providers.
- `context-engine`: deterministic prompt/context assembly before model or backend invocation.
- `AgentToolRegistry`: bounded read tools and trusted Project Command catalog resolution.
- `AgentSideEffectLifecycle`: the existing patch and command persistence barriers.
- `action-runtime`: proposal, approval, policy decision, start receipt, settlement, and interruption state.
- `session-runtime`: durable universal events such as `USER_MESSAGE`, `MODEL_MESSAGE`, `TOOL_REQUESTED`, and the governed action lifecycle.
- Desktop Project Command decision coordinator: the only current AgentFuse invocation path for live Project Commands.

These interfaces remain KerniQ-owned. They should be adapted around an Agent Backend later, not moved into it.

## Migration risks

1. **Approval bypass:** allowing a backend to execute filesystem, shell, or project-command tools would bypass KerniQ's durable gate.
2. **Split authority:** accepting backend-emitted approval or outcome events as authoritative would create two lifecycle owners.
3. **Replay ambiguity:** external event cursors and retries must be mapped idempotently to KerniQ session entries and tool-call identities.
4. **Tool-result misrouting:** results must be bound to the exact backend session, turn, and call before submission.
5. **Recovery drift:** backend session state cannot replace the append-only KerniQ ledger or its interrupted-action projection.
6. **Cancellation races:** backend interruption and shutdown must not make a started KerniQ action reapprovable or replayable.
7. **Provider/backend confusion:** `ModelProvider` is a direct model wire abstraction; `AgentBackend` represents an external agent engine with sessions and tool-request events. They are not interchangeable contracts.
8. **Premature adapter reuse:** extending the current CodeWhale-specific adapter before the neutral contract is stable would carry CodeWhale identity, process, and protocol assumptions into the control plane.

## Minimal abstraction boundary

`AgentBackend` belongs in `packages/agent-runtime` and is limited to:

- start a backend session;
- send canonical user or model messages;
- stream ordered backend events, including model messages and tool requests;
- accept the result for an exact tool request;
- shut down backend transport resources.

The boundary does not own or expose methods for:

- filesystem reads or writes;
- command execution;
- patch application or rollback;
- approval collection;
- policy or AgentFuse decisions;
- durable session evidence;
- Project Command catalog definition;
- autonomous execution.

For this milestone, `AgentRuntime` may delegate these explicit backend transport operations when an optional backend is configured. Existing `runTask`, `AgentLoopRuntime`, Desktop, AgentFuse, Action Runtime, and session-ledger behavior remain unchanged. A future integration must translate backend tool-request events into the existing KerniQ proposal and approval path before any side effect, then submit only the governed KerniQ result back to the backend.

## Stage 1 deliverables

- A provider-neutral `AgentBackend` contract in `packages/agent-runtime`.
- A deterministic, in-memory `MockAgentBackend` for boundary tests.
- Fail-closed `CodeWhaleBackend` and `DeepSeekHarnessBackend` placeholders.
- No changes to the CodeWhale fork or existing CodeWhale adapter package.
- No production selection, process supervision, desktop wiring, migration, or autonomous behavior.
