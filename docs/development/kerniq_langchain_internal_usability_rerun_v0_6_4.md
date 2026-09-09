# KerniQ LangChain Internal Usability Rerun v0.6.4

## Outcome

**PASS — GO_TO_EXTERNAL_PILOT_OUTREACH.** Following the merged English README entry point in a fresh GitHub clone, the first validate invocation produced a PASS artifact and the first verify invocation returned VERIFIED. Both exited 0.

- Time from acquisition start to verified artifact: **61.296 seconds**.
- Time through README-plus-artifact semantic interpretation: **88.945 seconds**.
- Interpreter selected by the current README: `python3`, Python **3.14.6**.
- No installation, venv, alias, PATH/PYTHONPATH modification, hidden command, developer helper, product repair or retry was needed.

This is an internal, Codex-operated workflow proof on the documented **synthetic** sample. It is not an external-user study, real LangChain capture, external validation, adoption, governance or physical-execution proof. Passing on this particular host does not establish support for all Python 3.14 environments.

The failed first usability proof at `f866be342cd1c63f14c52c9e67abc41b1449fead` remains unchanged historical evidence. This document records a separate fresh run after the documentation fix; it does not replace or relabel that failure.

## Baseline and preflight

| Item | Verified value |
| --- | --- |
| Repository | MkaliezZ/qodex |
| PR #33 state | MERGED |
| PR #33 merge commit | `d560f2903e3f5af7e86c2c2448e00344366a461a` |
| BASE_MAIN_HEAD | `d560f2903e3f5af7e86c2c2448e00344366a461a` |
| PR #32 merge commit | `f672deec16a056945ea25e13742d27e6f7a69abc` |
| Implementation HEAD | `58b3c877e2436cdafa21acf1625923269dd6679a` |
| Documentation fix | `09f39fb354276aefe4def5c9124851efc921c296` |
| Drift after PR #33 merge | None |
| Fresh clone HEAD | Same as BASE_MAIN_HEAD |
| Evidence branch | `test/kerniq-langchain-usability-rerun-v0-6-4` |

An earlier preflight found PR #33 OPEN and correctly stopped without starting a timed run or creating a checkout. After the user requested another check, GitHub reported MERGED. Administrative preflight used `gh pr view 33 --repo MkaliezZ/qodex --json state,mergeCommit,url`, an explicit fetch of main in a separate checkout, ancestry validation for PR #32, and a name-only drift check against the PR #33 merge. No user-facing instructions or implementation internals were pre-read to prepare the timed commands. The fresh clone supplied all actual user-journey files. Main was checked again after the journey and had not moved.

## Fresh environment and operator limits

- macOS 13.4, build 22F66; Git 2.53.0.
- System Python 3.14.6 selected as `python3` after executing the README's `python3 --version` check.
- No active venv; VIRTUAL_ENV and PYTHONPATH unset.
- Fresh test directory: `work/kerniq-usability-v0-6-4-rerun/`, relative to the isolated task directory. It did not exist before T0.
- Real HTTPS GitHub clone; no worktree, local clone, copied repository, reused checkout, old venv or existing artifact.
- No pip install, package install, alias, PATH change or PYTHONPATH workaround.
- No validator source, tests, helpers, implementation report, architecture documents, or earlier usability report commands were read to solve the journey.
- The only file under the tests tree read directly was the current pilot README's explicitly documented sample `provenance.json`; its directory was listed. No test code was read or executed.

The operator did not implement v0.6.3. Prior context necessarily included the earlier failure and product boundaries, so this is a returning independent operator's document-led rerun, not a blinded new-user experiment. The current root README and pilot README supplied the entry point, interpreter selection, sample path, and exact CLI commands. No prepared shell history was used.

## Discovery and preparation

The root `README.md` was read first in the new clone. Its External Validation section directly links to `docs/development/kerniq_langchain_external_validator_v0_6_3.md`; the Documentation table also provides the link. No filename search was needed to find the pilot README.

The pilot README instructs macOS/Linux users to check `python3 --version` first, accept Python 3.11+, and use the same interpreter for both commands. The check returned 3.14.6. The README separately explains the archive's producer Python pin, avoiding confusion with the validator host interpreter.

