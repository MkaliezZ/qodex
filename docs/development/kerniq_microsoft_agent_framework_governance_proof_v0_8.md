# KerniQ Microsoft Agent Framework Governed Runtime Proof v0.8

## Verdict

**MAF_SINGLE_AGENT_GOVERNANCE_PROVEN=true** and **MAF_MULTI_AGENT_GOVERNANCE_PROVEN=true** for the bounded local-function path below. The four retained live runs used the official Microsoft Agent Framework Python runtime, its official OpenAI-compatible client and the real DeepSeek provider. A model-produced function call reached the installed FunctionMiddleware, the pinned canonical AgentFuse decided before release, and independent counter/file observations distinguished BLOCK from ALLOW.

**CAPABILITY_CLASSIFICATION=GOVERNED** applies exclusively to `MicrosoftAgentFrameworkGovernedBackend.start_task()` and its adapter-created local async `FunctionTool(value: str)`. This is an opt-in Python vertical slice, not desktop provider wiring or general Microsoft ecosystem support. Existing DSH governance and the frozen LangChain OBSERVED lane are unchanged.

The retained machine-readable [live proof receipt](kerniq_microsoft_agent_framework_governance_v0_8.evidence.json) contains native call/occurrence IDs, canonical AgentFuse decisions, ordered local observations, physical counts and marker digests, delegation returns, and validated Evidence v0.2 documents. It contains no credentials, raw provider conversations or customer data.

## Baseline and existing architecture audit

- Repository: `MkaliezZ/qodex`.
- `BASE_MAIN_HEAD=8b9d1bb0b0acf9eeecd7826a08668bb84bb80bee`, fetched before branch creation.
- Branch: `feat/kerniq-microsoft-agent-framework-governance-v0-8`.
- Existing [AgentBackend contract](../../packages/multi-agent-runtime/src/control-plane/types.ts), [DSH admission checks](../../packages/multi-agent-runtime/src/control-plane/backends/dsh-governed.ts), [task/worker/ledger flow](../../packages/multi-agent-runtime/src/control-plane/product-runtime.ts), and [backend conformance boundaries](agent_backend_conformance.md) were reviewed.
- The existing Python [CanonicalAgentFuse loader](../../python/kerniq_agentfuse_bridge/service.py) and canonical public decision-only `RuntimeGuard.aevaluate(ToolCallRequest)` are reused. No new policy engine or wire protocol was added.
- The existing [Evidence v0.2 conformance validator](../../python/kerniq_evidence_conformance/validator.py) validates every projected document. No schema, DSH projector or LangChain profile was changed.

The desktop bridge's original proof request requires an approval object. This lane has no independently established human approval, so it does **not** fabricate one to reuse that request shape. It reuses the same canonical loader/guard decision path in process, with a fresh request bound to the tool and effective arguments; authorization and approval attribution remain unknown. AgentFuse never invokes the handler here.

The Python backend returns the existing capability vocabulary (`GOVERNED`, `external_decision`, tool events) under a separate backend ID `microsoft-agent-framework-local`. It is deliberately not added to the TypeScript desktop provider list or supervisor transport. There is no new desktop settings UI, installer, task/ledger architecture or general provider productization.

## Official packages and source qualification

