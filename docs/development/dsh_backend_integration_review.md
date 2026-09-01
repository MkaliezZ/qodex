# DeepSeek Harness Backend Integration Review

## Scope and baseline

- KerniQ branch: `feat/kerniq-deepseek-harness-backend`
- KerniQ baseline: `2ecfa63d658df1f34f6b5e7c38ebc4365936809e`
- Official DSH repository: `deepseek-ai/deepseek-harness`
- Audited DSH commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Audited DSH version: `0.1.1-rc.2`

This review covers only the Agent Backend transport boundary. AgentFuse,
Action Runtime, the evidence schema, Project Command catalog, approval flow,
and all side-effect implementations remain outside the adapter.

## Current DSH API availability

DSH publishes a TypeScript SDK stack:

- `@deepseek-ai/dsh-sdk-client` owns a runtime subprocess and exposes the
  high-level `DeepSeekHarness` API plus the lower-level `HarnessClient`.
- `@deepseek-ai/dsh-sdk-protocol` defines newline-delimited JSON-RPC over
  stdio.
- `@deepseek-ai/dsh-sdk-jsonrpc-server` serves the runtime side.

The audited protocol supports only these client requests:

- `initialize`
- `session/prompt`
- `shutdown`

It streams `session.event`, `session.status`, `subagent.started`, and
`subagent.finished` notifications. Session events include model messages,
`tool/call`, `tool/result`, and `turn/end` records in session sequence order.

The official SDK documentation explicitly states that mid-turn cancellation,
client-to-server notifications, and server-to-client requests are not
implemented. Consequently, the current public wire has no operation that can:

- pause a tool call before DSH dispatches it;
- submit an externally governed tool result;
- reject a tool call as a KerniQ decision result; or
- cancel one active turn without closing the complete runtime.

Observing DSH `tool/call` and `tool/result` session events is insufficient:
those records describe DSH's own tool pipeline and do not establish that
KerniQ controlled execution before dispatch.

## Protocol assumptions for the KerniQ adapter

The adapter therefore requires an injectable governed DSH transport. This is
a KerniQ-side contract, not a claim that the audited public DSH SDK currently
implements it. A conforming future connector must provide:

- session creation;
- message submission;
- one ordered, replayable event stream per session;
- `tool_call.requested` before any protected tool body runs;
- `tool_call.resolved` after DSH accepts the exact KerniQ result;
- turn completion, cancellation, and error events;
- exact session/turn/call identity on every tool event;
- turn cancellation and bounded shutdown.

The transport must run DSH with protected tools represented as externally
resolved capabilities. It must not expose DSH-native shell, filesystem write,
or Project Command implementations for those names.

## Required adapter mapping

| Governed DSH transport event | AgentBackend event | KerniQ meaning |
| --- | --- | --- |
| `session.started` | `session_started` | Transport session exists; not durable approval evidence |
| `model.output` | `message` with role `model` | Model output for UI/session recording |
| `tool_call.requested` | `tool_request` | Inert proposal data; no execution |
| `tool_call.resolved` | `tool_result_submitted` | DSH accepted KerniQ's exact result or rejection |
| `turn.completed` | `turn_completed` | Backend turn reached a normal terminal state |
| `turn.cancelled` | `turn_cancelled` | Backend turn stopped; pending calls become terminal |
| `runtime.error` | `error` | Transport/runtime failure; no implied side effect |

Transport sequence numbers remain the AgentBackend sequence numbers. The
adapter rejects gaps, wrong-session events, malformed JSON values, duplicate
tool calls, duplicate result submission, and results routed to another
session, turn, or call.

## Tool call lifecycle mapping

1. DSH emits `tool_call.requested` and remains paused for that call.
2. `DeepSeekHarnessBackend` validates identity and emits an inert
   `AgentBackendToolRequestEvent`.
3. KerniQ's existing runtime records the proposal and uses its existing human
   approval, AgentFuse decision, durable started barrier, and Project Command
   runner. The backend performs none of these operations.
4. A denial is returned as an unsuccessful tool result. No command or file
   operation has run.
5. An allowed action is executed only by the existing KerniQ path. Its bounded
   result is submitted for the exact pending DSH call.
6. DSH acknowledges with `tool_call.resolved`, then may continue model work.

No approval IDs, AgentFuse evidence, policy records, execution receipts, or
rollback state cross into the backend contract.

## Cancellation mapping

Cancellation is fail-closed:

- the adapter asks the transport to cancel the exact turn;
- `turn.cancelled` makes every pending call on that turn terminal;
- later result submissions for those calls are rejected;
- replayed or duplicate cancellation events do not reopen calls;
- shutdown closes transport resources but never synthesizes execution.

The current shared AgentBackend interface has no cancellation method. This
milestone keeps cancellation as a DSH adapter capability and adds only the
provider-neutral cancellation event needed by consumers. A later control-plane
wiring change can promote cancellation into the common interface separately.

## Risks and stop lines

1. **False governance claim:** wiring the current official SDK directly would
   observe tools after DSH owns execution. This is prohibited.
2. **Two approval systems:** DSH `ask` or approval plugins cannot replace or
   duplicate KerniQ approval and AgentFuse.
3. **Identity confusion:** a result for the wrong session, turn, or call could
   resume the wrong model action.
4. **Replay:** duplicate stream delivery must never cause duplicate result
   submission or execution.
5. **Sequence loss:** gaps are protocol failures, not events to reorder or
   silently accept.
6. **Cancellation races:** a cancelled call must stay terminal even if a late
   result or replay arrives.
7. **Configuration drift:** a real connector must prove that protected DSH
   tool names have no local execution body.

## Phase 1 decision

Proceed with the provider-neutral adapter implementation against an injectable
transport and deterministic mock transport tests. Do not add the official DSH
SDK dependency or claim a live DSH connection in this milestone because the
audited public protocol lacks the required governed pause/resolve/cancel
operations.

`REAL_DSH_CONNECTED=false`
