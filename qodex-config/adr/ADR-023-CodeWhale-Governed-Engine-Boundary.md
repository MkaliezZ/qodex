# ADR-023 - CodeWhale Governed Engine Boundary

**Status:** Accepted
**Date:** 2026-08-02
**KerniQ base:** `2aa335dd21453ecf5d3ad44c2279b2c9362bef9f`
**CodeWhale source:** `Hmbown/CodeWhale@4f2c97b0d75c039a9b6069ebcf210cc499583376`
**Depends on:** ADR-003, ADR-010, ADR-019, ADR-020, ADR-021, ADR-022

## Context

KerniQ v0.7 Coding Pack is frozen. The v0.8 spike evaluates CodeWhale only as
an intelligence engine behind a KerniQ-owned protocol. KerniQ, its existing
approval boundaries, AgentFuse, and the frozen Project Command path must remain
the only authority for physical side effects.

The exact pinned CodeWhale runtime supports threads, turns, replayable HTTP/SSE
events, and client-executed dynamic tools. Those capabilities are useful, but
they do not establish that a caller can structurally reduce the model-visible
and executable tool set to reviewed read-only tools plus one KerniQ proposal
tool.

## Decision

Add an isolated, experimental `@qodex/codewhale-engine-adapter` package that
owns the minimal `AgentEngine` protocol and CodeWhale mapping. Do not import it
from Desktop or any production runtime while the safety gate fails.

The protocol owns stable KerniQ types for engine identity, process status,
session and turn identity, event cursors, dynamic tool requests and results,
terminal states, and error classifications. CodeWhale transport objects remain
inside the adapter.

The exact runtime is pinned by repository, commit, deterministic source archive
digest, and proof executable digest. Provisioning, source, build output,
runtime state, configuration, and credentials stay outside the KerniQ
repository. The selected transport is authenticated loopback HTTP/SSE because
the exact `codewhale-tui` binary exposes the full runtime as the `serve --http`
compatibility alias; it does not expose the documented `app-server` subcommand
or a full dynamic-tool/event stdio entrypoint.

## Boundary Result

The real pinned process was run in Plan mode with shell, trust, auto approval,
MCP, project config, and subagents disabled. Its first provider request exposed
`File`, `Git`, `tasks`, `work_update`, and `tool_search`. A deterministic call
to the real `tool_search` expanded the request to 21 callable tools. Exact
schema and pinned-source review proved the Plan-mode `File` tool and canonical
`Git` tool read-only. The registered `propose_project_command` dynamic tool met
the intent-only KerniQ contract. Six tools had proven side effects and twelve
remained unclassified and fail-closed, leaving 18 prohibited callable tools.

Canonical `Git` is not a mutation tool at this pinned commit: its only actions
are `status`, `diff`, `log`, `show`, and `blame`, its capabilities are declared
read-only, and its dispatcher contains no mutation action. Plan-mode `File`
advertises only `read`, `list`, `search_name`, and `search_content`; its
registered read-only instance rejects `write`, `edit`, and `patch` before those
handlers run.

The runtime API does not accept `allowed_tools`. `StartTurnRequest` omits that
field and `runtime_threads.rs` constructs `Op::SendMessage` with
`allowed_tools: None`. CodeWhale defines `None` as the normal unrestricted tool
set, and its direct test confirms that an unset allowlist allows every name.
Plan and approval gates therefore do not provide structural model-surface
removal.

The process also created `.codewhale/state/subagents.v1.lock` inside the
read-only fixture despite subagents being disabled. This is a direct fixture
write before any KerniQ action boundary.

```text
CODEWHALE_BOUNDARY_OUTCOME=THIN_FORK_REQUIRED
CODEWHALE_DEFAULT_PRODUCT_ENGINE=false
CODEWHALE_INTEGRATION_EXPERIMENTAL=true
CODEWHALE_PRODUCT_SIDE_EFFECT_CONNECTED=false
```

## Dynamic Proposal Contract

The only permitted side-effect-intent tool is registered as namespace
`kerniq`, name `propose_project_command`. It accepts only `commandId` and the
reviewed Project Command `catalogDigest`, rejects additional fields, and creates
an intent only. It cannot carry a shell fragment, arbitrary command, absolute
path, credential, private root, or destination handle.

If a future governed runtime passes the structural gate, KerniQ must still
validate exact thread, turn, call, namespace, tool name, and immutable arguments
before accepting one result. Duplicate, timed-out, canceled, or historical
calls remain terminal and cannot execute or replay. Existing Project Command,
AgentFuse, durable START, native execution, and settlement boundaries remain
unchanged.

## Minimal Thin Fork

The smallest acceptable fork changes the central CodeWhale turn boundary:

1. Add a required governed allowlist to the Runtime API `StartTurnRequest` and
   carry it through `runtime_threads.rs` instead of hard-coding
   `allowed_tools: None`.
2. In `core/engine/tool_catalog.rs`, intersect the full registry and searchable
   catalog with that allowlist before constructing the first provider request.
   `tool_search` must neither reveal nor hydrate a denied tool.
3. In `core/engine/turn_loop.rs`, enforce the same allowlist after canonical
   name resolution and before every dispatcher or synthetic execution path.
4. In governed mode, do not initialize workspace-local subagent coordination
   or any other component that writes runtime state beneath the fixture.
5. Make governed mode fail closed when the allowlist, managed profile, runtime
   identity, or capability is absent or mismatched. Workspace configuration
   cannot loosen it.

The invariant is one structural set shared by model catalog, deferred search,
canonical dispatch, and executable registry. The set may contain reviewed
read-only tools and the exact KerniQ dynamic proposal tool, and nothing else.

Expected rebase cost is low to moderate in patch size but security-sensitive:
the affected runtime request, catalog, turn-loop, and subagent initialization
files are active upstream surfaces. Required upstream tests must cover empty and
missing allowlists, deferred search, aliases, synthetic tools, MCP/plugins,
Plan/Act changes, project configuration, direct runtime calls, and zero fixture
writes.

## Consequences

- CodeWhale is not safely integrated into the product in this change.
- The adapter and evidence remain isolated and fail before process launch when
  supplied the observed unsafe receipt.
- No Project Command runs and AgentFuse is not invoked by the spike.
- No Patch runtime or multi-engine runtime is implemented.
- A real governed Project Command round trip is deferred until a reviewed thin
  fork proves structural absence and zero direct fixture writes.

```text
V0_7_CODING_PACK_FROZEN=true
CODEWHALE_DEFAULT_PRODUCT_ENGINE=false
CODEWHALE_INTEGRATION_EXPERIMENTAL=true
PATCH_RUNTIME_IMPLEMENTED=false
MULTI_ENGINE_IMPLEMENTED=false
```
