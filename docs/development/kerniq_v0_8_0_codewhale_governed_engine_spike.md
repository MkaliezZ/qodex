# KerniQ v0.8.0 CodeWhale Governed Engine Boundary Spike

**Date:** 2026-08-02
**Status:** Completed with `THIN_FORK_REQUIRED`
**KerniQ base:** `2aa335dd21453ecf5d3ad44c2279b2c9362bef9f`
**CodeWhale:** `Hmbown/CodeWhale@4f2c97b0d75c039a9b6069ebcf210cc499583376`

## Scope

This spike tests one question: can the exact pinned CodeWhale runtime be
structurally limited, without modifying CodeWhale, to reviewed read-only tools
plus the KerniQ client-executed `propose_project_command` intent?

It does not compare engines, replace the KerniQ UI, change Project Command or
AgentFuse policy, implement Patch, add multi-engine selection, or connect
CodeWhale to a product side-effect path.

## Pinned Provisioning

The exact commit was fetched and detached in an external managed directory. A
deterministic `git archive` and a debug proof executable were built outside the
KerniQ repository and verified before use.

```text
CODEWHALE_REPOSITORY=https://github.com/Hmbown/CodeWhale
CODEWHALE_SOURCE_COMMIT=4f2c97b0d75c039a9b6069ebcf210cc499583376
CODEWHALE_LICENSE=MIT
CODEWHALE_SOURCE_ARCHIVE_SHA256=sha256:61b6c3ed704b732085fc7d7fe7c60e6061b97296ddc6d923e19270a5ca465f69
CODEWHALE_EXECUTABLE_SHA256=sha256:88b9dc2f82e6aa55fe8c168b7ad7573e834d7af164960835f1ccda7a4559189f
CODEWHALE_EXECUTABLE_VERSION=codewhale-tui 0.9.3 (4f2c97b0d75c)
CODEWHALE_EXECUTABLE_PLATFORM=darwin-x86_64-proof-build
```

The proof digest identifies the exact executable used by this audit; it is not
a distribution artifact or a claim of cross-host reproducible Rust debug
builds. Source, Cargo target output, runtime state, configuration, and tokens
remain outside the repository. The provisioning script never invokes a global
mutable `codewhale` binary.

## Runtime Audit

The narrow source audit covered the requested runtime API, authorization,
protocol, runtime-thread, engine turn-loop, tool-catalog, and direct supporting
types/tests only.

The exact binary does not expose the documented `app-server` subcommand.
`serve --http` is its implemented compatibility alias for the full HTTP/SSE
runtime. Authenticated loopback HTTP/SSE was selected because this surface
provides threads, turns, replay, dynamic external tools, exact result routes,
timeouts, cancellation, and live events. The available stdio surfaces do not
expose that complete lifecycle.

The runtime reports version `0.9.3` and capabilities for threads, turns,
steering, interruption, event replay, and external tools. No token, raw private
path, provider credential, or source content is recorded in committed evidence.

## Structural Gap

At the pinned commit:

- `StartTurnRequest` has no `allowed_tools` field.
- `runtime_threads.rs` creates external Runtime turns with
  `allowed_tools: None`.
- `core/ops.rs` defines `None` as use of the normal tool set.
- `core/engine/tool_catalog.rs` treats an absent allowlist as allowing every
  tool and lets `tool_search` activate deferred tools.
- `core/engine/turn_loop.rs` checks the allowlist only after a model emits a
  call; its own test confirms an absent allowlist allows an arbitrary name.
- Plan mode and approval posture are execution gates, not a structural
  allowlist supplied by KerniQ.

This means adapter configuration cannot establish one exact set shared by the
model request, deferred discovery, canonical name resolution, and dispatch.

## Real Tool-Surface Receipt

The real pinned process ran with:

```text
mode=plan
allow_shell=false
approval_policy=never
sandbox_mode=read-only
auto_approve=false
trust_mode=false
project_config=disabled
MCP=disabled
subagents=disabled
```

A deterministic loopback fake provider made no external model call. Its first
response invoked only the real CodeWhale `tool_search` with a bounded regex
query. That search is part of CodeWhale's engine and expanded deferred tool
definitions; the second provider request therefore exposed the effective
searchable model surface without calling a filesystem, shell, Git, network,
plugin, MCP, subagent, Project Command, or AgentFuse tool.

Initial model-visible tools:

```text
File
Git
tasks
work_update
tool_search
```

Expanded model-visible tools:

```text
automation
create_goal
diagnostics
File
get_goal
Git
github
handle_read
load_skill
notify
propose_project_command
request_user_input
retrieve_tool_result
review
tasks
tool_search
update_goal
validate_data
Web
web-x00002E-run
work_update
```

The exact per-tool source, native/dynamic classification, read-only status,
side-effect classification, reason, enabled state, callable state, and observed
schema digest are recorded in
`validation/evidence/kerniq_v0_8_0_codewhale_tool_surface.json`.

