# KerniQ v0.6.1.6 Project Command Real Tauri Proof

**Date:** 2026-07-29
**Status:** Complete on Draft PR #14; PR CI passed; result review pending; not
merged

## Review Identity

| Anchor | Identity |
|:--|:--|
| Implementation base | `c5e214a43f9102c23f9c0a973782d227606a5c2b` |
| Reviewed v0.6.1.5 head | `ed6a0ce7fc00e0a201e3d98dc87fbd4d42a8f8a3` |
| Real proof execution code head | `1ec336c4d5aaa1f0ba902117532bf2b610be1a4a` |
| Draft PR pre-correction head | `291534a12b49fd41f5944e9863d0feb1b30c6cd5` |
| Draft PR | `#14` |
| Successful PR CI | `30383355384` |
| Merged | `false` |

The formal real Tauri proof was executed against the production and proof code
tree at `1ec336c4d5aaa1f0ba902117532bf2b610be1a4a`. The later
`291534a12b49fd41f5944e9863d0feb1b30c6cd5` commit changed documentation only
and did not alter the executed production, proof, bridge, policy, native
runner, or Session behavior.

## Verdict

```text
READY_FOR_V0_6_1_6_RESULT_REVIEW
```

The isolated real application proof supports this bounded claim:

```text
PROJECT_COMMAND_NATIVE_DESKTOP_PATH_AGENTFUSE_GATED=true
PROJECT_COMMAND_CONTROLLED_LIFECYCLE_AT_MOST_ONCE=true
ARBITRARY_DIRECT_IPC_GLOBAL_EXACTLY_ONCE=false
PROJECT_COMMAND_ALL_ENVIRONMENTS_PROTECTED=false
ALL_KERNIQ_ACTIONS_AGENTFUSE_PROTECTED=false
```

## Environment

| Item | Evidence |
|:--|:--|
| OS | macOS 13.4, build 22F66 |
| Architecture | x86_64 |
| Node | 24.14.1 |
| pnpm | 9.0.0 for repository validation; prepared pnpm 11.17.0 for the isolated fixture |
| Rust | rustc 1.95.0 (2026-04-14) |
| Host Python | 3.11.15 |
| Managed Python | 3.12.13 |
| Tauri mode | Debug, no bundle |
| App profile | `<TEMP_PROFILE>` |
| Fixture project | `<TEMP_PROJECT>` |
| Session database | `<TEMP_SESSION_DB>` |

`HOME`, `TMPDIR`, the application-data root, the managed runtime, the fixture,
and the Session SQLite database were all below one disposable temporary root.
The ordinary KerniQ profile and user projects were not used. The fixture held
no credentials. CPython and AgentFuse archives were downloaded and
hash-verified before the formal proof. The fixture's pnpm executable was also
prepared before the formal proof; subsequent launches resolved that local
executable with no Corepack download or network dependency.

## Canonical AgentFuse Identity

The real Settings bridge verification and self-check reported:

| Identity | Verified value |
|:--|:--|
| Package | `dhms-agentfuse 3.6.0` |
| Source commit | `ec4b5842339dccfba0db62df7541920759203bc9` |
| Policy | `dhms-agentfuse-runtime-guard@3.6.0` |
| Evidence schema | `agentfuse-evidence-schema-v0.1` |
| Protocol | `kerniq.agentfuse.bridge.v1` |
| Policy profile | `kerniq-project-command-v1` |
| Policy digest | `sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad` |
| Bridge tree SHA-256 | `34e0633e303a0e2b5107832d42486503f7c1f55a0e717001d176345ecfbe9ef3` |

Runtime state was `Ready`, integrity was `verified`, the canonical import
passed, the self-check returned allow and deny, and deny handler invocations
were zero.

## Real Boundary

The source of the proof claim was an actual Tauri application process, not a
browser fixture. The proof used:

- the native directory picker and project authorization;
- `ProjectRuntime` and the production project command catalog contract;
- `TauriSessionStore` and the actual SQLite Session ledger;
- `createManagedPythonBridge()` and the `agentfuse_decide` Tauri command;
- the installed pinned AgentFuse source and public `RuntimeGuard.evaluate()`;
- `AgentSessionLedgerRecorder` and the live Project Command decision gate;
- `TauriProjectCommandRunner` and the actual `run_project_command` Rust command;
- native catalog re-resolution followed by a direct no-shell child process.

The request source was a deterministic no-network proof provider. It only
requested the existing `list_project_commands` and `run_project_command` tools;
it did not replace the bridge, Session store, decision gate, Tauri IPC, native
runner, or physical process.

```text
mock_bridge=false
mock_runner=false
InMemorySessionStore=false
window.__kerniqTestAgentFuseBridge=false
window.__kerniqTestCommandRunner=false
```

