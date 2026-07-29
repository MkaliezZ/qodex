# KerniQ v0.6.1 Project Command Final Freeze Seal

**Date:** 2026-07-29
**Status:** Active and merged final freeze seal
**Next implementation milestone started:** `false`

## Active Verdict

```text
KERNIQ_V0_6_1_PROJECT_COMMAND_AGENTFUSE_GATE_FROZEN
```

This verdict is active on `main` after the docs-only final freeze seal passed
review, merged, and passed post-merge CI.

## Exact Evidence Chain

| Milestone | Identity |
|:--|:--|
| v0.6.1.1 merge | `be32ca0caa764aa86e3de341557fedbc2acba0a5` |
| v0.6.1.2 merge | `c201e32ec1dcb342e9b1fbbeace6315cb422bc99` |
| v0.6.1.3 merge | `ca005397b88534ba3663f1f19b0b539de0f94766` |
| v0.6.1.4 merge | `a36503f198c016daa1f6c1c8f2af1d894c0e95ef` |
| v0.6.1.5 merge | `c5e214a43f9102c23f9c0a973782d227606a5c2b` |
| Real proof execution code head | `1ec336c4d5aaa1f0ba902117532bf2b610be1a4a` |
| v0.6.1.6 reviewed PR head | `1d600e7eb4493c7f7e41b7f6fea22ba907c94d4e` |
| v0.6.1.6 merge | `4eb7c24c493b0fc135a750f07ed46cbb86ddd461` |
| Post-merge CI | `30389964085` |
| PR #15 reviewed head | `1328f40cf9caef1bb8f452553afcc9b2e5a9258d` |
| PR #15 merge commit | `7c594b05293e7d151c536a7b37f2f88b95135263` |
| PR #15 post-merge CI | `30431723082` |
| Freeze activated on main | `true` |

The v0.6.1.6 merge tree is identical to the reviewed PR head tree. The
reviewed head is an ancestor of `main`; the merge introduced no conflict
resolution or tree drift. The real proof was executed against
`1ec336c4d5aaa1f0ba902117532bf2b610be1a4a`. Later commits through the reviewed
head changed documentation only after that executed code anchor.

## Frozen AgentFuse Identity

| Identity | Frozen value |
|:--|:--|
| Package | `dhms-agentfuse 3.6.0` |
| Source commit | `ec4b5842339dccfba0db62df7541920759203bc9` |
| Policy | `dhms-agentfuse-runtime-guard@3.6.0` |
| Evidence schema | `agentfuse-evidence-schema-v0.1` |
| Bridge protocol | `kerniq.agentfuse.bridge.v1` |
| Project Command policy profile | `kerniq-project-command-v1` |
| Project Command policy digest | `sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad` |
| Bridge tree SHA-256 | `34e0633e303a0e2b5107832d42486503f7c1f55a0e717001d176345ecfbe9ef3` |

## Frozen Scope

The active freeze covers exactly:

- the bounded native Desktop Project Command path;
- trusted TypeScript and Rust catalog identity;
- fixed KerniQ policy profile and digest;
- explicit one-time user approval;
- proposal, approval, project, and command binding;
- canonical AgentFuse decision before start;
- durable `ACTION_DECIDED`;
- durable `COMMAND_STARTED` before native invocation;
- native catalog re-resolution;
- direct no-shell execution;
- bounded environment, timeout, output, and cancellation;
- decision-persistence and start-persistence zero-dispatch barriers;
- honest settlement uncertainty;
- restart no-replay;
- invalidation of old unstarted approval and allow authority;
- at-most-once execution for the controlled product lifecycle; and
- process-local active `runId` coalescing with identity-transfer rejection.

```text
PROJECT_COMMAND_NATIVE_DESKTOP_PATH_AGENTFUSE_GATED=true
PROJECT_COMMAND_CONTROLLED_LIFECYCLE_AT_MOST_ONCE=true
```

## Explicit Non-Claims

```text
ARBITRARY_DIRECT_IPC_GLOBAL_EXACTLY_ONCE=false
PROJECT_COMMAND_ALL_ENVIRONMENTS_PROTECTED=false
ALL_KERNIQ_ACTIONS_AGENTFUSE_PROTECTED=false

PATCH_MIGRATED=false
GIT_MIGRATED=false
MCP_MIGRATED=false
BROWSER_PROJECT_COMMAND_PROTECTED=false
ARBITRARY_FILE_WRITE_PROTECTED=false
ARBITRARY_SHELL_ADDED=false

every trusted project script is harmless=false
production multi-user authorization proven=false
cross-platform descendant containment proven=false
real Windows Tauri proof=false
SQLite/process atomic transaction=false
```

The proof does not cover browser Project Command, Patch, Git, MCP, Office,
provider actions, arbitrary file writes, arbitrary commands, or arbitrary
shell. It does not turn AgentFuse allow into an execution-success claim.

## Validation Evidence

- Corrected PR CI `30389533518`: all five jobs passed.
- Post-merge CI `30389964085`: all five jobs passed.
- Frozen install and workspace build passed.
- Workspace tests: 1,605 passed.
- Focused suites: Agent Runtime 100, Action Runtime 35, AgentFuse Adapter 25,
  Session Runtime 88, and Desktop 139 passed.
- Desktop E2E: 56 passed; four credential-gated scenarios skipped.
- Python bridge: 15 passed; two canonical-source-gated tests skipped;
  compileall passed.
- Rust formatting and check passed; native tests passed 35 with two explicit
  maintenance tests ignored.
- `git diff --check`, privacy scan, and secret scan passed.
- Real proof cleanup found zero orphan processes and zero temporary triggers.

## Freeze Administration

This document and its status-link updates are documentation only. They do not
change TypeScript, Rust, Python, tests, proof tooling, manifests, workflows,
lockfiles, package versions, runtime behavior, or the frozen AgentFuse
identity.

```text
FINAL_FREEZE_SEAL_MERGED=true
V0_6_1_PROJECT_COMMAND_RELEASE_FROZEN=true
NEXT_IMPLEMENTATION_MILESTONE_STARTED=false
```