| Component | Exact version / source |
| --- | --- |
| Official Python core package | [agent-framework-core 1.17.0](https://pypi.org/project/agent-framework-core/1.17.0/) |
| Official OpenAI-compatible provider package | [agent-framework-openai 1.14.2](https://pypi.org/project/agent-framework-openai/1.14.2/) |
| OpenAI SDK | 3.11.0 |
| Pydantic | 2.13.5 |
| Python used for proof | 3.14.6 |
| MAF upstream release | [python-1.17.0](https://github.com/microsoft/agent-framework/releases/tag/python-1.17.0) |
| MAF upstream commit | `4507512f95effaae4518d658e86e9afc0ccb4514` |
| Canonical AgentFuse | dhms-agentfuse 3.6.0 at `ec4b5842339dccfba0db62df7541920759203bc9` |
| AgentFuse archive SHA-256 | `1659d81d39aab382d550c33c3b6a42b24254f584055eb15d8168f17200e323c3` |
| MAF core wheel SHA-256 published by PyPI | `75958ff692a38bf0c627aaa910bae6c4a89569dfec68e1e79eac8e206d88874d` |

Core and provider packages release independently: there is no provider package 1.17.0. The actual current provider version 1.14.2 declares core >=1.17.0,<2. Both installed versions are pinned.

The installed core source files were read and compared byte-for-byte with the official release commit. Their SHA-256 values are enforced by [qualification.py](../../python/kerniq_microsoft_agent_framework/qualification.py) at admission and retained in the receipt. The canonical AgentFuse archive was verified against the existing [runtime manifest](../../apps/desktop/src-tauri/resources/python-runtime-manifest.json); its runtime guard, evidence module and package metadata bytes are additionally checked before the existing loader runs. The upstream framework was not patched.

These checks are version/source admission, not hostile-process attestation: arbitrary Python code with access to process memory can monkeypatch classes or call raw host functions. Such code is outside this boundary.

## Exact execution chain

The reviewed source is pinned, not inferred from middleware documentation:

1. [`_tools.py`, _auto_invoke_function, L1444 onward](https://github.com/microsoft/agent-framework/blob/4507512f95effaae4518d658e86e9afc0ccb4514/python/packages/core/agent_framework/_tools.py#L1444) resolves the requested function from the tool map. L1517 parses the function-call arguments; L1532 onward applies the input model and schema validation.
2. It constructs `FunctionInvocationContext` with the actual function, validated arguments, session and runtime kwargs, then sets native `call_id` and `function_call_occurrence_id` metadata (L1583–1601).
3. The final handler closes over the resolved tool and calls `tool.invoke(arguments=context_obj.arguments, context=context_obj, tool_call_id=call_id)` (L1610 onward).
4. [`FunctionMiddlewarePipeline.execute`, L1230 onward](https://github.com/microsoft/agent-framework/blob/4507512f95effaae4518d658e86e9afc0ccb4514/python/packages/core/agent_framework/_middleware.py#L1230) enters the middleware chain. Only advancing `call_next()` reaches the final handler. Returning a BLOCK result without that call does not invoke it.
5. [`FunctionTool.invoke`, L594 onward](https://github.com/microsoft/agent-framework/blob/4507512f95effaae4518d658e86e9afc0ccb4514/python/packages/core/agent_framework/_tools.py#L594) validates again, constructs effective call kwargs and invokes `_invoke_function` at L720/L773. [_invoke_function, L562](https://github.com/microsoft/agent-framework/blob/4507512f95effaae4518d658e86e9afc0ccb4514/python/packages/core/agent_framework/_tools.py#L562) calls the async function. The selected adapter path is async, not the synchronous `to_thread` branch.
6. The adapter's bound entry checks a task-local, single-use permit plus the actual function object and argument digest before calling the physical handler. The handler increments an in-memory counter and appends a marker line.

Thus middleware is pre-dispatch for this reviewed automatic local invocation path. No background function task is launched before the selected gate by this path. A configured continuation can be called repeatedly by other middleware in general; the public backend accepts no such additional middleware, and the entry permit also prevents a second physical entry.

The official delegation API is [`Agent.as_tool()`, _agents.py L605–724](https://github.com/microsoft/agent-framework/blob/4507512f95effaae4518d658e86e9afc0ccb4514/python/packages/core/agent_framework/_agents.py#L605). Its framework-owned wrapper runs B with streaming enabled and returns B's final response text. The proof uses this API directly; it does not implement a custom Python A-to-B wrapper.

## Minimal implementation and argument semantics

[backend.py](../../python/kerniq_microsoft_agent_framework/backend.py) constructs the agent, registered tool and gate together. The public task method accepts no run-level tools, middleware, approval replay, session resume or arbitrary kwargs. It rejects a different client class and client-level function/chat middleware. Trusted host-side `block` selects canonical AgentFuse denylist/allowlist fixtures; the model cannot select the policy. The middleware only interprets the canonical bound decision.

Each operation has fresh runtime/request identity. Before awaiting the decision, the gate reserves the one-operation slot. It rejects repeat requests, including retries using a new provider call ID in the same operation. AgentFuse's returned request ID, tool identity and argument hash must match. Old decisions cannot authorize new operations.

`context.arguments` is a **framework-validated effective snapshot**, not an exact model-request argument archive. Only a flat, bounded `value: str` is supported. Canonical JSON hashing uses sorted keys and compact separators with Python's default ASCII escaping. The same representation is used by canonical AgentFuse for this domain.

- requested_args: unknown; the receipt is not a retained/authenticated copy of the provider request.
- effective_args: digest observed at the decision seam.
- executed_args: digest computed at the bound physical-handler entry after MAF's second validation.
- decision_argument_binding: true, checked against canonical decision identity/hash.
- executed_argument_binding: true for the ALLOW entries; blocked calls have no executed arguments.
- exact model-request-to-tool-run provenance: **not proven**. Native call IDs are recorded, but they do not establish authenticated requester identity or exact raw argument provenance.

Mutation after a decision is detected at the bound entry. The permit is consumed before an await, tied to the invocation context and current asyncio task, and reset on all exits. A nested/inherited child task cannot use it. This does not authorize arbitrary downstream middleware: a malicious middleware that replaces raw Python functions is outside the admitted construction surface, not something this lane claims to sandbox.

## Real provider and physical observations

The provider route was `https://api.deepseek.com/v1` using the existing inherited `DEEPSEEK_API_KEY`; requested model `deepseek-v4-flash`. Only synthetic marker prompts were sent. The official MAF client made the requests with automatic HTTP retries disabled, a 60-second request timeout, a four-iteration model budget and one function call per agent. No mocked response or manually fabricated FunctionInvocationContext was used in these four runs.

The qualification-only probe first established that a real model emits a tool call and a skipped continuation leaves the marker absent. That preliminary probe was not counted as AgentFuse governance proof. The retained four cases are subsequent full AgentFuse runs. A first full attempt reached an Evidence observation-status mismatch; the mapper was corrected to the existing `not_applicable` vocabulary, with no schema change, and all four cases were rerun on the final path.

The physical handler's first operation increments a closure counter. It then appends one JSON line to a fresh temporary file and returns a fixed result token. The runner independently checks counter, file existence, line count and contents before removing the temporary directory. The committed receipt preserves the observations and digest, not a permanent copy of the temporary file.

| Case | Native protected tool call ID | Decision | Body entries | Physical marker | Evidence outcome |
| --- | --- | --- | ---: | --- | --- |
| single_block | `call_00_qBiqwDvndvpns2v1gdLR4235` | BLOCK | 0 | absent | not_executed |
| single_allow | `call_00_UD8za0LK7RktNskgQIH00486` | ALLOW | 1 | present, 1 line | success |
| delegated_block | `call_00_uvDlOwyDwH7LlqaYXiZ12760` | BLOCK | 0 | absent | not_executed |
| delegated_allow | `call_00_JO6SK9pjJKMR5ne8vuY42181` | ALLOW | 1 | present, 1 line | success |

Both ALLOW marker files have SHA-256 `8dde1dbe735ba391344d20dade86d21ed23615f432449a1181810523d7655be9`, because each isolated run writes the same deterministic single line. They are separate executions with different native call IDs.

The event sequence is `request → decision → release → dispatch → start → completion → closed` for ALLOW. For BLOCK it is `request → decision → blocked → closed`, without release, dispatch or start. Dispatch here means release to the reviewed MAF continuation; start is the bound local-handler entry. Physical file success is established by the separate file check, not by dispatch or by model text.

No universal exactly-once guarantee is claimed. The observed count is exactly one in each ALLOW case, with a one-operation reservation and single-use release. Crashes, restarts, durable replay, distributed retries and arbitrary external handler entry are excluded.

## Multi-agent proof and attribution

The live path was A's real model → official B.as_tool function → B's real model → protected local function → the same AgentFuse gate.

For delegated BLOCK, parent call `call_00_HH9EHIgwRfwzOG9JanvC9041` enclosed protected child call `call_00_uvDlOwyDwH7LlqaYXiZ12760`. For delegated ALLOW, parent call `call_00_SIwN9GKEKTIgH5gCwkfv6984` enclosed protected child call `call_00_JO6SK9pjJKMR5ne8vuY42181`.

The delegation observer records native parent call start/return, scopes its correlation through a ContextVar while the framework-owned wrapper awaits B, and records B's returned result digest/token. The receipt proves the expected result token was present at the parent tool return and in A's final response. The observer itself does not evaluate policy or claim the delegation tool is governed.

Host-configured agent labels are `kerniq-maf-parent` and `kerniq-maf-child`; they are not authenticated agent principals. The parent/child link is a local runtime observation of the selected official call stack. No authorization attribution, durable causal lineage or identity trust claim is made.

## Runtime bypass audit

| Surface | Finding in reviewed runtime | Bounded treatment |
| --- | --- | --- |
| Direct FunctionTool.invoke / __call__ | Direct invoke is not the automatic middleware path; see _tools.py L533–805 | General direct calls EXCLUDED. The adapter-created bound entry additionally refuses a missing/stale permit; tested |
| Alternate Agent API / RawAgent / raw client | Normal framework APIs permit different construction and run paths | EXCLUDED from capability; only this backend's constructed Agent.run path admitted |
| Run-level tool injection | Agent middleware layer selects/normalizes run tools before invocation | No tools/options/kwargs input surface on start_task; caller-constructed agents EXCLUDED |
| Middleware ordering | Client middleware precedes runtime middleware in _tools.py L3223–3236 | Extra client chat/function middleware rejected; no external per-run middleware accepted |
| Agent vs per-run middleware | Agent forwards function middleware; run overrides are generally available | Backend constructs exactly one gate; arbitrary external ordering EXCLUDED; synthetic ordering/skip/double-next tests cover defensive entry checks |
| Tool replacement/redirection | Final closure invokes its resolved tool, not an arbitrary replacement context.function | Exact registered object/name/func/input-model/schema/invoke method checked; replacements before release rejected; hostile in-process monkeypatching EXCLUDED |
| Nested tools | A handler can call other Python code or tools | No transitive governance claim; permit cannot authorize another protected entry |
| Exception fallback | Ordinary tool exceptions become result errors; MiddlewareFailure propagates through _auto_invoke_function | Governance/binding failures use MiddlewareFailure; no alternate downstream execution; physical ALLOW+failure remains ALLOW/failure |
| Async concurrency | _try_execute_function_calls uses asyncio.gather (_tools.py L1874) | Independent operation state, reservation before await, task-local permit; simultaneous same-operation duplicate refused |
| Retry / re-execution | Model loop and other middleware can request more executions | One native operation slot; repeated/new IDs in same operation refused; provider retries disabled in proof; durable exactly-once EXCLUDED |
| Hosted / built-in / provider-side tools | They need not enter this local FunctionTool body; hosted/declaration paths handled separately | EXCLUDED; no physical-control claim |
| MCP | _mcp.py L246–268 creates a local forwarding callable that invokes remote call_tool | EXCLUDED; blocking a local proxy is not proof of remote execution control |
| Agent-as-tool | Official _agents.py L605–724 creates and runs the child wrapper | Official delegation path proven, **only B's protected local function governed**; generic handoff/workflow graph EXCLUDED |
| Approval / resume | Native approval and replay paths have separate identities and handling | EXCLUDED; no approval objects synthesized, no authorization upgrade |

The relevant general framework bypasses are not silently classified GOVERNED. Under the admitted closed construction surface, the real BLOCK runs show no physical body entry and there is no reviewed alternate dispatch after the gate refuses continuation. This is a cooperative in-process runtime boundary, not protection against arbitrary trusted host code deliberately bypassing the adapter.

## Evidence v0.2 mapping

[evidence.py](../../python/kerniq_microsoft_agent_framework/evidence.py) only projects closed invocation records and immediately runs the existing conformance validator.

| Meaning | Frozen representation |
| --- | --- |
| Request | local request identity plus native call/occurrence IDs; identity_provenance unknown |
| AgentFuse decision | known allow/block, canonical evidence record ID, policy ID, bound effective target and observed decision time |
| Authorization | unknown; a policy decision is not a human authorization |
| Requested arguments | unknown |
| Effective / executed arguments | independently observed digests; blocked executed binding is not_applicable with a non-execution reason |
| Release / dispatch / start / completion | separate occurred flags and occurrence timestamps; absent stages have occurred=false and at=null, based on the closed invocation |
| BLOCKED semantic | decision=block, outcome.status=not_executed, reason=agentfuse_policy_block |
| SUCCEEDED semantic | decision=allow, outcome.status=success |
| FAILED semantic | decision=allow, outcome.status=failure after observed physical handler entry |
| Cancelled handler | decision=allow, outcome.status=cancelled, entry retained |

The frozen schema has no literal BLOCKED/SUCCEEDED/FAILED enum strings. Those human semantic labels map to the existing values above. In particular BLOCK is not encoded as execution_success=false or tool failure. No schema extension was necessary.

Projection, source digests and local observation references do not establish runtime trust, authenticated identity, authorization, or arbitrary physical side effects. The file observation proves only the deterministic marker effect of this tool in these runs.

## Reproduction and tests

Use an isolated Python environment and the existing pinned AgentFuse source archive from the repository runtime manifest. Verify its published SHA-256 before extraction; the adapter then checks its selected source files. No global configuration or credential files are needed.

From the repository root:

```sh
python3 -m venv /tmp/kerniq-maf-v0-8-env
/tmp/kerniq-maf-v0-8-env/bin/python -m pip install -r python/kerniq_microsoft_agent_framework/requirements.txt pytest==9.1.1 pytest-asyncio==1.4.0
export PYTHONPATH=.:python
export KERNIQ_AGENTFUSE_SOURCE=/path/to/verified/dhms-engine-ec4b5842339dccfba0db62df7541920759203bc9
/tmp/kerniq-maf-v0-8-env/bin/python -m pytest -q python/kerniq_microsoft_agent_framework/tests python/kerniq_evidence_conformance python/kerniq_agentfuse_bridge python/kerniq_evidence_projection python/kerniq_external_validation
/tmp/kerniq-maf-v0-8-env/bin/python -m kerniq_microsoft_agent_framework.proof --agentfuse-source "$KERNIQ_AGENTFUSE_SOURCE" --output /tmp/kerniq-maf-live-proof.json
```

The live command requires an already-provided DEEPSEEK_API_KEY in the process environment. It sends only the synthetic fixed proof prompts. Unit tests do not make network requests. In an environment without optional MAF dependencies or the pinned AgentFuse source, lane tests explicitly skip; **the recorded qualified test run had no skips**.

Validation results: **31 new focused tests + 243 existing regression tests = 274 passed** in the combined run. New coverage includes installed-framework validation/pipeline behavior, physical BLOCK/ALLOW, decision-before-entry, ALLOW+handler failure, canonical policy exception, post-decision mutation, canonical decision identity/hash mismatch, direct invocation exclusion, tool replacement, repeated request/new-ID retry rejection, double continuation, swallowed continuation, concurrency isolation, task inheritance, cancellation, closed-evidence admission, source tamper and client middleware/injection admission.

Four final real-provider runs passed independently of those synthetic tests. Existing DSH and LangChain Python projections, AgentFuse bridge and Evidence v0.2 conformance passed unchanged. This is not a fresh DSH live runtime rerun. No TypeScript/Desktop workspace was modified, so pnpm tests were not required for this Python-only slice.

## Claim limits and recommendation

- Supported: official pinned MAF Python, one adapter-created local async string-argument FunctionTool per operation, real Agent.run model invocation, canonical AgentFuse pre-dispatch decision and bound physical entry; also the same protected tool under official A → B.as_tool → local tool delegation.
- Excluded: all-tool support, Semantic Kernel, AutoGen, Azure Foundry hosted tools, MCP/remote execution, hosted search, code interpreter, provider-side execution control, arbitrary injected tools/middleware, direct raw host function calls, generic handoff/workflows, restart/resume/durable exactly-once, authenticated delegation attribution and desktop provider UX.
- Architecture change required: false. The lane adds a bounded Python adapter, not a replacement governance protocol, evidence schema or task/ledger system.
- Recommendation: **MERGE_CANDIDATE**, subject to review. Do not merge automatically, outreach, or add a second framework.

## Machine conclusions

Commit and PR identifiers are publication results supplied by the final delivery receipt, not self-referential hashes inside this report.

```text
BASE_MAIN_HEAD=8b9d1bb0b0acf9eeecd7826a08668bb84bb80bee
BRANCH=feat/kerniq-microsoft-agent-framework-governance-v0-8
MAF_PACKAGE=agent-framework-core
MAF_VERSION=1.17.0
MAF_UPSTREAM_REF=4507512f95effaae4518d658e86e9afc0ccb4514
REAL_MICROSOFT_AGENT_FRAMEWORK_RUNTIME=true
REAL_MODEL_TOOL_CALL=true
REAL_LOCAL_FUNCTION_TOOL=true
QUALIFIED_FUNCTION_MIDDLEWARE=true
REAL_PRE_DISPATCH_SEAM=true
AGENTFUSE_DECISION_BEFORE_DISPATCH=true
BLOCK_DECISION_PROVEN=true
BLOCK_NON_EXECUTION_PROVEN=true
ALLOW_DECISION_PROVEN=true
ALLOW_EXECUTION_PROVEN=true
PHYSICAL_SIDE_EFFECT_BLOCKED_PROVEN=true
PHYSICAL_SIDE_EFFECT_ALLOW_PROVEN=true
DECISION_OUTCOME_SEPARATED=true
DECISION_ARGUMENT_BINDING_PROVEN=true
EXECUTED_ARGUMENT_BINDING_PROVEN=true
MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN=false
REAL_MULTI_AGENT_DELEGATION=true
MAF_SINGLE_AGENT_GOVERNANCE_PROVEN=true
MAF_MULTI_AGENT_GOVERNANCE_PROVEN=true
SUPPORTED_GOVERNED_BOUNDARY=PINNED_MAF_BACKEND_LOCAL_ASYNC_FUNCTION_TOOL_VALUE_STRING
EXCLUDED_TOOL_TYPES=HOSTED,MCP,PROVIDER_SIDE,ARBITRARY_INJECTED,NESTED_UNREGISTERED,DIRECT_RAW_HOST_CALLS
CAPABILITY_CLASSIFICATION=GOVERNED
EVIDENCE_V0_2_MAPPING_VALID=true
EXISTING_DSH_GOVERNANCE_REGRESSION=false
EXISTING_LANGCHAIN_TRACK_REGRESSION=false
ARCHITECTURE_CHANGE_REQUIRED=false
STOP_CONDITION_TRIGGERED=false
FOCUSED_TESTS=31_PASSED
REGRESSION_TESTS=243_PASSED
REPORT_PATH=docs/development/kerniq_microsoft_agent_framework_governance_proof_v0_8.md
TRUTH_BOUNDARY_PRESERVED=true
MICROSOFT_AGENT_FRAMEWORK_FULLY_SUPPORTED=false
ALL_MAF_TOOLS_GOVERNED=false
HOSTED_TOOLS_GOVERNED=false
MCP_GOVERNED=false
PROVIDER_SIDE_EXECUTION_GOVERNED=false
GENERIC_MICROSOFT_AGENT_GOVERNANCE=false
FINAL_RECOMMENDATION=MERGE_CANDIDATE
FINAL_STATUS=BOUNDED_REAL_SINGLE_AND_MULTI_AGENT_GOVERNANCE_PROVEN
```
