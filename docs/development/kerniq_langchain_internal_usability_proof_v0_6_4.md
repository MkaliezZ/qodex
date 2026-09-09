# KerniQ LangChain Internal Usability Proof v0.6.4

## Result

**FAIL — FIX_USABILITY_THEN_RERUN.** The first fresh-clone journey could not launch the README commands: `python` is not installed under that executable name on this macOS host. Both validate and verify exited 127; no artifact exists. The host has system `python3` 3.14.6, which satisfies the README's stated Python 3.11+ prerequisite. The README does not document selecting `python3` when `python` is absent.

This is DOCUMENTATION_FRICTION at the interpreter-launch step, not evidence of a validator implementation bug or an architecture blocker. No command substitution, installation, alias, environment workaround, product edit, or fresh retry was used to erase the first failure. Outreach is not ready or authorized by this failed proof.

The observed failed session took 90.670 seconds through README-only interpretation. That is **not** a time to a verified artifact and is **not** a successful sub-ten-minute result. Those completion metrics are unavailable because their required milestones were not reached.

## Exact baseline and scope

- Repository: MkaliezZ/qodex.
- BASE_MAIN_HEAD: `f672deec16a056945ea25e13742d27e6f7a69abc`.
- PR #32 merge: `f672deec16a056945ea25e13742d27e6f7a69abc`.
- Implementation HEAD in main history: `58b3c877e2436cdafa21acf1625923269dd6679a`.
- Main drift after the supplied merge: none.
- Fresh clone HEAD independently matched the baseline; main was checked again before recording this report and remained unchanged.
- Evidence branch: `test/kerniq-langchain-usability-v0-6-4`.
- Only this report is added. No validator, profile, Evidence schema, runtime, governance, pilot README, tests, or sample source was changed.

Preflight ran `git fetch origin` in a separate existing checkout. Its configured refspec tracked an older feature branch only, so an explicit `git fetch origin refs/heads/main:refs/remotes/origin/main` was required. An ancestry check confirmed PR #32 is contained in main and its diff to main was empty. This administrative preflight did not read implementation internals or pilot instructions and is outside the timed participant journey. The timed acquisition below used a genuine new GitHub clone, not that checkout or a local object reference.

## Participant and fresh environment

This was a Codex-operated internal usability test, not a human-subject study or external validation. The operator did not participate in v0.6.3 implementation. Earlier handoff context included the v0.6.2 scope and the task supplied the expected pilot document/sample names; discovery therefore represents a task-informed user allowed to search filenames, not blind first-visit discoverability.

- OS: macOS 13.4, build 22F66.
- Git: 2.53.0.
- Available system interpreter: Python 3.14.6 via `python3`.
- README interpreter command: `python`; absent, exit 127.
- No active virtual environment; VIRTUAL_ENV and PYTHONPATH unset.
- Fresh temporary checkout: `work/kerniq-usability-v0-6-4/`, relative to the isolated task directory. It did not exist before acquisition.
- No existing artifact, venv, prepared validator setup, or developer shell history was used.
- No pip/package install, Python path change, source patch, internal import, fixture generator, or test execution was performed.
- The requested `cd python` was represented by setting the command working directory to the clone's `python/` directory; this is the documented directory change, not a Python import workaround.

The repository and sample were downloaded over GitHub. Only root README, the pilot README, filenames, the explicitly documented sample's provenance, environment facts, and public command outputs were inspected during the user journey. Test code, helpers, implementation files, and implementation reports were not read. No AGENTS.md was found by the filename inventory.

## Protocol and clock

T0 was recorded immediately before dispatching the first acquisition command, while the destination did not exist. Real elapsed wall-clock timestamps were captured using `Date.now()` in the tool orchestrator, including command dispatch, tool authorization overhead, acquisition wait, reading, and reasoning time. No timing segment was reset or subtracted. Times below are UTC; the local date was 2026-09-10 (UTC+08:00).

| Milestone | UTC timestamp | Meaning |
| --- | --- | --- |
| T0_ACQUIRE_START | 2026-09-09T16:59:02.075Z | Before first clone action |
| T1_REPO_READY | 2026-09-09T16:59:13.456Z | Clone completion observed |
| T2_README_FOUND | 2026-09-09T16:59:27.150Z | Filename discovery and initial README retrieval complete |
| T3_SOURCE_READY | 2026-09-09T16:59:46.087Z | Documented sample located and declaration read; interpreter check had failed |
| T4_VALIDATE_COMPLETE | 2026-09-09T16:59:50.086Z | Validate attempt finished with exit 127, not PASS |
| T5_VERIFY_COMPLETE | NOT_REACHED | No VERIFIED artifact |
| T5_VERIFY_ATTEMPT_COMPLETE | 2026-09-09T17:00:07.237Z | Verify attempt finished with exit 127 |
| T6_SEMANTIC_INTERPRETATION_COMPLETE | NOT_REACHED | Required README-plus-artifact interpretation unavailable |
| T6_README_ONLY_INTERPRETATION_COMPLETE | 2026-09-09T17:00:32.745Z | README-only answers recorded; artifact was absent |

