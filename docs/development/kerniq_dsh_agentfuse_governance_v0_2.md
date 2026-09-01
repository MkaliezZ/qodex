# KerniQ v0.2 DSH + AgentFuse Governance Proof

## Verdict

`GOVERNED_DSH_PROVEN`

At the audited revisions, a real DeepSeek Harness process using the real
`deepseek-official/deepseek-v4-flash` provider issued tool calls that crossed
the real `tools/pre-execute` boundary. The published AgentFuse DSH adapter
blocked one call before dispatch, allowed the same tool pattern to produce a
physical side effect, and deferred an asklisted call into a fail-closed
unavailable approval channel.

This proof upgrades DSH, not every agent backend:

| Backend | External governance | Tier |
| --- | --- | --- |
| DeepSeek Harness at the audited configuration | `true` | `GOVERNED` |
| Codex CLI | `false` | `OBSERVED` |

## Pinned Components

- KerniQ proof base: `76f205deff97776de556167915fc1a7de2b77284`
- DeepSeek Harness: `cd5ef8148158c3a752a658978873241fdf8e2bbc`
  (`0.1.2-alpha.1`)
- AgentFuse DSH adapter: `@dhms-agentfuse/dsh-agentfuse@0.2.1`, source
  `c696a12257a910ee7b206958683955eb6edd1583`
- Provider route: `deepseek-official`
- Model: `deepseek-v4-flash`

The requested DSH alpha was not available from npm, so the official upstream
source was installed with `pnpm install --frozen-lockfile` and built with
`pnpm build`. The runtime entrypoint was `apps/cli/lib/bin.js`. The API key was
provided only through the inherited `DEEPSEEK_API_KEY` environment variable;
its value was never read into evidence, printed, or committed. Telemetry was
disabled for every proof process.

## Boundary Audit

The pinned DSH source executes the following sequence:

1. `ToolRuntime.prepareExecution()` invokes the scoped
   `tools/pre-execute` waterfall with the exact `callId`
   (`packages/core/tools/src/index.ts:1473`).
2. An `ask` is resolved by `serviceAsk()`; a deny becomes an error result and
   returns before a dispatch value is created
   (`packages/core/tools/src/index.ts:1478`, `:1485`, `:1502`).
3. Only a dispatch value reaches the `tools/execute` waterfall
   (`packages/core/tools/src/index.ts:1568`).
4. The registry sets `bodyInvoked=true` immediately before calling the tool
   body (`packages/core/tools/src/index.ts:1545`).
5. Approval requests preserve `callId`, append `approval/asked`, and append a
   paired `approval/decided` event. A missing or throwing answerer normalizes
   to `unavailable` (`packages/interaction/user-approval/src/index.ts:231`,
   `:269`).

Therefore `PRE_EXECUTE_BEFORE_TOOL_BODY=true` and
`DENY_PREVENTS_DISPATCH=true` are source-contract facts. Exact call IDs and
approval events were also observed in the real persisted session ledgers.

## AgentFuse Attachment

The published adapter loaded successfully in the current DSH profile despite
its older peer range. It registers one `tools/pre-execute` listener, maps the
exact DSH call ID, name, and arguments into AgentFuse, returns `deny` for a
block, returns `ask` for an approval deferral, and delegates with `next()` only
for an allow. No AgentFuse compatibility change was needed, and no DHMS source
was modified.

The committed proof fixture is an observer and safe test tool only. Its
prepended listeners record bounded call identity, gate result, dispatch, and
final result. It does not approve, deny, evaluate policy, or invoke a second
tool execution path. The tool body writes a body-entry marker before writing
one fixed harmless target.

For reproduction, initialize a fresh headless profile, install
`@dhms-agentfuse/dsh-agentfuse@0.2.1`, then install the local bundle at
`validation/fixtures/kerniq-dsh-governance-proof` through `dsh plugin
--profile headless add`. Run separate one-shot sessions with the block, allow,
and ask-unavailable overlays in `validation/fixtures`. Set only temporary paths
through the documented `KERNIQ_DSH_*` environment variables and disable
telemetry. The fixture is intentionally a package bundle rather than a bare
module so the current DSH request-extension package inventory can identify it.

## Real Cases

### Block

- Real model tool call: observed
- Tool call ID: `call_00_irGIrKvxOhu5ZSmQa1KQ0416`
- AgentFuse result: `block` (`explicit_denylist`)
- Pre-execute: observed
- Dispatch: not observed
- Tool body entry marker: absent
- Target side effect: absent
- Final tool result: error

The non-entry conclusion uses the independent dispatch observer and the
body-entry marker, not target-file absence alone.

### Allow

- Real model tool call: observed
- Tool call ID: `call_00_W6t36AIq6Kg4zgC9yLu46659`
- AgentFuse result: `allow` (`allowed`)
- Pre-execute: observed
- Dispatch: observed
- Tool body entry marker: present
- Target side effect: present with expected harmless content
- Target SHA-256:
  `1a50024e021a4302fb157dc3f6d315a3f384008cf5fec35db230b74ebc643d99`
- Final tool result: success

The temporary target was removed after evidence capture.

### Fail Closed

This was the permitted equivalent safe policy failure, not an AgentFuse
evaluation exception. AgentFuse returned `ask` with `requires_approval`; the
headless profile had no approval answerer. DSH persisted a paired
`approval/asked` and `approval/decided(outcome=unavailable)` for the request,
then returned an error without dispatching the tool.

- Real model tool call: observed
- Tool call ID: `call_00_hpYpAx6bti4De5azVFDS8002`
- AgentFuse result: `ask`
- Approval outcome: `unavailable`
- Dispatch: not observed
- Tool body entry marker: absent
- Target side effect: absent
- Outcome: `failed_closed`

## Evidence Semantics

- `observed`: model request context, tool call IDs, pre-execute decisions,
  dispatch observations, body markers, approval ledger events, tool results,
  and filesystem checks.
- `asserted_by_contract`: DSH's audited ordering of pre-execute, deny handling,
  dispatch, and tool-body invocation.
- `derived`: the capability classification produced only from a complete
  observed block, allow, and fail-closed evidence set.
- `unknown`: preserved by the evidence contract where an internal fact is not
  independently established; filesystem absence never becomes handler
  non-entry by itself.

The sanitized receipt is
`validation/evidence/kerniq_dsh_agentfuse_governance_v0_2.json`. It contains no
prompt, reasoning transcript, raw tool arguments, credential values, temporary
paths, or home-directory paths.

## Validation

- Focused governance and control-plane tests: 12/12 passed.
- Multi-agent Runtime: 207/207 passed.
- Agent Runtime: 124/124 passed.
- Full repository: 1842/1842 passed across 21 test projects.
- Repository build: passed. Vite retained its existing chunk-size warning.
- New governance source files: strict source-only TypeScript check passed.
- Package TypeScript command: blocked by the existing `TS6059` configuration
  mismatch (`rootDir: src` while `include` also contains `tests`). The failure
  listed all tests, including the new one, and did not identify a new source
  type error.
- Real DSH proof: block, allow, and fail-closed cases passed.

## Product Boundary

This materially validates the KerniQ control-plane thesis: DSH can be a real
external execution plane while AgentFuse remains the real pre-dispatch policy
authority. The smallest remaining product task is to wire this pinned DSH
launch and bounded evidence capture into the shipped KerniQ backend/control
plane lifecycle. The proof does not claim that the current desktop product
already launches this governed DSH profile automatically.