The documented synthetic directory contained `native-events.jsonl`, `provenance.json`, and `inventory.json`. Its provenance declares `synthetic_test_fixture=true`, exporter `synthetic-test-exporter`, and a synthetic one-tool-run invocation. This is an internal usability sample only.

## Exact commands

Acquisition, from the isolated task directory:

```sh
git clone https://github.com/MkaliezZ/qodex.git work/kerniq-usability-v0-6-4-rerun
```

From the fresh clone, in this order:

```sh
cat README.md
git rev-parse HEAD
cat docs/development/kerniq_langchain_external_validator_v0_6_3.md
```

Preparation checks (independent environment/sample reads were batched):

```sh
python3 --version
cat python/kerniq_external_validation/tests/fixtures/synthetic_valid_source/provenance.json
ls python/kerniq_external_validation/tests/fixtures/synthetic_valid_source
sw_vers
git --version
```

The execution directory was then set to the clone's `python/` directory, exactly equivalent to the README's `cd python`. Both CLI commands below were copied from the newly read merged pilot README, including its bundled sample path:

```sh
python3 -m kerniq_external_validation validate \
  --source kerniq_external_validation/tests/fixtures/synthetic_valid_source \
  --output external-validation-result.json
```

Observed output, exit 0:

```text
result: PASS
profile: langchain-create-agent-tool-run-jsonl-v0.1 v0.1.0
source_digest: sha256:d652db3673bcae242f86332b8afd0a0ea4c0d9b108c4bec0d799f74097922efc
diagnostics: 1 (1 categories)
  - OPAQUE_SOURCE_EXCLUDED x1 severity=info first_line=3
opaque_exclusions: lines [3] (raw retained, not used)
artifact: external-validation-result.json
```

A stdlib JSON/file read confirmed the output file existed and its actual top-level `result` was `PASS`, rather than relying solely on CLI stdout.

```sh
python3 -m kerniq_external_validation verify \
  --artifact external-validation-result.json \
  --source kerniq_external_validation/tests/fixtures/synthetic_valid_source
```

Observed output, exit 0:

```text
verify: VERIFIED
artifact_digest: sha256:4e42f3da20a382bac98aa0aba83962700832cd730ca4375d81569095babf4c52
```

Artifact inspection for interpretation:

```sh
python3 -m json.tool external-validation-result.json
```

This read-only formatting printed to stdout; it did not rewrite or canonicalize the artifact. Post-timing bookkeeping used only stdlib JSON/hash/environment inspection and Git state checks, not internal product helpers. Validate and verify were each invoked exactly once, with no failure or corrective retry.

## Timing

Real elapsed timestamps were captured with the tool orchestrator's `Date.now()`. T0 preceded dispatch of the first clone command. All clone time, tool/authorization latency, reading, preparation, execution and interpretation were included; the clock was never paused or reset. Timestamp precision is milliseconds, not a claim of experimental measurement accuracy. UTC times below correspond to local 2026-09-10 (UTC+08:00).

| Milestone | UTC |
| --- | --- |
| T0_ACQUIRE_START | 2026-09-09T17:55:30.977Z |
| T1_REPO_READY | 2026-09-09T17:55:48.492Z |
| T2_README_FOUND | 2026-09-09T17:55:55.426Z |
| T3_SOURCE_READY | 2026-09-09T17:56:19.679Z |
| T4_VALIDATE_COMPLETE | 2026-09-09T17:56:23.152Z |
| T5_VERIFY_COMPLETE | 2026-09-09T17:56:32.273Z |
| T6_SEMANTIC_INTERPRETATION_COMPLETE | 2026-09-09T17:56:59.922Z |

T1 is the time clone completion was observed. T2 includes initial root and pilot README retrieval. T3 includes instruction comprehension, interpreter selection, sample/environment checks and selection of the documented command directory. T4 includes output-file and PASS-field confirmation. T5 records the first successful verify. T6 follows reading the full artifact and answering all semantic questions.