| Stage | Seconds | Qualification |
| --- | ---: | --- |
| ACQUIRE_SECONDS | 11.381 | T1 minus T0 |
| DISCOVERY_SECONDS | 13.694 | T2 minus T1; includes initial README retrieval |
| PREPARE_SECONDS | 18.937 | T3 minus T2; includes reading prerequisites, environment and sample checks |
| VALIDATE_JOURNEY_SECONDS | 3.999 | Failed launch attempt |
| VERIFY_JOURNEY_SECONDS | 17.151 | Diagnosis, artifact absence check, and failed verify launch |
| INTERPRET_SECONDS | 25.508 | README-only interpretation |
| TOTAL_SECONDS | 90.670 | Observed failed journey duration |
| TIME_TO_VERIFIED_ARTIFACT_SECONDS | N/A | T5 was not reached |
| END_TO_END_USABILITY_SECONDS | N/A | Required T6 was not reached |

The test stopped for a documented-path failure before the 600-second budget expired. A failure within 600 seconds does not satisfy the KPI.

## Commands and observed outputs

The actual acquisition command was:

```sh
git clone https://github.com/MkaliezZ/qodex.git work/kerniq-usability-v0-6-4
```

From that fresh clone, discovery and baseline checks used:

```sh
git rev-parse HEAD
rg --files -g '*README*' -g '*external*validator*' -g AGENTS.md
cat README.md
cat docs/development/kerniq_langchain_external_validator_v0_6_3.md
```

The filename search found the pilot README. The main README's External Validation section still says no public v0.6 validation CLI is claimed yet; it did not supply a direct pilot link. This did not prevent discovery via the expressly allowed filename search. The pilot README clearly names the synthetic example and its limitations.

Prerequisite/environment and sample checks:

```sh
python --version
sw_vers
git --version
ls python/kerniq_external_validation/tests/fixtures/synthetic_valid_source
cat python/kerniq_external_validation/tests/fixtures/synthetic_valid_source/provenance.json
```

The first observed failure was the interpreter check:

```text
zsh:1: command not found: python
exit_code=127
```

The sample directory contained `inventory.json`, `native-events.jsonl`, and `provenance.json`. Its provenance declares `synthetic_test_fixture=true`, `synthetic-test-exporter`, and a synthetic one-tool-run capture. Thus `SYNTHETIC_TEST_FIXTURE=true` and `INTERNAL_USABILITY_SAMPLE=true`. This is neither an external-owned archive nor a real capture proof. The sample's producer Python pin is distinct from the validator host's Python prerequisite.

From the documented `python/` directory, the literal README command pattern was attempted with its source placeholder replaced by the documented sample path:

```sh
python -m kerniq_external_validation validate --source kerniq_external_validation/tests/fixtures/synthetic_valid_source --output external-validation-result.json
```

Output:

```text
zsh:1: command not found: python
exit_code=127
```

A single bounded diagnostic established the available interpreter and absence of an artifact:

```sh
python3 --version
command -v python3
test -f external-validation-result.json
```

The version was `Python 3.14.6`; the file-existence check exited 1. The command locator confirmed a system installation; its personal/absolute location is intentionally not stored in this report.

The required verify command was attempted from the same documented directory:

```sh
python -m kerniq_external_validation verify --artifact external-validation-result.json --source kerniq_external_validation/tests/fixtures/synthetic_valid_source
```

It also returned `zsh:1: command not found: python`, exit 127. Neither command entered the validator. Consequently there is no PASS, REFUSED, validation error, VERIFIED, or REJECTED product result to attribute to the validator. No `python3 -m kerniq_external_validation` diagnostic run or retry was performed.

After the timed journey, a system-Python environment-only check confirmed no active venv or PYTHONPATH override. Git status was clean before this report was added.

## Artifact handling

- Expected relative output: `python/external-validation-result.json` within the temporary checkout.
- Actual artifact: absent.
- Artifact digest: N/A.
- Artifact result: NOT_CREATED.
- Verify result: NOT_RUN_INTERPRETER_UNAVAILABLE.
- No temporary artifact or raw source was staged or committed.

## Semantic interpretation

Only the pilot README supported these answers; no artifact was available for the required joint interpretation.

| Question | Answer | README basis |
| --- | --- | --- |
| A. Does this prove LangChain governance? | NO | Capability is OBSERVED, not governance |
| B. Does this prove a physical side effect? | NO | A successful ToolMessage is explicitly not a side-effect proof; physical execution is not claimed |
| C. Does this prove model ToolCall to tool-run correlation? | NO | Level B is explicitly not proven |
| D. What does a PASS mean? | One frozen OBSERVED source profile contains a correlated runtime tool-request observation and structured source-reported successful return, mapped to Evidence v0.2 with explicit unknowns, refused claims and exact source binding | Supported profile, Result meaning, Known limitations |

The README communicates these boundaries clearly. These answers describe the documented contract, not a successfully validated instance in this test. `SEMANTIC_USABILITY_PASS=false` conservatively records that the required README-plus-artifact journey was incomplete. No actual validator truth-boundary violation was observed because the validator did not launch.

