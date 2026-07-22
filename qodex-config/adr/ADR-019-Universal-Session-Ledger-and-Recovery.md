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

Recovery replays evidence instead of deserializing providers, streams,
promises, filesystem capabilities, operation locks, or process handles. Pending
patches and commands require matching-project reauthorization, fresh validation,
and fresh explicit approval. A stale patch or changed command catalog disables
execution. Any provider, tool, patch, command, return, or cancellation operation
that was active at shutdown becomes `Interrupted` with
`unknown_or_interrupted`; no side effect resumes automatically.

## Consequences

Completed and terminal sessions survive a desktop restart, and interrupted work
is represented honestly. The Sessions UI can reconstruct the active ledger path,
export deterministic redacted JSON, and delete one local session without
touching project files, credentials, bindings, or unrelated sessions.

KerniQ does not provide live process recovery, automatic provider continuation,
automatic patch or command approval, cloud backup, cross-device synchronization,
Git checkpoint recovery, or signed/notarized macOS distribution in v0.5.