```text
CODEWHALE_MANAGED_PROFILE_DIGEST=sha256:513aead3b2c82d693835e6dff8d82c9027bb0de3a50f7ea2e01f2ce120e220cc
CODEWHALE_TOOL_SURFACE_DIGEST=sha256:e387c2b0aa78766ed74988b1ed8c19b00a7c161bd7d6c15e6a2b72ffe9d64c4e
DYNAMIC_TOOL_SCHEMA_DIGEST=sha256:e7108a8f3767dd0e2f75d82a465a0e7a1e712ccdd6f11a89f1955aebc499f72a
MODEL_VISIBLE_TOOL_COUNT=21
READ_ONLY_TOOL_COUNT=2
KERNIQ_INTENT_ONLY_TOOL_COUNT=1
PROVEN_SIDE_EFFECT_TOOL_COUNT=6
UNCLASSIFIED_TOOL_COUNT=12
PROHIBITED_TOOL_CALLABLE_COUNT=18
```

The classifier now distinguishes four states: `proven_read_only`,
`proven_side_effect`, `unclassified_fail_closed`, and `kerniq_intent_only`.
Unknown, incompletely reviewed, plugin, and MCP tools remain prohibited without
being mislabeled as proven physical side effects.

The captured Plan-mode `File` schema's action enum is exactly `read`, `list`,
`search_name`, and `search_content`. Pinned source constructs
`FileTool::read_only("File")`, declares only read-only capabilities for that
instance, and rejects `write`, `edit`, and `patch` before mutation handlers.
Canonical `Git` advertises and dispatches only `status`, `diff`, `log`, `show`,
and `blame`; its implementation declares every action read-only. These two
tools are therefore proven read-only. Six other tools have reviewed state or
control side effects, twelve remain unclassified and fail-closed, and the
KerniQ dynamic intent performs no physical side effect.

## Fixture Write Finding

The runtime created the following entries beneath the fixture before any
KerniQ action boundary:

```text
.codewhale/
.codewhale/state/
.codewhale/state/subagents.v1.lock
```

The lock is created by CodeWhale subagent coordination initialization even
with subagents disabled. Runtime state elsewhere stayed in the managed home,
but this workspace-local write violates the spike's read-only fixture
invariant.

```text
CODEWHALE_DIRECT_FIXTURE_WRITES=1
WRITES_BEFORE_KERNIQ_START=1
PROJECT_COMMAND_EXECUTION_COUNT=0
AGENTFUSE_INVOCATION_COUNT=0
```

## Safety Stop

The structural gate failed before the KerniQ proposal tool was invoked. The
spike therefore did not run a positive Project Command flow, persist durable
START, call AgentFuse, or submit a product result to CodeWhale.

Source-contract review confirms CodeWhale's dynamic result route requires the
exact thread, turn, and call and rejects wrong or duplicate routes. KerniQ
focused tests independently cover exact identity, changed arguments, duplicate
results, timeout, cancellation, historical restart state, event replay, token
redaction, process cleanup, and the launch-before-safety-gate invariant. These
tests are not represented as a real governed product round trip.

```text
DYNAMIC_TOOL_REQUEST_EVENT=NOT_RUN_BY_SAFETY_GATE
DYNAMIC_TOOL_RESOLUTION_EVENT=NOT_RUN_BY_SAFETY_GATE
WRONG_ROUTE_RESULT_REJECTED=SOURCE_CONTRACT_CONFIRMED_AND_KERNIQ_TESTED
DUPLICATE_RESULT_REJECTED=SOURCE_CONTRACT_CONFIRMED_AND_KERNIQ_TESTED
TIMEOUT_NO_EXECUTION=SOURCE_CONTRACT_CONFIRMED_AND_KERNIQ_TESTED
CANCEL_NO_EXECUTION=SOURCE_CONTRACT_CONFIRMED_AND_KERNIQ_TESTED
RESTART_NO_REPLAY=KERNIQ_TESTED_PRODUCT_FLOW_NOT_CONNECTED
```

## Required Thin Fork

The thin fork must make a governed allowlist mandatory at the Runtime API and
carry it through `runtime_threads.rs` instead of `allowed_tools: None`. The
same immutable set must filter the full model catalog before the first provider
request, constrain `tool_search`, and gate dispatch after canonical name
resolution. Governed mode must also skip workspace-local subagent coordination
and any other runtime-state writer.

Required fork tests:

1. Missing, empty, malformed, or mismatched governed allowlists fail closed.
2. Initial and deferred model tool surfaces equal the reviewed allowlist.
3. Aliases, synthetic tools, MCP, plugins, and direct Runtime calls cannot
   bypass the intersection.
4. Plan/Act changes and project configuration cannot loosen the profile.
5. Every denied tool is absent and rejected before physical execution.
6. The governed runtime performs zero direct fixture writes.
7. Exact dynamic call settlement, timeout, cancellation, and restart replay
   remain correct.

The patch is small in concept but crosses active central runtime files, so the
expected upstream rebase cost is low to moderate and security review is
required for every rebase.

## Outcome

```text
V0_7_CODING_PACK_FROZEN=true
CODEWHALE_DEFAULT_PRODUCT_ENGINE=false
CODEWHALE_INTEGRATION_EXPERIMENTAL=true
PATCH_RUNTIME_IMPLEMENTED=false
MULTI_ENGINE_IMPLEMENTED=false
OUTCOME=THIN_FORK_REQUIRED
```