| Interval | Seconds |
| --- | ---: |
| ACQUIRE_SECONDS | 17.515 |
| DISCOVERY_SECONDS | 6.934 |
| PREPARE_SECONDS | 24.253 |
| VALIDATE_JOURNEY_SECONDS | 3.473 |
| VERIFY_JOURNEY_SECONDS | 9.121 |
| INTERPRET_SECONDS | 27.649 |
| TIME_TO_VERIFIED_ARTIFACT_SECONDS (T5-T0) | **61.296** |
| END_TO_END_USABILITY_SECONDS (T6-T0) | **88.945** |

Both completion times are below 600 seconds. The artifact's internal duration_ms=24 describes validator processing only; it is not the user-journey KPI.

## Artifact identity and handling

| Property | Value |
| --- | --- |
| Original output location | `python/external-validation-result.json`, relative to the fresh clone |
| Retained temporary location after testing | `work/kerniq-usability-v0-6-4-rerun-artifacts/external-validation-result.json`, relative to the isolated task directory |
| CLI-verified artifact digest | `4e42f3da20a382bac98aa0aba83962700832cd730ca4375d81569095babf4c52` |
| Artifact digest algorithm / canonicalization | sha256 / kerniq-json-canonical-v1 |
| Exact whole-file SHA-256 | `92e70a310c6ffb187054f0141181a8904ac18d042273901703a580c81a2d0f6a` |
| Exact file byte length | 8044 |
| Raw source SHA-256 | `d652db3673bcae242f86332b8afd0a0ea4c0d9b108c4bec0d799f74097922efc` |
| Raw source representation / byte length | utf8-jsonl-exact-v1 / 2738 |
| Result / evidence schema validation | PASS / pass |

The CLI artifact digest and exact whole-file hash are different measures and are deliberately distinguished. The artifact was retained outside the repository after testing, without changing its bytes; neither it nor the synthetic source is added to this evidence commit. No personal absolute paths, credentials, or usernames are included here.

## Semantic interpretation from README and artifact

| Question | Answer | Observed support |
| --- | --- | --- |
| A. Does this prove LangChain governance? | **NO** | capability_assessment=OBSERVED; GOVERNED_CAPABILITY and AUTHORIZATION_PROOF refused; decision and authorization remain unknown |
| B. Does it prove physical execution or side effects? | **NO** | PHYSICAL_EXECUTION and PHYSICAL_SIDE_EFFECT refused; execution release/dispatch/start remain unknown; completion is runtime settlement only |
| C. Does it prove model ToolCall to tool-run correlation? | **NO** | lineage.level_b_model_correlation is the string "false"; model origin is unknown; terminal call ID is retrospective, not model intent provenance |
| D. What does it establish here? | For one frozen OBSERVED LangChain source profile, the supplied archive contains a correlated runtime tool-request observation and a source-reported successful return, mapped to Evidence v0.2 while preserving unknown/refused claims and exact source binding | result=PASS, known requested snapshot and successful return locators, source-digest/root/tool correlation key, explicit unknowns and refused claims |

For this test specifically, that archive is synthetic. Passing validates the synthetic workflow; it does not establish a real producer, physical event, outside operator, outside source, external validation or adoption.

The informational `OPAQUE_SOURCE_EXCLUDED` diagnostic for line 3 is explicit and understandable: the nonessential opaque carrier is excluded from known evidence while raw bytes are retained. It is not a hidden fallback repair or a product failure. F-01 remains UNRESOLVED and full-capture qualification remains REJECTED. The known completion and success outcome do not convert unknown physical start or authorization into known facts.

## Friction, limits and decision

No usability friction or blocker was observed in this bounded English README journey: `FRICTION_COUNT=0`, `FAILURE_CLASS=NONE`. The interpreter entrypoint failure from the first run did not recur; root navigation and direct sample commands worked. No additional design, implementation review, packaging review, capture design or product fix is requested.

`THIS_TESTED_HOST_PYTHON_WORKS=true` applies only to this observed Python 3.14.6/macOS host and sample. It does not establish a general Python compatibility matrix. No separate security audit or negative-test campaign was performed; blocker=false means none observed during this task.

