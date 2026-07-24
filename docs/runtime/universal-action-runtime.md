# Universal Action Runtime

`@qodex/action-runtime` is a provider-neutral pre-dispatch contract for future
non-coding actions. It is separate from Agent Runtime, Patch Runtime, Command
Runtime, and physical handlers.

## Contracts

The runtime keeps four identities separate:

```text
ActionProposal -> ActionApproval -> ActionDecision -> ActionOutcome
```

- A proposal is canonical-JSON hashed with SHA-256.
- Approval binds the exact proposal digest, task, generation, and expiry.
- Approval, decision, started, and outcome records have strict runtime
  validators. Decision evidence is valid bounded JSON.
- A decision records policy evidence but never claims execution success.
- An outcome exists only after a physical handler was dispatched.

The state machine is:

```text
Proposed -> AwaitingApproval -> Approved -> Evaluating
  -> Denied | Held | DecisionError
  -> Allowed -> Starting -> Running
  -> Completed | Failed | Cancelled | Interrupted
```

Unknown action types, malformed or duplicate decisions, invalid proposals,
stale or expired approvals, decision provider failure, deny, hold, and decision
error all block dispatch.

## Dispatch Barrier

The `beforeDispatch` hook is awaited before an execution receipt is accepted or
the handler is called. A hook failure becomes `dispatch_barrier_failed`; the
physical handler is not invoked. Execution is single-flight per action and
execution receipt IDs cannot be reused.

One terminal outcome is retained per action. A candidate outcome is validated
and durably recorded before it becomes the runtime terminal result. If durable
settlement fails after dispatch, the runtime records
`unknown_or_interrupted/settlement_persistence_failed`, transitions to
`Interrupted`, and returns the same result to duplicate `execute()` calls
without replay. Handler failure and acknowledged cancellation are outcomes, not
policy decisions. Cancellation after dispatch is best effort and does not
imply that an external side effect was rolled back.

## Evidence

The Action Runtime exposes lifecycle hooks and a deterministic in-memory
evidence store for tests. The desktop proof maps its lifecycle to existing
Session Runtime events:

```text
ACTION_PROPOSED
ACTION_APPROVED
ACTION_DECIDED
ACTION_STARTED
ACTION_COMPLETED | ACTION_FAILED
```

`ACTION_DECIDED` retains decision identity, value, reason, AgentFuse source
commit, and policy/schema versions independently before dispatch.
`ACTION_STARTED` must reference a matching prior durable allow decision. Deny,
hold, and error have no started event and no physical outcome. Legacy
`ACTION_DENIED` ledgers remain readable. Sensitive-text sanitization remains
owned by Session Runtime.

## v0.6.0 Scope

Exactly one handler is available for the optional development proof:
`kerniq.proof.increment-counter`. It increments one trusted in-memory counter.
It accepts no path, command, executable, URL, module, or environment input.

The proof is excluded from production registration unless
`VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1` is explicitly set at desktop build time.
Patch and Command continue using their existing approval and durable dispatch
paths; they are not routed through this runtime in v0.6.0.
