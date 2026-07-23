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
- A decision records policy evidence but never claims execution success.
- An outcome exists only after a physical handler was dispatched.

The state machine is:

```text
Proposed -> AwaitingApproval -> Approved -> Evaluating
  -> Denied | Held | DecisionError
  -> Allowed -> Starting -> Running
  -> Completed | Failed | Cancelled | Interrupted
```

Unknown action types, invalid proposals, stale or expired approvals, decision
provider failure, deny, hold, and decision error all block dispatch.

## Dispatch Barrier

The `beforeDispatch` hook is awaited before an execution receipt is accepted or
the handler is called. A hook failure becomes `dispatch_barrier_failed`; the
physical handler is not invoked. Execution is single-flight per action and
execution receipt IDs cannot be reused.

One terminal outcome is retained per action. Handler failure and acknowledged
cancellation are outcomes, not policy decisions. Cancellation after dispatch is
best effort and does not imply that an external side effect was rolled back.

## Evidence

The Action Runtime exposes lifecycle hooks and a deterministic in-memory
evidence store for tests. The desktop proof maps its lifecycle to existing
Session Runtime events:

```text
ACTION_PROPOSED
ACTION_APPROVED
ACTION_DENIED
ACTION_STARTED
ACTION_COMPLETED | ACTION_FAILED
```

This preserves proposal digest, approval ID, decision ID, execution receipt,
derived outcome ID, AgentFuse source commit, and policy/schema versions without
changing the Session schema. Deny has no started event and no physical outcome.
Sensitive-text sanitization remains owned by Session Runtime.

## v0.6.0 Scope

Exactly one handler is available for the optional development proof:
`kerniq.proof.increment-counter`. It increments one trusted in-memory counter.
It accepts no path, command, executable, URL, module, or environment input.

The proof is excluded from production registration unless
`VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1` is explicitly set at desktop build time.
Patch and Command continue using their existing approval and durable dispatch
paths; they are not routed through this runtime in v0.6.0.
