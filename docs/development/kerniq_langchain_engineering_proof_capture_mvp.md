# KerniQ v0.5.1 — LangChain Engineering Proof Capture (MVP)

```text
PLAN=docs/development/kerniq_langchain_engineering_proof_source_acquisition_plan_v0_5_1.md
BRANCH=feat/kerniq-langchain-proof-capture-v0-5-1 (from main b743a572)
SOURCE_CLASS=TEAM_OWNED_ENGINEERING_EXPERIMENT
CAPTURE_CLASS=TEAM_LAB_NATIVE_STREAM_CONSUMER
```

## Environment

Isolated experiment directory `experiments/langchain-proof-v0-5-1/` with
its own virtualenv — outside the KerniQ runtime/package dependency graph.
No KerniQ runtime, Evidence Schema, validator, or project dependency was
modified; no adapter, projector, middleware, callback hook, monkey patch,
or SDK exists in this experiment.

## Versions (actually resolved, not ranges)

```text
Python 3.11.15 (Windows x86_64)
langchain            1.4.0
langchain-core       1.6.1
langgraph            1.2.11
langchain-deepseek   1.1.0
langchain-openai     1.6.0  (resolved via langchain-deepseek)
openai               3.8.0  (resolved)
```

Full frozen environment in `context/dependencies.lock` inside the bundle.

## Capture Method

One real run of an unmodified `langchain.agents.create_agent` with:

- **Tool**: `add(a: int, b: int) -> int` — pure arithmetic, no I/O.
- **Model**: real DeepSeek API call (`deepseek-chat`) via
  `langchain_deepseek.ChatDeepSeek`; no FakeModel, no replay.
- **Input**: "Use the add tool exactly once to compute 17 + 25 …"
- **Stream**: the public native event entry
  `agent.astream_events(..., version="v2")` — consumed once, archived
  line-by-line; no callbacks injected, no agent behavior changed, no
  governance fields added.

Serialization uses the public, versioned LangChain serializer
`langchain_core.load.dump.dumps` (representation `lc-dumps-jsonl-v1`):
native objects (BaseMessage etc.) keep their type markers; the archive is
the serialized native event stream, not provider wire bytes. A
serialization failure would have been recorded as a diagnostic with the
capture marked incomplete — none occurred.

## Real Run Result

```text
exit_status=ok    raw native events=53    diagnostics=0
model calls: 2 × on_chat_model_start/end (tool-requesting call + final
             summary call — expected: the plan notes a root invocation may
             contain more than one model request)
tool:        on_tool_start add(a=17, b=25) → on_tool_end ToolMessage
             content="42", status="success",
             tool_call_id=call_00_EMjZPaEGySyDBpxQD2St6577 (preserved)
             run_id/parent_ids preserved on every event
```

The tool result is verifiable arithmetic (17+25=42) produced by the real
function through the real agent loop — the predictable answer does not
make the capture synthetic; every event came from the live stream.

## Bundle Layout

```text
experiments/langchain-proof-v0-5-1/engineering-source-bundle/
  manifest.json            payload file list + per-file sha256/bytes
  bundle.sha256            sha256 of manifest.json bytes (no-loop root)
  raw/native-events.jsonl  53 native events, lc-dumps-jsonl-v1
  context/runtime-versions.json  actually resolved versions
  context/dependencies.lock      pip freeze of the isolated venv
  context/execution-config.json  model/tool/stream/run settings
  context/invocation-input.json  fixed input text + tool target args
  context/experiment-snapshot.txt capture_agent.py snapshot + self digest
  context/serialization-profile.md serializer API/version/policy
  context/provenance.md          source class, producer/collector identity,
                                 credential handling, raw immutability
  capture/session.json           capture identity, start/end, exit status
  capture/receipts.jsonl         collector receive order/time per event
                                 (collector metadata, not native timestamps)
  capture/diagnostics.jsonl      empty (no serialization/stream failures)
```

Raw events contain no KerniQ, evidence, decision, or authorization fields;
the raw archive is append-only and unedited after capture. The
DEEPSEEK_API_KEY was read from the user environment at runtime and never
written to any bundle file (verified: no `sk-` occurrence in the archive).

## Verification (test_bundle.py)

```text
6 passed
  bundle files exist
  manifest per-file digests match; every payload listed; no orphans
  bundle.sha256 == sha256(manifest.json bytes)
  raw events parse; native identity (run_id/parent_ids/tool_call_id)
    preserved; tool round-trip present; no governance fields; no secrets
  receipts/session consistent (counts, indexes, stream config)
  provenance complete (source class, consumer class, pinned versions,
    model id, snapshot self-digest)
```

## Known Limitations

- Single capture, single run: no second independent run (plan SHOULD,
  not executed); model output/content is not byte-reproducible even though
  the process is.
- The native v2 format carries no per-event native timestamps; receipt
  times are collector receive times, never native execution times.
- No approval/identity events exist in this experiment (none were
  configured): any future qualification must keep authorization and
  identity UNKNOWN for this source — the capture deliberately adds no
  instrumentation to fill them.
- `on_tool_start` proves the tool node ran within the agent graph; it is
  not, by itself, proof of the physical function entry point (that
  boundary question belongs to source qualification, not capture).
- Receipt/manifest hashes protect artifact integrity against accidental
  modification, not against a determined attacker who recomputes them
  (per plan: hashes do not certify authenticity).

## Qualification Status

```text
SOURCE_QUALIFICATION_STATUS=PENDING_MISSING_EVIDENCE→READY_FOR_READ_ONLY_REVIEW
```

The previous PENDING status was "no actual bundle exists". This capture
resolves that gap: a real, archived, digest-verifiable native source now
exists for read-only qualification. Qualification itself (coverage,
correlation adequacy, gap analysis) is the NEXT separately-authorized task
— this MVP neither performs it nor presupposes its outcome, and creates no
projection/adapter.

```text
FILES_CHANGED=docs/development/kerniq_langchain_engineering_proof_source_acquisition_plan_v0_5_1.md (verbatim)
             experiments/langchain-proof-v0-5-1/capture_agent.py
             experiments/langchain-proof-v0-5-1/test_bundle.py
             experiments/langchain-proof-v0-5-1/engineering-source-bundle/** (real capture artifacts)
             docs/development/kerniq_langchain_engineering_proof_capture_mvp.md
CODE_CHANGED=true (isolated experiment entry + verification only)
TEST_CHANGED=true (6 bundle verification tests)
RUNTIME_CHANGED=false   SCHEMA/VALIDATOR: unchanged
DEPENDENCY_CHANGED=none in the project graph (experiment venv is isolated)
SOURCE_BUNDLE_CREATED=true
LANGCHAIN_RUNTIME_EXECUTED=true (one real run; real model call)
FINAL_STATUS=LANGCHAIN_ENGINEERING_PROOF_CAPTURE_COMPLETE
```