The known Chinese README parity gap was not inspected or modified. It remains required before broad public promotion and does not block a narrow external pilot using the English README.

All full-usability gates pass, so under this task's explicit conditional authorization:
**PILOT_OUTREACH_READY=true and PILOT_OUTREACH_AUTHORIZED=true** for the next stage. No outreach is performed in this task. External validation still requires an outside operator's own real source/run and a verified result; this report proves neither external validation nor adoption.

## Machine conclusions

```text
BASE_MAIN_HEAD=d560f2903e3f5af7e86c2c2448e00344366a461a
PR_33_MERGE_COMMIT=d560f2903e3f5af7e86c2c2448e00344366a461a
PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1
PROFILE_VERSION=0.1.0
RERUN_AFTER_DOC_FIX=true
DISTRIBUTION_MODE=GITHUB_CLONE
DISTRIBUTION_INCLUDED=true
FRESH_ENVIRONMENT_USED=true
DEVELOPER_SHORTCUTS_USED=false
ROOT_README_DIRECT_ENTRYPOINT_WORKS=true
README_DISCOVERABLE=true
SELECTED_PYTHON_COMMAND=python3
SELECTED_PYTHON_VERSION=3.14.6
PYTHON_SELECTION_INSTRUCTIONS_WORK=true
THIS_TESTED_HOST_PYTHON_WORKS=true
SAMPLE_SOURCE_DISCOVERABLE=true
SYNTHETIC_TEST_FIXTURE=true
VALIDATE_PASS=true
VALIDATE_EXIT_CODE=0
ARTIFACT_CREATED=true
ARTIFACT_RESULT=PASS
ARTIFACT_DIGEST=4e42f3da20a382bac98aa0aba83962700832cd730ca4375d81569095babf4c52
VERIFY_PASS=true
VERIFY_EXIT_CODE=0
VERIFY_RESULT=VERIFIED
TIME_TO_VERIFIED_ARTIFACT_SECONDS=61.296
END_TO_END_USABILITY_SECONDS=88.945
TARGET_TIME_TO_FIRST_RESULT_MINUTES=10
TARGET_TIME_TO_FIRST_RESULT_MET=true
SEMANTIC_USABILITY_PASS=true
USER_UNDERSTANDS_NOT_GOVERNANCE=true
USER_UNDERSTANDS_NOT_PHYSICAL_EXECUTION=true
USER_UNDERSTANDS_LEVEL_B_NOT_PROVEN=true
FIRST_USABILITY_RESULT=FAIL
SECOND_USABILITY_RESULT=PASS
INTERNAL_USABILITY_PROOF=PASS
FIRST_RUN_RESULT=PASS
FRICTION_COUNT=0
FAILURE_CLASS=NONE
PRODUCT_BLOCKER=false
SECURITY_BLOCKER=false
TRUTH_BOUNDARY_BLOCKER=false
CAPABILITY_CLASSIFICATION=OBSERVED
TOOL_RUN_LIFECYCLE_CORRELATION_PROVEN=true
MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN=false
F01_FULL_CAPTURE_STATUS=UNRESOLVED
FULL_CAPTURE_QUALIFICATION=REJECTED
PILOT_OUTREACH_READY=true
PILOT_OUTREACH_AUTHORIZED=true
ZH_README_PARITY_SYNC_REQUIRED_BEFORE_BROAD_PUBLIC_PROMOTION=true
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
ARCHITECTURE_CHANGE_REQUIRED=false
CODE_CHANGED=false
TEST_CHANGED=false
PRODUCT_DOC_CHANGED=false
FIRST_FAIL_REPORT_CHANGED=false
FINAL_RECOMMENDATION=GO_TO_EXTERNAL_PILOT_OUTREACH
FINAL_STATUS=LANGCHAIN_MINIMAL_VALIDATOR_V0_6_4_INTERNAL_USABILITY_RERUN_PASS_EXTERNAL_PILOT_AUTHORIZED
```

The delivery response records the report commit SHA and verified push status; a commit cannot embed its own SHA. Only this new report is committed. No PR, merge, tag, release, product edit, Chinese README synchronization, or outreach is part of this delivery.