## Friction and minimum next change

1. **Blocking DOCUMENTATION_FRICTION — interpreter executable mismatch.** The stated prerequisite is Python 3.11+, satisfied by the installed system `python3`, but every example invokes `python`. No selection or fallback instruction is provided. This is not a typo by the participant and is not eligible for a fresh retry under the user-error exception.
2. **Nonblocking DOCUMENTATION_FRICTION — root entry point is stale.** The root README still describes the validation CLI as a future milestone. The allowed filename search succeeds, so README_DISCOVERABLE remains true, but this is a confusing first contact.

At most two minimal proposed changes, neither implemented here:

1. Document checking and using the available Python 3.11+ command, including `python3` on macOS/Linux, consistently for both validate and verify; retain the documented `cd python` and explicit sample substitution.
2. Add a root README link to the existing pilot README and update its stale CLI-availability sentence.

Then rerun once from a new directory with acquisition included. No packaging redesign, architecture work, capture helper, new profile, or schema change is required by this finding. The ability of the current implementation to run under host Python 3.14.6 remains untested; no compatibility claim is inferred from the prerequisite.

## Gates and authorization

Acquisition, fresh environment, README discovery and sample discovery passed. Validate, artifact creation, verify, the verified-artifact timing KPI, and full semantic usability did not pass. The failed documented entry path blocks this usability gate; `PRODUCT_BLOCKER=false` below means no demonstrated product-code defect, not that the failed gate can be waived. `SECURITY_BLOCKER=false` and `TRUTH_BOUNDARY_BLOCKER=false` mean none observed in this bounded journey, not security certification.

No retry, product fix, outreach, issue, PR, merge, tag or release was performed. Only the evidence report is to be committed and pushed. Outreach authorization is conditional on PASS and therefore remains false.

```text
BASE_MAIN_HEAD=f672deec16a056945ea25e13742d27e6f7a69abc
PR_32_MERGE_COMMIT=f672deec16a056945ea25e13742d27e6f7a69abc
IMPLEMENTATION_HEAD=58b3c877e2436cdafa21acf1625923269dd6679a
PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1
PROFILE_VERSION=0.1.0
CAPABILITY_CLASSIFICATION=OBSERVED
SOURCE_ACQUISITION_MODE=EXISTING_ARCHIVE_ONLY
DISTRIBUTION_MODE=GITHUB_CLONE
DISTRIBUTION_INCLUDED=true
FRESH_ENVIRONMENT_USED=true
DEVELOPER_SHORTCUTS_USED=false
README_DISCOVERABLE=true
SAMPLE_SOURCE_DISCOVERABLE=true
SYNTHETIC_TEST_FIXTURE=true
INTERNAL_USABILITY_SAMPLE=true
DOCUMENTATION_GAP=true
VALIDATE_PASS=false
VALIDATE_EXIT_CODE=127
ARTIFACT_CREATED=false
ARTIFACT_RESULT=NOT_CREATED
VERIFY_PASS=false
VERIFY_EXIT_CODE=127
VERIFY_RESULT=NOT_RUN_INTERPRETER_UNAVAILABLE
TIME_TO_VERIFIED_ARTIFACT_SECONDS=N/A
END_TO_END_USABILITY_SECONDS=N/A
TOTAL_SECONDS=90.670
TARGET_TIME_TO_FIRST_RESULT_MINUTES=10
TARGET_TIME_TO_FIRST_RESULT_MET=false
SEMANTIC_USABILITY_PASS=false
USER_UNDERSTANDS_NOT_GOVERNANCE=true
USER_UNDERSTANDS_NOT_PHYSICAL_EXECUTION=true
USER_UNDERSTANDS_LEVEL_B_NOT_PROVEN=true
INTERNAL_USABILITY_PROOF=FAIL
FIRST_RUN_RESULT=FAIL
FIRST_FAILURE_STAGE=STEP_3_PREPARE_INTERPRETER_CHECK
FIRST_FAILURE_REASON=README_PYTHON_EXECUTABLE_NOT_FOUND
FIRST_BLOCKED_REQUIRED_OPERATION=STEP_4_VALIDATE
RETRY_PERFORMED=false
FRICTION_COUNT=2
PRODUCT_BLOCKER=false
SECURITY_BLOCKER=false
TRUTH_BOUNDARY_BLOCKER=false
PILOT_OUTREACH_READY=false
PILOT_OUTREACH_AUTHORIZED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
ARCHITECTURE_CHANGE_REQUIRED=false
CODE_CHANGED=false
TEST_CHANGED=false
PRODUCT_DOC_CHANGED=false
EVIDENCE_REPORT_ADDED=true
FINAL_RECOMMENDATION=FIX_USABILITY_THEN_RERUN
FINAL_STATUS=LANGCHAIN_MINIMAL_VALIDATOR_V0_6_4_INTERNAL_USABILITY_PROOF_FAIL_DOCUMENTATION_FRICTION
```
