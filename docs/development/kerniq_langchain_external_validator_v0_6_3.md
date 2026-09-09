# KerniQ LangChain External Validator v0.6.3 — Pilot README

Minimal local validator for ONE frozen external OBSERVED profile. You bring
an existing compatible archive; this tool never captures anything, never
uploads anything, and never modifies your source.

## Supported profile

| Item | Value |
| --- | --- |
| profile_id | `langchain-create-agent-tool-run-jsonl-v0.1` |
| profile_version | `0.1.0` (frozen by [v0.6.2 freeze](kerniq_langchain_external_profile_v0_6_2_freeze.md)) |
| capability | `OBSERVED` (runtime observations only — NOT governance, NOT execution proof) |
| producer pins | LangChain 1.4.0 · langchain-core 1.6.2 · langgraph 1.2.11 · langgraph-prebuilt 1.1.0 |
| environment pins | CPython 3.11.15 · Pydantic 2.13.5 (other environments require requalification, not best-effort acceptance) |
| source | existing unfiltered `astream_events(version="v2")` archive serialized by pinned `langchain_core.load.dump.dumps` (UTF-8, LF, final LF, one event per line) |
| accepted shape | one root invocation · one ordinary tool run · exactly one `on_tool_start` · exactly one matching `on_tool_end` · typed ToolMessage terminal with explicit `status="success"` |

## Prerequisites

- Python 3.11+ (stdlib only; no third-party dependency, no network)
- A source bundle directory containing exactly:

```
<your-source>/
  native-events.jsonl   your raw event archive (exact bytes are digested)
  provenance.json       pinned producer/environment/exporter/capture declaration
  inventory.json        per-file SHA-256 + byte length binding (kerniq-source-inventory-v1)
```

See `python/kerniq_external_validation/tests/fixtures/synthetic_valid_source/`
for a complete synthetic example (SYNTHETIC_TEST_FIXTURE=true — it is a test
fixture, not external validation evidence).

## Validate

```bash
cd python
python -m kerniq_external_validation validate --source <your-source-dir> --output external-validation-result.json
```

Exit codes: `0` = PASS · `2` = refused (UNSUPPORTED_SOURCE / SOURCE_INCOMPLETE / CORRELATION_UNPROVEN) · `3` = validation error · `1` = usage.

## Verify

```bash
python -m kerniq_external_validation verify --artifact external-validation-result.json --source <your-source-dir>
```

Re-reads your source bytes, recomputes digests, re-runs the full offline
mapping, rebuilds the expected artifact and compares the WHOLE shareable
semantic envelope (result, capability_assessment, claims, claim_checks,
diagnostics, exclusions, evidence_validation, the full source_digest record,
evidence, lineage, privacy, identity versions). Only per-run clock metadata
(start/completed timestamps, duration, validation id, evidence.recorded_at)
is excluded from the comparison. Artifact files must also parse strictly
(duplicate keys / NaN / invalid UTF-8 refused) and be byte-identical to
their canonical serialization with a final LF — a respaced or reordered file
is rejected even if semantically equal. Forging any bound field — even with
a recomputed artifact digest — is REJECTED. Outputs `VERIFIED` (exit 0) or
`REJECTED` (exit 2) with reasons. It never trusts self-reported artifact
fields alone.

All source-bound references (Evidence `source_ref`/`snapshot_ref`/
`result_ref`, `attempt_ref`, `runtime_ref`, claim locators, `evidence_id`)
carry the FULL 64-hex SHA-256 of the exact source bytes
(`SOURCE_REFERENCE_DIGEST_LENGTH=64`).

## Result meaning

- `PASS` — the declared source contains a correlated runtime tool-request
  observation and a structured source-reported successful return, mapped
  into Evidence v0.2 with explicit unknowns and exact source binding.
  Every known fact carries a `langchain-archive:<digest>#L<line>#<pointer>`
  locator.
- Refusals — deterministic diagnostics with stable codes
  (`MISSING_PROVENANCE`, `UNSUPPORTED_PROFILE`, `INVALID_SOURCE`,
  `INCOMPLETE_SOURCE`, `CORRELATION_CONFLICT`, `UNSUPPORTED_SCOPE`,
  `UNSUPPORTED_SERIALIZATION`, `SOURCE_BINDING_FAILURE`,
  `OPAQUE_SOURCE_EXCLUDED`). Nothing is repaired, skipped or guessed.

## Unsupported scope (explicitly refused, no best-effort)

General LangChain support, automatic capture, capture helpers, LangSmith,
arbitrary trace formats, other astream_events versions (incl. v3), multiple
tool runs, nested/subagents, MCP, provider-hosted tools, Command-returning
tools, injected-argument tools, middleware retries/short-circuits, custom
BaseTool lifecycle overrides, error profiles, replay/resume, GUI, cloud
upload, accounts, telemetry.

## Privacy

LOCAL_ONLY_VALIDATION_REQUIRED=true: no network, no telemetry, no upload, no
credential access, no reads outside your source directory. The result
artifact contains no raw prompts, tool payloads, absolute paths or customer
data — only digest-backed locators and diagnostic codes. Sharing the
artifact is your choice (see artifact `privacy` block).

## Known limitations

- Requires an existing compatible archive; the capture/export path itself
  is unproven for external users (`CAPTURE_PATH_REVIEW_REQUIRED_BEFORE_GENERAL_LANGCHAIN_PILOT=true`).
- F-01 (silent serialization fallback of opaque Command values) is avoided
  by bounded exclusion, not fixed: `FULL_CAPTURE_QUALIFICATION=REJECTED`,
  `F01_FULL_CAPTURE_STATUS=UNRESOLVED`.
- Model-request-to-tool-run correlation (Level B) is NOT proven and never
  fabricated; `on_tool_start` is a runtime request observation, not physical
  execution; a successful ToolMessage is not authorization or a side-effect
  proof; exactly-once physical execution is not claimed.
- No external validation, adoption, or general LangChain support is claimed
  by a passing result.

Implementation report: [kerniq_langchain_minimal_validator_v0_6_3_implementation.md](kerniq_langchain_minimal_validator_v0_6_3_implementation.md).
