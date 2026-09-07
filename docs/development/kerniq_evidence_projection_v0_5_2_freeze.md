# KerniQ Evidence Projection v0.5.2 Freeze

## Merge Record

- PR: [#28](https://github.com/MkaliezZ/qodex/pull/28), `feat: add evidence v0.2 runtime projection proofs`.
- Merge commit: `56e91c9e6f96365006b2da9cba8797c088f26a25`.
- Source feature HEAD: `6b8e5d8b383648544fb90943d58c6b51e2db3f4d`.
- Previous main HEAD / merge-base: `b743a5727f51986bcafbac4e638af8ad218badbb`.
- All nine commits retained by a merge commit, not squash. Merge tree equals the reviewed feature tree; no runtime, admission, workflow, or LangChain-specific schema/validator changes. DSH implementation and conformance validator remain unchanged from their introduction commits.

## Independent Validation

Executed during this final review, not copied from prior test reports:

| Interpreter | LangChain projection | DSH projection | Conformance | Total |
| --- | --- | --- | --- | --- |
| CPython 3.11.15 | 32 passed | 21 passed | 46 passed | 99 passed |
| CPython 3.13.14 | 32 passed | 21 passed | 46 passed | 99 passed |

Both runs used pytest 9.0.3 with plugin autoload and bytecode writes disabled. Python 3.13 used an isolated environment outside the repository. No LangChain installation, model call, or fresh capture occurred.

Command, with each interpreter substituted for `python`:

```sh
PYTHONDONTWRITEBYTECODE=1 PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 PYTHONPATH=python python -m pytest -p no:cacheprovider -q python/kerniq_evidence_projection/tests/test_langchain_projection.py python/kerniq_evidence_projection/tests/test_projection.py python/kerniq_evidence_conformance/tests
```

`git diff --check` passed. The complete capture directory matches original commit `7ba1f9cfce6959d2c929339028b2a1b8800a56b9`; all 11 manifest payload hashes and the file list verified. Historical REJECTED qualification and limited-profile disposition records remain unchanged. An additional read-only traversal verified all four known Evidence source references use L21/L27, never the opaque lines.

## CI Result

PR CI: **SUCCESS**, [KerniQ CI run 34156549967](https://github.com/MkaliezZ/qodex/actions/runs/34156549967).

All five jobs passed: build-and-test, python-bridge, desktop-e2e, native-check (macos-latest), and native-check (windows-latest). Before merge, GitHub reported MERGEABLE/CLEAN, the expected HEAD/base, no changes-requested review, and no effective main branch rules requiring an additional review.

The existing workflow does not run the three new offline Evidence suites; the 99-test results above are independent local validation, not remote Evidence CI coverage. The Node.js 20 action deprecation annotation was a non-blocking warning. This record describes completed PR CI, not a claim that subsequent main-push runs have completed.

## Accepted Claims

These are bounded engineering proofs, not runtime enforcement or external adoption claims. Real-source labels refer to the reviewed, preserved captures and their provenance, not a new live run or independent authentication of the historical provider session.

```text
EVIDENCE_V0_2_CONFORMANCE_PROVEN=true
DSH_OFFLINE_PROJECTION_PROVEN=true
LANGCHAIN_LIMITED_OFFLINE_PROJECTION_PROVEN=true
REAL_LANGCHAIN_SOURCE=true
REAL_MODEL_SOURCE=true
REQUEST_PROJECTION_PROVEN=true
REQUESTED_ARGUMENT_PROJECTION_PROVEN=true
CALL_CORRELATION_PROVEN=true
SOURCE_CONFIRMED_COMPLETION_PROVEN=true
SOURCE_CONFIRMED_OUTCOME_PROVEN=true
UNKNOWN_PRESERVATION_PROVEN=true
```

## Forbidden Claims

```text
LANGCHAIN_SUPPORTED=false
LANGCHAIN_GOVERNANCE_PROVEN=false
LANGCHAIN_RUNTIME_CONTROL_PROVEN=false
PHYSICAL_EXECUTION_PROVEN=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
UNIVERSAL_RUNTIME_PROJECTION_PROVEN=false
```

These false flags deny a proof/support claim; they do not assert that an unobserved event did not occur. Projection != Execution Control; Decision != Outcome; Authorized != Executed; Blocked != Failed; Unknown != False.

## Known Limitations

```text
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
LIMITED_PROFILE_USED=true
```

- LangChain admits only `langchain-create-agent-native-stream-v0.1-limited` and the fixed real bundle. Opaque Command carrier lines 22/23/50/51 remain unchanged and excluded; no repr interpretation or lossless-capture claim.
- LangChain decision, authorization, trusted identity, effective/executed arguments, and execution release/dispatch/start remain unknown. A typed successful return proves neither physical entry nor side effects.
- R-02 reproducibility configuration gaps and R-03 recorder append/re-run safety remain deferred. This freeze does not authorize recapture or certify repeat-run safety.
- DSH proof retains its audited observer mapping, real/synthetic distinction, missing-argument semantics, and block-versus-failure distinction. No universal observer/profile claim.
- Conformance validates the frozen contract's structure and stated constraints, not truth of arbitrary source claims, authentication, or runtime trust. No cross-process exactly-once or production certification.

## Next Stage

**EXTERNAL_VALIDATION / ADOPTION PROOF**, separately authorized. No next-stage implementation is designed or started here. No release tag is created by this freeze.