The proof UI requires both existing development proof enablement and the
additional Project Command proof flag. An ordinary build does not render this
surface.

## Fixture

The disposable project exposed:

```text
command ID: package-script:test:agentfuse-proof
category: test
catalog source: package.json
physical command: pnpm run test:agentfuse-proof
script payload: node proof-command.mjs
```

The Node payload atomically incremented `invocation-count.txt`, emitted exactly
`KERNIQ_PROJECT_COMMAND_REAL_TAURI_PASS`, waited briefly to expose active-run
coalescing, and exited zero. It used no network and wrote only inside the
fixture. The native request still accepted only `runId`, authorized project
root, command ID, and catalog digest. It accepted no raw executable, arguments,
environment, cwd, shell text, or timeout override.

## Allow Evidence

The formal offline allow run produced:

```text
COMMAND_PROPOSED
COMMAND_APPROVED
ACTION_DECIDED allow
COMMAND_STARTED
COMMAND_COMPLETED
```

| Evidence | Result |
|:--|:--|
| AgentFuse requests | 1 |
| Provider calls | 2, unchanged after completion |
| Decision | `allow` / `allowed` |
| Decision ID | Present |
| Approval ID | Present |
| Proposal digest | Present and identical across linked records |
| Execution receipt | Present and identical across start/settlement |
| `COMMAND_STARTED` | 1 |
| `COMMAND_COMPLETED` | 1 |
| Physical invocation delta | 1 |
| Exit code | 0 |
| Stdout | Exact proof token plus newline |
| Stderr | Bounded pnpm script banner only |
| Timed out | false |
| Cancelled | false |

Five seconds after completion, physical invocation count remained one and the
provider and AgentFuse request counts had not increased.

## Human Deny Evidence

The real approval UI Deny action produced:

```text
COMMAND_PROPOSED=1
COMMAND_DENIED=1
COMMAND_APPROVED=0
ACTION_DECIDED=0
COMMAND_STARTED=0
AgentFuse requests=0
physical invocation delta=0
```

Human denial therefore remained distinct from a canonical policy block.

## Canonical Block Evidence

A proof-only request changed only the safe policy input
`commandCategory=deploy`. It went through the actual managed Python bridge and
canonical `RuntimeGuard.evaluate()`:

```text
canonical AgentFuse decision=block
KerniQ mapping=deny
reason=policy_denied
handler supplied=false
physical invocation delta=0
production Project Command mapper changed=false
ordinary policy profile changed=false
```

This does not claim that an ordinary valid catalog command is denied.

## Persistence Barriers

Temporary SQLite triggers rejected one exact event in one exact proof Session
at a time and were removed after each case.

### ACTION_DECIDED rejection

```text
COMMAND_PROPOSED=1
COMMAND_APPROVED=1
ACTION_DECIDED=0
COMMAND_STARTED=0
physical invocation delta=0
model-visible code=project_command_decision_persistence_failed
```

### COMMAND_STARTED rejection

```text
ACTION_DECIDED allow=1
COMMAND_STARTED=0
physical invocation delta=0
model-visible code=project_command_start_persistence_failed
```

Both barriers failed closed.

## Settlement Uncertainty and Restart

Rejecting only `COMMAND_COMPLETED` produced:

```text
physical invocation delta=1
COMMAND_STARTED=1
COMMAND_COMPLETED=0
SESSION_INTERRUPTED=1
ordinary SESSION_COMPLETED=0
Session status=Interrupted
```

The actual application process was stopped and relaunched with the same
isolated profile and SQLite database. After restart:

```text
projected status=Interrupted
approval action unavailable
automatic provider calls=0
automatic AgentFuse requests=0
automatic native invocations=0
physical invocation count unchanged
COMMAND_STARTED count unchanged
COMMAND_COMPLETED invented=false
```

The retained decision and started receipt describe an unknown physical outcome;
they are not reusable dispatch authority.

## Allowed-Unstarted Restart

The proof paused after the durable allow and before the recorder could append
`COMMAND_STARTED`:

```text
COMMAND_PROPOSED=1
COMMAND_APPROVED=1
ACTION_DECIDED allow=1
COMMAND_STARTED=0
physical invocation delta=0
```

After a full application stop and restart, recovery appended one
`RECOVERY_REQUIRED` event. Projection reported:

```text
status=RecoveryRequired
approved=false
approvalId=null
approvalGeneration=1
decisionRecorded=false
decisionId=null
COMMAND_STARTED=0
automatic provider calls=0
automatic AgentFuse requests=0
automatic native invocations=0
```

The old approval and allow were therefore not reusable. Any future dispatch
requires fresh project verification, the new approval generation, a fresh
approval, and a fresh AgentFuse decision.

## Duplicate Scope

Two nearly concurrent calls to the real Approve operation produced:

