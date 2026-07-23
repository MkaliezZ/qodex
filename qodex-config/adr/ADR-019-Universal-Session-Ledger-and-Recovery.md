# ADR-019

**Status:** Accepted
**Date:** 2026-07-23

## Context

KerniQ v0.4.1 provided a bounded and approval-safe coding Agent loop, but its
task evidence existed only in live runtime and React state. A process restart
lost completed history and pending decisions. Restoring serialized runtime
objects would be unsafe and would couple persistence to coding-only concepts.

## Decision

Add `packages/session-runtime` as a pure TypeScript, provider-neutral session
domain. An append-only event ledger is the durable source of truth. Sessions and
entries reserve parent and active-leaf identifiers for future tree histories;
v0.5 projects only the current active path. A deterministic projector derives
status, pending action, evidence counts, artifacts, and terminal outcomes.

Desktop Tauri owns one SQLite database in its application-data directory.
Explicit transactional migrations initialize and advance the schema, reject
unsupported future versions without deleting data, and keep project bindings in
a separate table. The private canonical root is used only for exact local
reauthorization and is omitted from session reads and redacted exports. Browser
development uses a clearly labeled in-memory store.

The Agent Loop records facts through a narrow Session Recorder adapter. Exact
provider tool-call IDs are retained, while request headers, API keys, cookies,
environment values, unrestricted script source, and native handles are never
accepted as session evidence. Universal action and artifact metadata reserve the
identities needed for future managed-Python execution without requiring a schema
rewrite; DHMS Python remains the canonical runtime.

The recorder is an awaitable barrier for mutating Agent actions. A fresh
approval generation and a durable `ACTION_STARTED`, `PATCH_STARTED`, or
`COMMAND_STARTED` receipt must be committed before dispatch. Failure to persist
the receipt blocks the filesystem write or process start. The deterministic
projector rejects lifecycle evidence that lacks a proposal, approval, start,
matching action/approval/receipt identity, or valid ordering, and also rejects
duplicates and entries appended after a terminal outcome.

Recovery replays evidence instead of deserializing providers, streams,
promises, filesystem capabilities, operation locks, or process handles. Pending
patches and commands require matching-project reauthorization, fresh validation,
and fresh explicit approval. A stale patch or changed command catalog disables
execution. Any provider, tool, patch, command, return, or cancellation operation
that was active at shutdown becomes `Interrupted` with
`unknown_or_interrupted`; no side effect resumes automatically.

Recovery scans the full active path for started-but-unsettled actions. Such an
action is always `Interrupted` and cannot become reapprovable. Only proposed or
approved-but-not-started actions can enter `RecoveryRequired`, which invalidates
the old approval and increments an explicit approval generation.

The full-path scan precedes acceptance of projected or cached Session terminal
state. The projector rejects `SESSION_COMPLETED`, `DELIVERY_COMPLETED`,
`SESSION_FAILED`, `SESSION_CANCELLED`, and `SESSION_LIMIT_REACHED` while an
action has started without matching `PATCH_APPLIED`, `COMMAND_COMPLETED`,
`ACTION_COMPLETED`, or `ACTION_FAILED` evidence. An unstarted pending action may
still be disposed by an appropriate terminal event. For a legacy malformed path
where a terminal event masks an unmatched start, recovery selects an active
branch ending in `SESSION_INTERRUPTED` instead of accepting the cached terminal
claim.

Settlement persistence after dispatch is a separate failure class. KerniQ first
attempts to append `SESSION_INTERRUPTED` with an unknown execution status. If
that append also fails, it leaves the durable started receipt unmatched so the
next recovery reaches the same conservative conclusion. The in-memory Agent
task stops, the provider is not continued, and the action is neither replayed
nor offered for reapproval.

One bounded local sensitive-text scanner is applied before session persistence
and again during export. It removes sensitive field names and redacts recognised
credential and absolute-path patterns as defense in depth. Patches containing
recognised sensitive text persist no old/new contents and are marked
non-recoverable. The scanner is deterministic and intentionally limited; it is
not a claim that every possible secret or private identifier can be detected by
pattern matching.

## Consequences

Completed and terminal sessions survive a desktop restart, and interrupted work
is represented honestly. The Sessions UI can reconstruct the active ledger path,
export deterministic redacted JSON, and delete one local session without
touching project files, credentials, bindings, or unrelated sessions.

The durable pre-dispatch receipt closes the unrecorded-side-effect window for
normal and recovered patch/command execution. A crash after the started receipt
but before a settled receipt is represented conservatively as an unknown
interrupted outcome, so KerniQ will not offer the action for another execution.

SQLite settlement evidence and external filesystem or process side effects are
not transactionally atomic. KerniQ can prove that dispatch started; if final
evidence cannot be persisted, it deliberately makes no claim that the physical
operation completed or failed.

KerniQ does not provide live process recovery, automatic provider continuation,
automatic patch or command approval, cloud backup, cross-device synchronization,
Git checkpoint recovery, or signed/notarized macOS distribution in v0.5.
