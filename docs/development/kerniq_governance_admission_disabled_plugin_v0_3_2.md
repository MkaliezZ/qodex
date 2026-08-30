# KerniQ v0.3.2 — Governance Admission Disabled-Plugin Hardening

## Scope

One confirmed admission defect: a governance plugin that DSH reports as
`disabled: true` still satisfied KerniQ's availability checks because plugin
detection scanned for a matching `name:` line anywhere in the
`--dump-config` document without reasoning about the plugin record that
contains it. This patch replaces the line scan with an enabled-plugin-aware
record check. No DSH source, AgentFuse protocol, production observer
behavior, supervisor architecture, or evidence semantics changed.

## Defect

```text
GOVERNANCE_ADMISSION_DISABLED_PLUGIN_BYPASS
```

`dump_has_plugin(dump, package)` returned true for any document containing
`name: '<package>'`, including records DSH emits as disabled. Both
`PRODUCTION_OBSERVER_PACKAGE` and `AGENTFUSE_PACKAGE` checks shared the
helper, so both bypasses were live.

Reproduction (Windows, DSH 0.1.2-alpha.1 at `cd5ef81`, real
`--dump-config` captures with a `disabled: true` patch overlay, evaluated
through a verbatim copy of the pre-fix helper):

```text
both-enabled           observer_available=true   agentfuse_available=true
observer-disabled      observer_available=true   agentfuse_available=true   <- bypass
agentfuse-disabled     observer_available=true   agentfuse_available=true   <- bypass
both-disabled          observer_available=true   agentfuse_available=true   <- bypass
```

Because `agent_fuse_adapter_available`, `production_observer_available`, and
`governed_profile_is_product_ready` all derived from the helper, a
`governance_required` run could be admitted with a disabled production
observer or a disabled AgentFuse gate. This violates the fail-closed
invariant. The v0.3.1 verification covered a *removed* observer (the name
line disappears from the dump); the *disabled* path was never covered.

## Root cause

Line-oriented scanning cannot see record state. In real 0.1.2-alpha.1 dumps
a plugin record is a top-level `- ` block whose `disabled:` field may appear
anywhere in the record — directly after `name:` (observer) or after the
whole `config:` block (agentfuse) — and base-profile records also carry
`disabled: !!js <expression>` values that no static scan can resolve.

## Fix

`dump_has_enabled_plugin(dump, package)` parses top-level plugin records
(column-zero `- ` starts; direct fields are the following two-space-indented
`key: value` lines; deeper indentation is nested configuration and is
skipped; any column-zero line ends the record):

```text
matching record, no disabled field            → enabled
matching record, disabled: false             → enabled
matching record, disabled: true              → disabled  (unavailable)
matching record, disabled: !!js … / malformed → ambiguous (unavailable)
duplicate matching records, enabled + enabled → available
duplicate matching records, conflicting       → unavailable
nested name: keys, bare name lines            → never identify a plugin
no matching record                            → unavailable
```

Every state other than unambiguously-enabled fails closed. The same check
now backs the AgentFuse adapter gate, the production observer gate, and
`governed_profile_is_product_ready`. Installed-package version provenance
(`profile/node_modules/.../package.json`) is unchanged and remains a
separate fact from runtime-enabled availability; governed admission
requires both.

## Regression matrix (unit, `control_plane_process`)

```text
enabled_plugin_detection_matrix
  enabled observer                        → true
  disabled: true after name               → false
  disabled: true after config block       → false   (real agentfuse shape)
  disabled sibling + enabled target       → true
  missing target                          → false
  disabled: false                         → true
  disabled: !!js expression               → false   (ambiguous)
  malformed disabled value                → false
  nested name: inside config              → false
  bare name line outside any record       → false
  duplicate enabled records               → true
  duplicate conflicting records           → false
  duplicate disabled fields in one record → false

governed_profile_requires_an_enabled_observer
  agentfuse enabled + observer disabled   → NOT ready

production_admission_rejects_the_validation_proof_as_an_observer
  proof fixture still cannot satisfy governed readiness
```

## Admission boundary regression

`governed_dsh_run_refuses_to_start_when_observer_disabled` runs the real
`probe_dsh`/`run_dsh` seam against stub DSH entrypoints over a real profile
layout (installed adapter metadata, evidence path, runtime root):

```text
enabled-observer dump   → production_observer_available=true
disabled-observer dump  → production_observer_available=false
                          (agent_fuse_adapter_available stays true:
                          the disabled observer is the only flip)
run_dsh(governance_required=true) on both →
  Err("Governed DSH admission failed before process start.")
agent-started marker absent in both cases → the process never started
```

## Real Windows verification (DSH 0.1.2-alpha.1 @ cd5ef81)

Post-fix, the new check was evaluated verbatim against four real
`--dump-config` captures (91 top-level records, including base-profile
`disabled: !!js` entries):

```text
both-enabled           observer=true          agentfuse=true
observer-disabled      observer=false         agentfuse=true
agentfuse-disabled     observer=true          agentfuse=false
both-disabled          observer=false         agentfuse=false
```

Positive governed regression with both plugins enabled: a real DeepSeek run
performed one `read` tool call with the complete evidence chain
(`model_request` → `pre_execute` decision `allow` → `dispatch` → `result`,
single `toolCallId` preserved end to end) and returned the probe file's
exact content. No governed-path regression.

## Verified results (Windows)

- Tauri (MSVC): full suite pass, counts in the milestone report.
- Observer `2/2`; workspace suites unchanged from the v0.3.1 baseline.
- `git diff --check` and secret scan clean; no credentials touched.

## Non-goals preserved

No v0.4 work, no approval UI, no streaming, no new backend, no AgentFuse
protocol change, no DSH change, no observer behavior change, no evidence
semantics change beyond admission availability truthfulness.