```text
COMMAND_APPROVED=1
AgentFuse requests=1
ACTION_DECIDED=1
COMMAND_STARTED=1
COMMAND_COMPLETED=1
physical invocation delta=1
```

The actual runner was also called twice concurrently with the same active
`runId` and command identity. Both callers received the same result while the
physical invocation delta was one. A simultaneous call using that active
`runId` with a different command identity failed closed.

This proves at-most-once behavior for the controlled live product lifecycle and
process-local active-run coalescing. It does not prove permanent global
deduplication for arbitrary direct Tauri IPC callers after a run completes.

## Defect Found and Corrected

The first real allow attempt exposed a bounded integration defect. The merged
TypeScript path correctly sent the frozen `policyProfileId` and
`expectedPolicyDigest`, but Rust's native request validator still accepted only
the older development `policyFixtureId`. Tauri rejected the request before the
managed Python bridge, so no command started.

The correction is limited to the native request admission check:

- accept exactly one trusted fixture; or
- accept exactly the frozen Project Command profile plus exact digest;
- reject unknown, incomplete, or ambiguous policy selection;
- preserve the protocol and message-size bounds.

A deterministic Rust regression test covers both accepted forms and the
unknown, incomplete, ambiguous, and extra-field failures. The frozen AgentFuse
source, Python bridge, bridge digest, Session schema, command catalog, and
runner behavior did not change. The complete real proof was rerun after the
correction.

## Cleanup and Privacy

Every application process was stopped by its exact captured PID. After every
case, process checks found no KerniQ app, managed bridge, or fixture child
remaining. Final temporary SQLite trigger count was zero. No binaries,
databases, managed runtimes, fixture projects, or raw terminal logs are
committed.

Committed proof artifacts use `<TEMP_PROJECT>`, `<TEMP_PROFILE>`, and
`<TEMP_SESSION_DB>` rather than local paths. The final secret/privacy scan
covers the proof and result-review documents.

## Command Summary

Representative commands, with private temporary paths replaced:

```bash
VITE_KERNIQ_ENABLE_AGENTFUSE_PROOF=1 \
VITE_KERNIQ_PROJECT_COMMAND_REAL_PROOF=1 \
pnpm --filter @qodex/desktop tauri build --debug --no-bundle

node scripts/kerniq_project_command_real_tauri_proof.mjs \
  prepare-pnpm <PREPARED_PNPM> <TEMP_ROOT>
node scripts/kerniq_project_command_real_tauri_proof.mjs \
  set-case <TEMP_PROJECT> <CASE>
node scripts/kerniq_project_command_real_tauri_proof.mjs \
  launch <TAURI_DEBUG_BINARY> <TEMP_HOME> <TEMP_ROOT>
node scripts/kerniq_project_command_real_tauri_proof.mjs \
  choose-project <TEMP_PROJECT>
node scripts/kerniq_project_command_real_tauri_proof.mjs \
  install-trigger <TEMP_SESSION_DB> <EVENT_TYPE> <SESSION_ID>
node scripts/kerniq_project_command_real_tauri_proof.mjs \
  remove-triggers <TEMP_SESSION_DB>
node scripts/kerniq_project_command_real_tauri_proof.mjs stop <EXACT_PID>
```

## Automated Validation

| Command or suite | Result |
|:--|:--|
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm build` | Passed |
| `pnpm test` | 1,605 passed |
| Agent Runtime | 100 passed |
| Action Runtime | 35 passed |
| AgentFuse Adapter | 25 passed |
| Session Runtime | 88 passed |
| Desktop unit | 139 passed |
| Desktop E2E | 56 passed, 4 credential-gated scenarios skipped |
| Python bridge pytest | 15 passed, 2 canonical-source-gated tests skipped |
| Python bridge compileall | Passed |
| `cargo fmt --all -- --check` | Passed |
| `cargo check --locked` | Passed |
| `cargo test --locked` | 35 passed, 2 maintenance tests ignored |
| Ordinary Tauri debug no-bundle build | Passed; proof UI absent |
| Dual-flag proof Tauri debug no-bundle build | Passed; proof UI present |
| `git diff --check` | Passed |
| Proof artifact privacy/secret scan | Passed |

## Limitations

- A trusted catalog script can still have project-defined side effects; this is
  not malware sandboxing.
- SQLite and a native process cannot share one atomic transaction.
- Browser Project Command execution is not included.
- Patch, Git, MCP, Office, provider, file-write, and arbitrary-shell actions are
  not included.
- Descendant-process containment on every platform is not proven.
- Windows has automated native coverage but no real v0.6.1.6 Tauri proof here.
- Successful managed-runtime Repair under every network interruption is not
  claimed.
- Permanent global exactly-once behavior for arbitrary direct IPC callers is
  not claimed.
