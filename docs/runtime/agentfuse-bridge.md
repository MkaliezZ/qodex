# Canonical AgentFuse Bridge

KerniQ integrates the canonical Python DHMS AgentFuse runtime through a narrow
native process bridge. TypeScript does not reimplement AgentFuse policy.

## Canonical Source

```text
repository: MkaliezZ/dhms-engine
branch reviewed: feat/agentfuse-public-decision-api-v3-5-1
commit: af08d80abaeb196da1e66d9e74c2d1c7002c9c2e
package: dhms-agentfuse 3.5.1
license: Apache-2.0
```

The source archive and SHA-256 are pinned in the managed runtime manifest. The
bridge loads the verified first-party `runtime_guard.py` and
`evidence_schema.py` modules. It calls the public decision-only
`RuntimeGuard.evaluate(tool_call)` API and consumes its immutable canonical
decision evidence. KerniQ does not call an AgentFuse action handler.

## Protocol

Protocol version:

```text
kerniq.agentfuse.bridge.v1
```

Messages are newline-delimited JSON on stdin/stdout:

```text
hello            -> hello_ack
health_check     -> health_result
decision_request -> decision_result
shutdown         -> shutdown_ack
```

The handshake binds the Python version, AgentFuse package version, exact source
commit, supported evidence schema, bridge protocol, and process identity.
Request and response message IDs must match.

The current one-shot process sends hello, bounded work, and shutdown in one
session. One `bridge_session_timeout=15s` deadline covers that complete child
process session. There is no separately enforced 8-second startup timeout or
independent request timeout.

Decision requests contain only the fully bound `ActionProposal`,
`ActionApproval`, and one trusted proof policy fixture ID. Decision responses
contain decision identity, action identity, allow/deny value, reason, policy
version, evidence schema, exact AgentFuse commit, canonical evidence, and
timestamp.

## Failure Model

The TypeScript adapter returns a decision error and Action Runtime blocks
dispatch when the bridge is unavailable or returns:

- a protocol, message, action, revision, schema, or policy mismatch
- malformed JSON, unknown decision, missing evidence, or duplicate decision
- timeout, oversized output, unexpected exit, or initialization error

AgentFuse allow means only that policy permitted dispatch. The Action handler
may still complete, fail, or acknowledge cancellation afterward.

## Self-Check

The desktop self-check runs in the private managed runtime and proves:

- bridge process launch and matching handshake
- canonical source import
- trusted allow fixture returns allow
- trusted deny fixture returns deny
- deny handler invocation count remains zero
- clean shutdown acknowledgment

Self-check does not touch the current project and performs no physical proof
mutation.

## Proof-Only Boundary

v0.6.0 exposes only the dedicated development proof fixture when its build flag
is enabled. It is not a general policy configuration surface. Provider or model
output cannot add policy fixtures, import modules, install packages, execute
Python, or choose native process arguments.
