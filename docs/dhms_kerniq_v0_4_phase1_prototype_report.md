# DHMS / KerniQ v0.4 — Cheshire Cat Governed Preview Prototype (Phase 1)

```text
REPOSITORY=MkaliezZ/qodex
BRANCH=feat/kerniq-v0.4-cheshire-preview
BASELINE=v0.3.3.3 (b743a5727f51986bcafbac4e638af8ad218badbb)
TARGET_RUNTIME=cheshire-cat-ai==2.0.23
VALIDATED_SEAM=Agent.call_tool() -> Tool.execute()
```

## Changed files

```text
python/kerniq_cheshire_preview/__init__.py            public attach API
python/kerniq_cheshire_preview/admission.py           governed runtime admission
python/kerniq_cheshire_preview/evidence.py            Evidence Schema v1 JSONL capture
python/kerniq_cheshire_preview/sidecar_main.py        AgentFuse decision sidecar (subprocess IPC)
python/kerniq_cheshire_preview/interceptor.py         call_tool interceptor + sidecar client
python/kerniq_cheshire_preview/tests/conftest.py      seam-shaped fixtures (real Agent subclass)
python/kerniq_cheshire_preview/tests/test_governed_paths.py    block/allow/duplicate/timeout/mismatch/evidence
python/kerniq_cheshire_preview/tests/test_sidecar_and_real.py  real AgentFuse decisions + real sidecar IPC + real cheshire shapes
docs/dhms_kerniq_v0_4_phase1_prototype_report.md      this report
```

No changes to `MkaliezZ/dhms-engine`, no changes to frozen v0.3.3.x
artifacts, no unrelated refactors.

## Architecture implemented

```text
existing Cheshire Cat runtime (owns loop, tools, dispatch, side effects)
        |
        | SDK-free attach (runtime patch of Agent.call_tool — no user code
        | changes, no kerniq import, no per-tool wrapping)
        v
kerniq_cheshire_preview.interceptor
        |  request {tool, arguments, tool_call_id}
        v
local IPC sidecar (separate process, JSON lines over stdio)
        |  uses dhms-agentfuse RuntimeGuard (frozen protocol semantics)
        v
decision allow | block   (deny list > allow list > default; anything
        |               unresolved — timeout, dead sidecar, unknown
        |               decision — maps to block: fail closed)
        v
allow  -> original Agent.call_tool runs exactly once -> Tool.execute()
block  -> original call_tool never invoked (Tool.execute unreachable);
          a host-native cheshire Message(role="tool") is returned
evidence JSONL records requested_arguments, policy_decision (allow|block),
effective_arguments (allow snapshot; no modify action exists),
executed_arguments, tool_result, dispatch flag, per request and result phase.
```

Runtime admission (`admission.py`) verifies before any patching:
`cheshire-cat-ai==2.0.23`, `Agent` from `cat.services.agents.base`,
`Tool` from `cat.mad_hatter.decorators`, both seam symbols awaitable,
parameter lists compatible with the frozen seam
(`call_tool(self, tool_call, …)`, `execute(self, agent, tool_call)`), and
the attach target is the audited `Agent` hierarchy. Any failure raises
`GovernanceAttachError` and nothing is patched. There is no
observation-only fallback.

Exactly-once dispatch is enforced twice: one dispatch point per request and
a per-attach ledger keyed by `tool_call_id` — a replayed tool call id (model
retry or duplicated decision delivery) returns a blocked host-native result
(`duplicate_tool_call_replayed`) instead of executing again.

## Test results

Run with the audited environment
(`cheshire-cat-ai==2.0.23`, `dhms-agentfuse==3.7.3`, pytest):

```text
20 passed in 5.15s
```

Coverage map:

```text
Block            protected_action denied -> execution_count == 0,
                 Tool.execute unreachable, host-native blocked Message,
                 full evidence fields (request_id, tool_call_id,
                 requested_arguments, decision=block, dispatch=false)
Allow            allowed tool -> execution_count == 1 exactly,
                 request+result evidence (effective == requested snapshot)
Duplicate        same tool_call_id replayed -> no second dispatch,
                 second outcome blocked as duplicate_tool_call_replayed
Timeout          sidecar silent -> block (sidecar_unavailable), no execution
Unknown decision sidecar answers "maybe" -> block (unknown_decision)
Runtime mismatch wrong version / missing package / non-Agent class /
                 broken call_tool signature -> GovernanceAttachError,
                 nothing patched (no observation-only fallback)
Evidence failure unwritable evidence path with decision=allow ->
                 fail closed to block, execution_count == 0
Sidecar semantics real dhms-agentfuse RuntimeGuard: denylist blocks,
                 allowlist allows, default action fall-through, unknown
                 guard output fails closed
Real IPC e2e     real subprocess sidecar through stdio JSON lines:
                 block and allow paths end to end
Real cheshire    real ToolCall accepted by the seam; blocked result is a
                 real Message(role="tool"); deterministic fixtures subclass
                 the real audited Agent so admission is exercised everywhere
```

Machines without the audited runtime skip the interceptor suites with an
explicit marker (`requires_real_cheshire`); sidecar-decision tests need only
`dhms-agentfuse`.

## Known limitations

```text
- Bounded preview, not a production adapter; single seam, single profile.
- The interceptor patches the Agent class at runtime; attach/detach is not
  concurrency-hardened beyond the exactly-once ledger.
- Sidecar round-trip is synchronous per request (thread + timeout) inside
  the async seam; adequate for the prototype, not tuned.
- AgentFuse "ask" deferrals do not exist in the Python RuntimeGuard config
  surface used here; every unresolved state maps to block by design.
- Evidence result-phase write failure after a real dispatch cannot un-execute
  the tool; the prototype keeps the fact but cannot rewrite history (the
  decision-phase failure mode is the fail-closed one and is enforced).
- No Windows/Linux/macOS matrix beyond the development machine (Windows)
  was run for this preview.
```

## Unsupported cases (out of Phase 1 boundary)

```text
- interactive ASK approval and its UX
- UI, dashboards, Docker deployment, production packaging
- multi-framework adapters (LangChain, OpenAI Agents, …)
- parameter transformation (no modify action; snapshots only)
- governance of non-call_tool execution paths (hooks, internal services)
- concurrent multi-agent attachment patterns
- upstream Cheshire Cat PRs or official integration claims
```
