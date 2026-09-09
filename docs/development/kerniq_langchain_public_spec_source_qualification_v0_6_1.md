# KerniQ LangChain Public-Spec Source Qualification v0.6.1

## 1. Executive Decision

**GO_TO_LANGCHAIN_PROFILE_FREEZE**，仅针对本文完整限定的、已有原生归档的 **OBSERVED runtime-tool-request / successful-return profile**，提交独立 review/freeze，不授权实现。公开契约、固定发布源码和已冻结内部真实 capture 的结构化子集共同支持这一候选；不需要先取得外部伙伴样本才能定义格式语义。任何未来外部 source 仍须单独验证，不因符合版本字符串就合格。

不能得到的结论同样明确：`on_tool_start` 没有模型 tool-call ID，不能仅凭共同祖先或相邻事件证明任意 model request 到 tool start 的关联。成功终态可以提供额外的 ID 桥接，但不是每条路径都有该终态。本文选择较弱的 runtime invocation request，不把它称为原始模型意图。

`PUBLIC_SPEC_ONLY_PROFILE_FEASIBLE=true` 中的 public-spec-only 按本任务定义，包含官方公开的 pinned implementation 与内部真实 regression reference；**不表示只读 API 文档即可，或已有外部用户验证**。七项 gates 在这个有限的 contract-review 层面通过，外部 sample 层面尚未通过/尚未执行。`PROFILE_FREEZE_READY=true` 不等于 `PROFILE_FROZEN=true`。

LangChain 现在是 first profile candidate；PraisonAI 保留为后续 second source / partner candidate。此为本次获授权的候选顺序与资格层次细化，不追溯修改已合并 v0.6 design 的历史状态。

## 2. Scope

- 只读审查 Python LangChain `create_agent`、Core 原生 `astream_events(version="v2")`、配套 ToolNode、序列化及既有 capture；不执行 agent、模型或工具。
- 选择 ONE 输入表示：已有、未过滤的 v2 native event stream，使用官方 Core `dump.dumps` 存为 UTF-8 JSONL。不是任意 LangChain trace，不接受手工重构事件。
- 首个候选仅接受一个 root invocation、一个可识别的普通工具 runnable start 与一个结构化成功 tool end。工具名称、参数、结果和所有 run/call IDs 来自输入，不固定实验值。
- 排除 raw/custom LangGraph、nested/subagents、MCP/provider-hosted tools、checkpoint replay/resume、工具 middleware 重试/短路、定制 BaseTool lifecycle override、注入参数工具及 Command-returning tools。不是保证这些生态不能支持，而是本 profile 不审查它们。
- 不改 v0.3.3.3 Runtime Integrity、Evidence v0.2、validator、v0.5.2 projector、capture、README 或已合并设计。无 helper、parser、CLI、adapter、新依赖或新测试。

## 3. Reviewed Baseline

审查日期：**2026-09-09，Asia/Shanghai**。fetch 后 `HEAD=origin/main=1c1e23720faa48133d177917ef2911316444b433`，工作树干净，无 main drift。从该提交创建 `docs/kerniq-langchain-public-spec-qualification-v0-6-1`。

实际读取的仓库依据：

- [v0.6 design](kerniq_external_validation_pilot_v0_6_design.md)：source qualification 先于 profile freeze、implementation 与 pilot outreach；本次获授权审查 public contract，不发送请求。
- [v0.5.2 freeze](kerniq_evidence_projection_v0_5_2_freeze.md)、[limited proof](kerniq_evidence_projection_langchain_limited_v0_5_2_proof.md)、[F-01 disposition](kerniq_langchain_f01_limited_profile_review_v0_5_1.md)。
- [Evidence MVP spec](kerniq_evidence_schema_v0_2_mvp_spec.md)、[conformance proof](kerniq_evidence_schema_v0_2_conformance_proof.md)、[projection boundary](kerniq_evidence_runtime_projection_boundary_review.md)。
- [旧 profile](../../python/kerniq_evidence_projection/langchain_profile.py)、[旧 projector](../../python/kerniq_evidence_projection/langchain_projector.py) 及 [immutable bundle](../../experiments/langchain-proof-v0-5-1/engineering-source-bundle/manifest.json)。

本次只读重新核对了 manifest 根摘要、11 个 payload 的长度/摘要、53 条 raw events，及 L21/L25/L26/L27 的 ID/parent 关联。根摘要为 `8e763aab1108e1d8ecadde86cb7ad41b6f350ed6f21e145513dff4aac7ed6f4e`；raw 为 `4ec86fd2a3ba09f98f4b456defd660d86d1bde64019b058e15080dea59c6b0fc`。这些是历史 regression 制品身份，**不是候选 external profile 的准入常量**。

旧 proof 的 99 tests 为历史结果，本次未重跑 projector/conformance/product tests，没有新 Evidence 输出。源码以文本/AST 只读检查，官方 wheel 在内存读取并核对 PyPI SHA-256；未安装或导入 LangChain。摘要自洽不证明历史操作者身份或现场真实性。

## 4. Official LangChain Sources

以下 S 编号用于后文定位依据。官方 API reference 为 rolling 页面，仅作为文档依据；冻结语义以表内 package releases 与精确 Git source 为准。网页文档读取包含公开的参数、事件表与类型说明，不把表中的示例当真实 source。

| 编号 | 官方依据 | 本次审查用途 |
| --- | --- | --- |
| S1 | [Runnable.astream_events API](https://reference.langchain.com/python/langchain-core/runnables/base/Runnable/astream_events)、[BaseStreamEvent API](https://reference.langchain.com/python/langchain-core/runnables/schema/BaseStreamEvent) | 公开 v2 event/run/parent/filter 契约；v3 不在候选内 |
| S2 | [Core 1.6.2 event schema](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/runnables/schema.py) | EventData、Base/Standard/CustomStreamEvent、StreamEvent union |
| S3 | [Core 1.6.2 event streamer](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/tracers/event_stream.py) | `_get_parent_ids` L146；model end L488；tool start/error/end L654-748；v2 consumer L1018-1101 |
| S4 | [Core 1.6.2 BaseTool](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/tools/base.py) | run/arun 的 callback、输入验证、调用、异常与返回顺序；`_prep_run_args`、`_format_output` |
| S5 | [ToolMessage](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/messages/tool.py)、[AIMessage](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/messages/ai.py) | 原生 tool_call_id、typed status、内容/模型调用表示 |
| S6 | [LangChain 1.4.0 create_agent](https://github.com/langchain-ai/langchain/blob/79cab2dc7f58be720cac43db3677b4c1fd971f91/libs/langchain_v1/langchain/agents/factory.py) | ToolNode import、middleware wiring、pending calls 与 Send 路径 |
| S7 | [prebuilt 1.1.0 ToolNode](https://github.com/langchain-ai/langgraph/blob/3614e88c58af63f597764218646e85c49952b2da/libs/prebuilt/langgraph/prebuilt/tool_node.py) | `_afunc`、`_arun_one`、`_execute_tool_async`、input parsing；合成结果与多次 execute 边界 |
| S8 | [LangGraph 1.2.11 Pregel](https://github.com/langchain-ai/langgraph/blob/644815f9e5bc52ad8f7a5227a456227e9c3e639b/libs/langgraph/langgraph/pregel/main.py)、[Core Runnable](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/runnables/base.py) | v2 委托 Core 实现，不能把 v3/其他 stream mode 等同 v2 |
| S9 | [dump](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/dump.py)、[_validation](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/_validation.py)、[serializable](https://github.com/langchain-ai/langchain/blob/8215039dea978372bd3fd95b88663a11b0159043/libs/core/langchain_core/load/serializable.py) | constructor/escaped data 区别、unsupported fallback、不得把 repr 当结构 |
| S10 | [upstream #37426](https://github.com/langchain-ai/langchain/issues/37426) | tool-call ID 缺口的调查入口；不是 normative proof。是否修复以 S3 固定源码判定 |

没有使用第三方教程作为规范依据，也没有在 upstream 发 issue/comment。

## 5. Version Pinning

本次实际查询官方 PyPI release JSON，排除 prerelease/yanked，核验到以下最新稳定发布；不是从旧 capture 推断当前版本。

| Package | Reviewed stable | 发布时间 UTC | Release / exact Git ref |
| --- | --- | --- | --- |
| langchain | 1.4.0 | 2026-09-03 | [PyPI JSON](https://pypi.org/pypi/langchain/1.4.0/json)；tag `langchain==1.4.0` -> `79cab2dc7f58be720cac43db3677b4c1fd971f91` |
| langchain-core | 1.6.2 | 2026-09-04 | [PyPI JSON](https://pypi.org/pypi/langchain-core/1.6.2/json)；tag `langchain-core==1.6.2` -> `8215039dea978372bd3fd95b88663a11b0159043` |
| langgraph | 1.2.11 | 2026-08-11 | [PyPI JSON](https://pypi.org/pypi/langgraph/1.2.11/json)；tag `1.2.11` -> `644815f9e5bc52ad8f7a5227a456227e9c3e639b` |
| langgraph-prebuilt | 1.1.0 | 2026-05-12 | [PyPI JSON](https://pypi.org/pypi/langgraph-prebuilt/1.1.0/json)；tag `prebuilt==1.1.0` -> `3614e88c58af63f597764218646e85c49952b2da` |

发布依赖允许这个组合：LangChain 要求 Core >=1.6.0,<2 与 LangGraph >=1.2.11,<1.3；LangGraph 要求 prebuilt >=1.1.0,<1.2。依赖范围允许不等于本次进行了整套安装/兼容性运行。候选只固定表中精确组合，不接受 `latest` 或“所有 1.x”。Python/serializer 辅助依赖版本及 producer/exporter identity 必须随来源记录；首轮采用已有 regression 的 CPython 3.11.15 / Pydantic 2.13.5 表示背景，其他环境另行资格审查，不作跨环境 runtime 保证。

旧 capture 使用 Core **1.6.1**，其 tag 指向 `4fe9d3062f4b68e2e472eb92decf369c93aebb46`。本次比较官方 1.6.1/1.6.2 wheels，下列七个文件字节完全一致：`tracers/event_stream.py`、`runnables/schema.py`、`tools/base.py`、`messages/tool.py`、`load/dump.py`、`load/serializable.py`、`load/_validation.py`。因此旧成功事件子集可以作为所选契约的 regression reference；**不据此声称全部依赖或整个 1.6.2 runtime 已实测**。

核验的 Core wheel SHA-256：1.6.1 `954a84132a5cb0435d27b910e336347b6744ecc18fbeef1e2de7029a0959841a`；1.6.2 `21e6c7cf097c68b777fd69ea00864f09bd9ca76ac73e3e3fa14e1ee366eb4711`。相关 Git/wheel 文件也核对一致。版本与源码差异核对是 contract qualification，不给外部机器签发 runtime trust。

## 6. Public Event Contract

分类可同时含公共契约和版本依赖；“implementation detail”可用于固定版本审查，但不是跨版本承诺。

| 字段/事件 | 分类 | 可用语义与限制 |
| --- | --- | --- |
| StreamEvent | NORMATIVE_PUBLIC_CONTRACT | StandardStreamEvent 与 CustomStreamEvent 的 union；自定义同名记录不能自动成为工具事实，S2 |
| event / name | NORMATIVE_PUBLIC_CONTRACT | 事件种类与 runnable 显示名称；name 非全局工具身份，S1/S2 |
| run_id | NORMATIVE_PUBLIC_CONTRACT | runnable invocation ID，不能改名成 model tool_call_id，S1/S2 |
| parent_ids | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | v2 从 root 到直接 parent 的有序祖先链；不表示模型 call 因果边，S2/S3 |
| tags / metadata | NORMATIVE_PUBLIC_CONTRACT | 类型声明为可选；标准 emitter 给默认空值。可由调用者/config 注入，不是 authentication/authorization，S2/S3 |
| data | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | 事件相关 payload；含 Python 对象，不是原生 JSONL wire format，S1/S2/S9 |
| on_chat_model_start | NORMATIVE_PUBLIC_CONTRACT | 模型调用输入/messages，不是模型已提出工具请求，S1/S3 |
| on_chat_model_stream | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | chunk 观察，不自行拼接/猜测最终 ToolCall；provider 表示仍有限定，S1/S3 |
| on_chat_model_end | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | S3 `on_llm_end` 在 chat 路径选取 generation.message；完整 typed tool_calls 才可读为模型请求，非任意 output 文本 |
| on_tool_start | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | S3 发出 `data.input=inputs or {}`；S4 inputs 已过滤 injected args，且在 schema validation 和工具 body 之前 |
| on_tool_end | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | S3 包含 output 与缓存的 input；S4 可产生成功或已处理错误返回，不能只按 end 名称映射 success |
| on_tool_error | IMPLEMENTATION_DETAIL + VERSION_DEPENDENT | S3 明确实现，公共示例的 start/stream/end 表不是完整 error 契约；data.error 为 BaseException 对象，不能假定 JSON-ready |
| on_chain_start/end | NORMATIVE_PUBLIC_CONTRACT + VERSION_DEPENDENT | 只用 root/run 归属与 capture 覆盖边界，不将 chain end 代替 tool completion |
| physical entry / authorization / executed args / exact execution timestamp | NOT_AVAILABLE | 这些事实不由上述事件名、receipt 时间或 metadata 自动提供 |

S3 的 v2 implementation 内部安装自己的 callback handler 并驱动 `runnable.astream`；这不是被动读取已经运行的应用。终止 consumer 可取消运行 task，工具取消不保证有 terminal event。另有首事件 input 重写逻辑：**过滤到只剩 tools 时，首个 tool event 的 input 有被 root input 覆盖的风险**。本候选因此要求原 capture 未设置 include/exclude filters，并保留第一条 root start；不是建议现在重写采集器。

## 7. Identity Model

| 标识 | 含义 | Profile 处理 |
| --- | --- | --- |
| MODEL_TOOL_CALL_ID | AIMessage ToolCall 的原生 `id` | 不从 run_id 合成；本弱 profile 不默认取得模型来源 |
| LANGCHAIN_RUN_ID | 任意 runnable 的 `run_id` | 带 archive/root 命名空间使用，不作全局身份 |
| TOOL_RUN_ID | `on_tool_*` 对应工具 runnable 的 run_id | Level A 分组键；记录的是 runtime invocation，而非物理 attempt 次数 |
| PARENT_RUN_ID | parent_ids 最末项 | runnable containment；整个 parent_ids 需在 start/end 一致 |
| ToolMessage.tool_call_id | 返回对象声称对应的工具 call | typed 且非空时保留，不证明 caller 是人或模型已批准 |

S3 L654-748 的固定版本结果：

```text
MODEL_TOOL_CALL_ID_ON_TOOL_START=UNAVAILABLE
MODEL_TOOL_CALL_ID_ON_TOOL_END=AVAILABLE
MODEL_TOOL_CALL_ID_ON_TOOL_ERROR=AVAILABLE
```

AVAILABLE 是**受支持字段路径存在**，不是无条件非空：end 的路径是 `data.output` 中 ToolMessage 的 `tool_call_id`，不是 `data.tool_call_id`；普通 raw output/Command/list 不保证提供。error 的路径是 `data.tool_call_id`，可为 null。start 内部 run_info 虽保存 ID，**输出 payload 没有它**，不能读取私有内存来补充 source。caller 手工写入 metadata 的 ID 不替代该缺口。[#37426](https://github.com/langchain-ai/langchain/issues/37426) 与此源码结果一致，但 issue 不是判定修复状态的唯一依据。

## 8. Tool Lifecycle Correlation

**LEVEL A: TOOL_RUN_LIFECYCLE_CORRELATION_PROVEN=true**，指已核验公开 ID 语义及固定 emitter 的 start/end/error 关联，不是 exactly-once execution。

S3 按 run_id 保存 start 信息，end/error 按同一 run_id 取出该信息，返回同一祖先链。离线候选要求：同一 source/root、相同非空 tool run_id、相同有序 parent_ids、start 在 terminal 之前，且一个 start 仅有一个 terminal。name 一致只做冲突检查，不作为配对键。不得使用参数相等、时间相近或文件相邻来补齐 ID。

重复 start、多个 terminal（包括相同内容重复事件）、跨 root、ID 冲突、parent chain 冲突一律拒绝该组，不做 last-write-wins 或把一次 retry 拼成一次成功。重新读取同一不可变 archive 不算新 native event；不同 run ID 的重试不合并。首版单工具 run 限定意味着多个实际 tool runs 返回 unsupported，而不是从中挑一个“最像”的成功。

官方 emitter 支持 error 关联不等于所选 JSONL profile 已支持所有 error object。没有 terminal 或不可读 error payload 时，保留 incomplete/unknown，不推 failed、cancelled、blocked 或未执行。

## 9. Model Tool-Call Correlation

**LEVEL B: MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN=false**，精确定义为：不证明 v2 任意 model-issued ToolCall 到 `on_tool_start` 存在直接、普遍可用的结构化边。

S6 将 pending ToolCall 送入 ToolNode；S7 保留 call ID、构造 ToolRuntime、注入所需参数，再以 ToolCall 传给 BaseTool；S4 `_prep_run_args` 分离 id 与 args。内部执行路径拥有 call ID，不表示每个 emitted start event 暴露它。共同 root 是 containment，不是唯一 model-call 关联。

不得反向抹掉已有证据：在完整成功子集中，可以通过 `AIMessage.tool_calls[].id == ToolMessage.tool_call_id`，再经 end.run_id == start.run_id，**回溯关联**一个唯一无冲突候选；旧 L21/L27/L26 正是这种有限证据。`POST_TERMINAL_ID_BRIDGE_AVAILABLE=true`，但不是 start 时可用、不是缺失终态路径的保证。singleton tools-node input 也可在固定场景提供旁证，但不能仅因节点叫 tools 或共享 parent 就泛化。

S7 wrapper 的 execute callable 可被调用多次，也可短路；ToolMessage 可来自 wrapper、错误处理或工具自报。自定义图、middleware、replay 的普遍关联不在本任务证明范围。新候选不消费模型 chunk/Command 来完成 Level B，不把 false 扩大成“LangChain 从来不可关联”。

## 10. Request Semantics

| 候选 | 审查结论 |
| --- | --- |
| A: model ToolCall | 完整 typed model end 可证明模型请求，但到 start 的关联并非无条件可得；不作为此次弱 profile 必需来源 |
| B: on_tool_start.data.input | 选择；证明工具 runtime 的调用输入观察，S3/S4。不是 physical entry，也不是原始模型参数 |
| C: ToolMessage | 是结果与返回 call ID 来源，不从结果反造请求参数 |
| D: create_agent structured stream | 其他 stream modes 需要独立格式/关联审查；本次不混合 |

```text
REQUEST_SOURCE=on_tool_start.data.input_with_tool_run_id
REQUEST_SEMANTICS=RUNTIME_TOOL_REQUEST_OBSERVATION
CAPABILITY_CLASSIFICATION=OBSERVED
```

Evidence v0.2 的 RequestRecord 不强制请求者为模型或人，允许 runtime attempt 引用；无需新字段。候选以原 tool runnable invocation ID 的命名空间引用作为 `attempt_ref`，例如概念形式 `langchain-tool-run:<root_run_id>:<tool_run_id>`。这是**可回溯的 runtime invocation 引用**，不是创造 retry ordinal、模型 request ID 或物理 execution ID。`request_id=null`；`tool_call_id` 仅从同 run 的 typed terminal 保留。`runtime_ref` 固定 reviewed package 命名空间，`action_name` 是原显示名，版本化 `action_ref` 未知则 null。

requested snapshot 表示**该 runtime 请求边界暴露的公共输入**。由于 S4 会过滤 injected args，首版要求普通 JSON-object 参数工具、无 injected args/定制 lifecycle；不能验证该前提则不声称完整 snapshot。模型最初 requested、policy-effective 和 physically-executed snapshots 均不能据此补齐。profile_ref 与 lineage 必须明确此请求语义，禁止 reader 把所有 request 都解释为 MODEL_REQUEST。

## 11. Selected Source Representation

**选择 Path A：existing unfiltered v2 native stream archive / `lc-dumps-jsonl-v1`，限定结构化 tool-run 子集。** JSONL 是 archive packaging，不声称官方存在名为该 archive ID 的端到端导出产品。

producer 固定为 LangChain/Core/LangGraph/prebuilt 精确组合；serializer 为官方 `langchain_core.load.dump.dumps`，Core 1.6.2，默认 `pretty=false`、默认 JSON 参数，每次返回的一整个 JSON 对象原样保存为一行，加 LF、UTF-8。这是采用已有公开 serializer，不发明 canonical JSON。source digest 对原字节计算，不能把重新序列化后的字节称为原件。

必须保留：原 event/run/parent 顺序与类型、root start/end、所有 tool lifecycle records、版本和 exporter 身份/版本、原 invocation/capture 范围、过滤参数、结束/错误/缺口声明以及原始 raw。机器对象只按结构读取，不调用 `load.loads`、constructor 或任何源引用。metadata/tags 原地保留但不赋予身份/权限意义。

该表示有意不是全图 lossless。非必需 chain/model payload 中的 opaque Command 可留存并显式排除；任何被使用记录含 unsupported/escaped/不可识别类型则不能成为 known 字段来源。不得为迁就本 profile 删除原事件或修正旧 manifest。

拒绝其他路径：

- official structured trace/export（Path B 候选）：本次未审查到与上述 JSONL 等价、无需变换的固定导出契约；不把 LangSmith trace 或 cloud environment toggle 默认视为此 source。
- create_agent updates/messages/v3 stream（Path C 候选）：表示与边界不同，chunk/state update 不能混入 v2 lifecycle；v3 不在此 pin。
- tools-only filtered v2：S3 first-event input 重写风险，缺少完整 root 边界，拒绝作为本候选输入。

## 12. SDK-Free Assessment

**SDK_FREE_GATE=PASS 仅针对既有 archive 输入类，不是所有 LangChain 用户可零改动采集的声明。**

| 用户现状 | 判定 |
| --- | --- |
| 已有符合本契约的原生 archive，且版本/采集范围可核对 | 离线读取无需改业务代码、tool/core 或安装 KerniQ SDK；本轮选定用户类 |
| 只有最终回答、LangSmith span 导出或不兼容 JSON | 不合格；不能声称换扩展名即可支持 |
| 只有 agent.invoke，需要改主流程才能消费 astream_events | 不自动满足 SDK-free；该获取路径 FAIL/未授权，不把调用公共 API 等同已有 export |
| 已有安全独立 runner 能调用原 agent 但没有 archive | 新增 consumer/capture 属于 design Path B，需单独获准并审核副作用、取消和序列化；本次不纳入 |
| 必须逐 tool wrapper、手工 metadata、继承 KerniQ 类型 | FAIL |

`BUSINESS_CODE_CHANGE_REQUIRED=false`、`CAPTURE_HELPER_REQUIRED=false` 仅表示**本次既有文件 profile 不要求改动或创建 helper**，不表示一个不存在的外部 archive 已被找到。现有团队 capture 是自建实验入口，不能证明他人的应用无需改动。若候选用户没有所需 archive，应停止该用户路径、另行评估来源；不在实现阶段偷偷加入 helper。

Core 内部为原生 stream 配置自身 callback（S3），与 KerniQ 注入 callback 是两回事。本文既不添加 observer，也不改变运行中的 agent。

## 13. Legacy v0.5.2 Pin Decomposition

只读检查旧 profile/projector 后得到以下清单。**不移除旧 pins，不改旧代码；新文档定义独立候选。**

| 旧 pin / guard | 类别 | 新候选的合法替换或保留 |
| --- | --- | --- |
| SOURCE_COMMIT、BUNDLE_DIR、manifest/raw 固定 SHA | BUNDLE_SPECIFIC_PIN | 变为每份获权 source 的原字节摘要与 producer/provenance 引用，不比较团队常量 |
| raw 恰好 53 行、L21/L25/L26/L27/L29 | BUNDLE_SPECIFIC_PIN | 按类型/ID/root 结构定位，记录实际 offset；不靠固定行号 |
| ROOT_RUN_ID、TOOL_RUN_ID | RUN_SPECIFIC_PIN | 动态非空 ID、同一 archive/root、run equality 与 parent consistency 规则 |
| TOOL_CALL_ID 固定字符串 | CALL_SPECIFIC_PIN | 保留 terminal 自带 ID；仅在真实存在 ID 桥时建立额外关联，不从名称推导 |
| TOOL_NAME=add、请求 17/25、content=42 | CALL_SPECIFIC_PIN | 工具显示名动态读取；参数/内容不作为匹配常量。旧 projector 的结果 42 检查不能改名为通用结果语义 |
| manifest serialization id、runtime version | FORMAT_SPECIFIC_PIN | 精确 producer/version/serializer/JSONL contract，版本变化重新审查 |
| lc=1、constructor、ToolMessage id、kwargs.type=tool | FORMAT_SPECIFIC_PIN + SEMANTIC_PIN | 保留 typed-marker 检查；排除 escaped 用户字典冒充对象；不反射实例化 |
| opaque 固定 L22/L23/L50/L51 | BUNDLE_SPECIFIC_PIN | 按非必需事件类别及完整结构标记排除并报告实际位置，不按 repr 内容或固定行数判断 |
| 同 run/parent、不同结果冲突拒绝 | SEMANTIC_PIN | 保留；首版更明确要求唯一 start/terminal，不折叠 retry |
| 原模型 requested 来源 | SEMANTIC_PIN | 不直接继承；明确改为 runtime-tool-request，模型 provenance 保持未知 |
| `json-canonical-sorted-v1` 参数 digest | FORMAT_SPECIFIC_PIN | 首版仅 snapshot_ref，digest 可 null，避免重定义参数 canonicalization；原 source 的摘要另算 |
| typed status=success 的成功返回、start/auth 等 unknown | SEMANTIC_PIN | 保留源确认成功返回与 unknown 边界；不扩成执行/业务成功证明 |
| producer/profile_ref 与输出 ID 固定前缀 | Proof implementation identity | 新独立 profile namespace，不能假冒 native producer/run identity；本次不实现 |

## 14. Evidence v0.2 Mapping Matrix

下表是 profile 规则，不是本次生成的 Evidence。SOURCE_CONFIRMED 表示已观察的来源记录，不是 runtime attestation；DERIVED_FROM_REVIEWED_SEMANTICS 必须附字段路径/规则。模型事件与 callback 不自动提升执行强度。

| Evidence category | LangChain source | 分类 | 允许表达 |
| --- | --- | --- | --- |
| request identity | tool start run_id + root/parent chain | DERIVED_FROM_REVIEWED_SEMANTICS | request known；attempt_ref 为 runtime invocation 引用，不声称原模型 request |
| request ID | 无单独原生 request_id | UNKNOWN | request_id=null，不能拿行号或 run_id 填成模型请求 ID |
| tool_call_id | 同 run end 的 typed ToolMessage | SOURCE_CONFIRMED | 原 ID 保留；不声称 start 本身暴露 ID |
| caller identity | metadata/tags 无认证依据 | UNKNOWN | identity_provenance.source=unknown，subject/provenance refs=null |
| decision | 无 policy decision source | UNKNOWN | 不从成功调用推出 allow，也不把 error 推成 block |
| authorization reference | 无授权 receipt | UNKNOWN | 不从 tool_call_id 或运行成功推出 approval/ref；不是 not_applicable |
| requested arguments | start.data.input 的结构化公开输入 | SOURCE_CONFIRMED | runtime 请求 snapshot_ref；受第 10 节限制，digest=null 可接受 |
| effective arguments | 无 policy 后快照 | UNKNOWN | start/end input 相等不能证明 effective |
| executed arguments | 无物理入口快照 | UNKNOWN | 不从输入或结果反算 |
| scope / authorization_match | 无资源授权范围/目标 | UNKNOWN | root 归属仅用于关联，不能变成权限 scope 或 matched |
| release | 无准入放行 receipt | UNKNOWN | 不从 start 推导 |
| dispatch | 无本 profile 已审查的 dispatch receipt | UNKNOWN | 内部调用源码存在不等于该次 dispatch 观察 |
| start | on_tool_start 位于验证/body 之前 | UNKNOWN | callback 记录留在 lineage，不填 execution.start=true |
| completion | 唯一对应 on_tool_end + typed success output | DERIVED_FROM_REVIEWED_SEMANTICS | completion known/occurred=true/at=null，表示 runtime terminal settlement |
| outcome | 该 ToolMessage 显式 status=success | SOURCE_CONFIRMED | success = source-reported successful return，result_ref 指向原记录；内容值任意但结构受限 |
| error | on_tool_error.error 为对象或 typed status=error | REFUSED（首版 success-only 语义） | 报 unsupported/incomplete；不解析异常 repr，不伪造 success/failure；来源可留存 |
| correlation Level A | 同 root 下 start/end run_id 与 parent_ids | DERIVED_FROM_REVIEWED_SEMANTICS | 该 tool run 的观察关联，不声称 physical exactly-once |
| correlation Level B | 模型 ToolCall 到 start | UNKNOWN（本候选不承诺） | 可审查的终态 ID 桥仅作独立已标明的旁证，不补普遍 claim |
| physical side effect / runtime trust / pre-dispatch governance | 不存在对应 proof | REFUSED | 不写入已证明 claims |

OutcomeRecord 与 completion 定义沿用 MVP：成功返回不证明物理入口，completion 不倒推出 start；未观察阶段用 unknown，不用 occurred=false。snapshot_ref 可以指向原行的 JSON Pointer，避免新增 digest 标准；引用必须只读、不可执行。无新 schema 枚举、字段或 validator 特例。

## 15. F-01 Boundary

```text
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
```

S9 在未知对象上仍可生成 `lc=1/type=not_implemented/id/repr`；JSON 语法成功不是无损证明。旧四条 Command carrier L22/L23/L50/L51 保持不变，本次没有修复 recorder、改变 exit_status、补 diagnostics 或重算原 manifest。

新候选**避开对 opaque Command 的语义依赖，不声称消灭序列化问题**：只有完整结构化的 root 身份 envelope、tool start 和 typed success end 参与已知字段映射。非必需 chain/model 事件中的 Command carrier 按完整 marker 识别、整条排除于 known 字段来源并列出实际行号/理由；不得读 repr 值、重建 Command、猜路由或删除原行。若必要记录/关联依赖 opaque，拒绝，不扩排除规则来凑 PASS。

error 对象、Command tool result、未知 constructor、escaped 对象等若落在必需 tool records 内，首版拒绝。对 raw 做结构化检查而非相信 session=ok；collector 未披露的降级必须在 future validation diagnostics 明示，不能静默通过或称 full capture qualified。公开 contract qualification 不是为旧 capture 改判。

## 16. Qualification Gates

本次由任务明确允许区分 **contract qualification** 与 **external sample qualification**。下表 QGATE_* 的 PASS 是固定合同和内部真实 regression 的设计审查结论，不是已有外部材料全部 PASS；未来每份 source 必须重新检查相应实例条件。

| Gate | Contract review | 依据 / 外部实例边界 |
| --- | --- | --- |
| QGATE_1 Producer Identity | PASS | 官方发布/Git/serializer pins 已明确；外部 source 仍需版本/producer 资料，不能把声明作 authentication |
| QGATE_2 Native Source | PASS | 公开 native emitter + immutable 真实内部 capture 支持格式现实性；EXTERNAL_SOURCE_SAMPLE_QUALIFIED=false，未声称团队材料为 external |
| QGATE_3 Correlation | PASS | 仅 Level A，原生 run/parent 明确；不依赖 Level B、名称或相邻时间 |
| QGATE_4 Serialization | PASS | 所用结构化子集有真实依据，必要字段拒绝 unsupported；opaque 非必需 carrier 显式排除，非 lossless |
| QGATE_5 Evidence Mapping | PASS | runtime request、nullable refs、unknown stages 与源确认 return 可用原 MVP 表达；无新 schema/validator semantics |
| QGATE_6 SDK-Free | PASS | 只面向已持有指定原生 archive 的用户，无新 helper；无 archive 的用户不因本 PASS 自动满足条件 |
| QGATE_7 Privacy | PASS | 原件/validation local-only，无敏感 raw 上传必要条件；本次没有访问外部私有数据 |

```text
PUBLIC_SOURCE_CONTRACT_QUALIFIED=true
SOURCE_CONTRACT_QUALIFIED=true
SOURCE_SAMPLE_QUALIFIED=false
EXTERNAL_SOURCE_SAMPLE_QUALIFIED=false
```

不能将 QGATE_2 的合同层 PASS 当作 v0.6 原 sample 状态链已经完成，更不能补写 SOURCE_SAMPLE_RECEIVED 或 ARTIFACT_VERIFIED。任务允许 public contract 路线不等待 partner sample，不豁免未来外部 run 的 provenance/关联/隐私审查。

## 17. External Profile Candidate

以下为文档候选定义，**无 profile 代码、无正式 freeze 操作**。正式采纳前需要独立 review。后续验证实现只能执行这些规则，不能边写 parser 边改变语义。

| 项目 | 候选定义 |
| --- | --- |
| profile_id | `langchain-create-agent-tool-run-jsonl-v0.1` |
| profile_version | `0.1.0`，candidate，未发布 |
| producer / producer_version | LangChain 1.4.0 / Core 1.6.2 / LangGraph 1.2.11 / prebuilt 1.1.0；普通 create_agent 工具路径；第 5 节环境与来源记录要求 |
| source_representation | `lc-dumps-jsonl-v1`，existing unfiltered `astream_events(version="v2")` archive；UTF-8、LF、一 native event 对象/行、官方 dump.dumps 默认表示 |
| capture_contract | 原件只读；有 exporter identity/version、runtime/dependency 记录、原 invocation/config 与结束/异常/截断说明；无 include/exclude filters；不得手工补事件、修改业务/tool/core 来符合 profile |
| supported_event_types | root `on_chain_start/on_chain_end` 身份与范围、`on_tool_start/on_tool_end`；其他 events 留存/分类但无 known output mapping；on_tool_error 为不支持成功结算的诊断路径 |
| required_fields | event/name/run_id/parent_ids/data；root 唯一且首条为 root start；tool start.data.input 为支持的 JSON object；end.data.output 为下述 typed terminal；tags/metadata 可选且不作证明 |
| terminal shape | lc=1、type=constructor、id=[langchain,schema,messages,ToolMessage]；kwargs.type=tool、非空 tool_call_id、显式 status=success、name 与工具事件 name 一致；content 限 string 或 JSON list，不要求固定文本；artifact 若有必须可结构化解释为普通 JSON |
| data subset | string keys、null/bool/string/JSON arrays/objects、有限数值；拒绝重复 key、NaN/Infinity、非法 Unicode、未知 constructor 或必要数据中的 lc/__lc_escaped__ 语义歧义；不得调用原生 deserializer |
| correlation_rules | archive namespace + root_run_id + tool_run_id；有序 parent chain 一致、无自环/重复祖先；正好一个工具 start/end pair；拒绝跨 root、多个 run、重复事件和 terminal 冲突；不按 name/args/time 建关联 |
| request_semantics | runtime-tool-request observation；request_id=null，attempt_ref 引用原 runnable invocation；terminal call ID 保留但不自动声明模型来源；caller unknown |
| completion_semantics | 对应 typed success end 表示来源确认结算，at=null；不倒推出 physical start |
| outcome_semantics | 仅 source-reported successful return；未知/error/Command/list-of-ToolMessage terminal 不映射成功，不用结果内容推执行 |
| known_fields | runtime tool input snapshot、terminal tool-call ID、工具显示名、typed successful return |
| derived_fields | 带 source namespace 的 invocation reference、Level A correlation、terminal completion；伴随 lineage 明示规则和原始定位 |
| unknown_fields | 模型原始请求出处、可信 caller、decision、authorization、effective/executed args、scope/match、release/dispatch/start、原始 execution timestamp |
| refused_claims | GOVERNED、无隐藏执行、runtime trusted、physical side effect、exactly-once、成功即授权、普遍 model-to-start 关联、全量 lossless、external validation/adoption |
| truncation_rules | root 缺失/重复、无 root end、tool 无对应 terminal、stream error/cancel/缺行 -> incomplete/拒绝完整成功组；已有观察不等于未执行。禁止 EOF 当 completion；不宣称探测一切恶意删改 |
| serialization_failure_rules | essential records 含 unsupported/escaped/未知类型 -> refusal；只在已声明非必需 chain/model carrier 排除 opaque Command 并逐项诊断；不读 repr、不静默丢弃 |
| unsupported_version_rules | 非精确 producer/serializer pins、缺少版本/配置、其他 trace schema -> unsupported/pending，禁止 best-effort parser 或直接修改旧 profile pins |
| source_digest_representation | raw JSONL 的原始 UTF-8 字节 SHA-256（含原 LF），每份输入现场计算并记录，不比较团队摘要；来源 metadata/exporter/config 文件各自精确字节 SHA-256 与相对路径/长度在只读 provenance 清单绑定，禁止绝对路径、越界/联网解析 |

source digest representation 不定义 pilot artifact canonicalization；后者继续 `TO_BE_FROZEN_DURING_IMPLEMENTATION_PROOF`。本候选不要求参数 digest，允许原 MVP 的 snapshot_ref + digest=null。文件清单是审查/来源绑定记录，不是新治理协议，也不生成 grant。

必要型态拒绝时只出未来 source diagnostic，不产生一份伪装完整的成功 Evidence。首版未纳入的错误路径是显式 scope exclusion，不是把错误等同 unknown 后伪装所有 tool runs 均成功。正向 profile 的实测实现证明仍未开始。

## 18. Profile Freeze Decision

**EXTERNAL_SAMPLE_REQUIRED_FOR_PROFILE_FREEZE=false，仅限上述合同。** 三项依据同时具备：

1. 公开 v2 run/parent 与 typed ToolMessage contract 足以定义有限请求/终态字段，不以伙伴具体 ID/工具/结果定规则。
2. 当前稳定发布源码精确 pinned，tool start 缺 ID、输入预处理、错误、wrapper、序列化与取消限制已显式审查。
3. 内部真实 capture 的关键结构可只读验证；与当前 Core 相关七个文件字节一致，能支持成功子集的格式现实性。没有将其包装成新版本完整 runtime test 或外部验证。

因此 `PROFILE_FREEZE_READY=true` 表示**可进入独立 profile freeze review**。`PROFILE_FROZEN=false`、`PILOT_IMPLEMENTATION_AUTHORIZED=false`。若独立 review 不接受第 12 节已有 archive 用户类，或希望普遍新采集/错误路径/模型关联，则不是扩写当前实现：改为 NEED_EXTERNAL_SAMPLE_BEFORE_PROFILE_FREEZE 或缩范围重审。

本次不修改 v0.6 design：其 sample-first 路线仍适用于 PraisonAI 等无已审查公共格式的候选；本任务明确授权的 public-contract-first 路线另记于本文，不能反向宣称旧外部 sample gates 已执行。无需改 Evidence/runtime/governance，`ARCHITECTURE_CHANGE_REQUIRED=false`。

## 19. External Validation Boundary

**EXTERNAL_SAMPLE_REQUIRED_FOR_EXTERNAL_VALIDATION=true。** 未来必须有外部 owner 的真实 source、独立 operator、本地运行、artifact 与来源绑定核验及有用反馈，才能按原 design 进入 ARTIFACT_VERIFIED。

公开文档、源码可访问、团队实验、合同 PASS、profile freeze ready、内部回归均不增加 ARTIFACT_VERIFIED/WILL_REUSE，不证明 adoption、endorsement、official support 或试用接受。本次没有 external sample、没有新 source capture、没有联络 LangChain/PraisonAI、没有发 source qualification request。

LangChain 提前为 first profile candidate，不删除 PraisonAI 路线，不修改历史互动或资格记录，不声称现成 pilot/validator 已支持某外部用户。

## 20. 10-Minute Feasibility

`PROFILE_EXPECTED_EXTERNAL_SETUP=EXISTING_ARCHIVE_ONLY_LOCAL_FILE_SELECTION_AND_METADATA_CHECK`。

仅为规划估算：对已持有兼容归档且 kit 未来可直接运行的用户，定位原件/版本资料约 2-4 分钟、本地预检/验证约 1-3 分钟、查看/可选分享约 1-3 分钟。总计 4-10 分钟，不包含一个已被隐藏的建 agent/capture 工作；下载/setup 仍应在正式 usability 测量中计入。当前 kit 未实现，此估算不是测量结果或达标保证。

没有已有归档的用户，source 获取成本未知，不能套用该预算。若需要修改主流程、重建运行环境或预计 source 获取 >30 分钟，该用户路径 REDESIGN/退出，不要求他安装捕获 helper 来维持“零代码”标签。首次用途的关键市场风险是符合既有 archive 条件的人是否足够多，而不是再扩内部 hardening。

```text
TARGET_TIME_TO_FIRST_RESULT_MET=false
TARGET_TIME_MEASUREMENT_STATUS=NOT_MEASURED
```

## 21. Risks / Refused Claims

- API 文档不是 JSONL 导出规范；归档还依赖固定 serializer 与真实 producer/capture 说明。当前只资格审查一个窄表示，不承诺任意 trace。
- 公共 metadata、工具名、版本声明和 hash 均非认证；source 可以自报成功，runtime trust 与 physical truth 不由此保证。
- Input 已过滤/可能验证前失败；on_tool_start 不证明 body entry。特殊参数、override、middleware、重试、取消、远端工具必须拒绝或另审，不新增 gate 到 runtime。
- end 中 ToolMessage 可以携带 call ID；无终态时不能补做模型关联。成功型态与内容也不证明外部效果。
- 只审查 success 子集，不覆盖 error repr、所有参数类型或所有 provider；future proof 应测试这些 refusal/unknown 规则，但本任务不新增 tests。
- 七个 Core 文件一致不是 dependency closure proof；旧 capture 与当前 package 不能互相冒充。未来更换版本必须独立审查，不把 rolling docs 自动升级为兼容。
- F-01、R-02 配置复现缺口、R-03 append/re-run 安全性不在本次修复范围；本次不运行旧 recorder。
- 有限 contract ready 不保证找到真实使用者，不保证 10 分钟体验，不算外部采用。若找不到合格现有 source，应回到来源决策，不能制造外部样本。

始终保持：Decision != Outcome；Authorized != Executed；Blocked != Failed；Unknown != False；Projection != Execution Control；Approval existence != Approval attribution；Authenticated != Authorized。

## 22. Recommendation

推荐 **GO_TO_LANGCHAIN_PROFILE_FREEZE**，独立 review 本文的既有归档用户类、runtime request 语义、成功子集、opaque 排除与版本范围后，再决定正式 freeze。之后另行决定 minimal implementation；本次不直接推荐开始 coding 或 outreach。

验证仅包括：fetch/基线与 clean 检查、官方 docs/release/source 读取、版本与关键源码差异核对、旧 bundle 完整性及结构化关联的只读断言、本文链接/状态/文件范围与 `git diff --check`。没有安装 SDK、运行 agent/model、生成 fixture/Evidence、修改 bundle 或运行新 projection。只新增本文，按任务提交推送指定 docs 分支，不创建 PR/merge/tag/release。

```text
BASE_MAIN_HEAD=1c1e23720faa48133d177917ef2911316444b433
LANGCHAIN_REVIEW_DATE=2026-09-09
LANGCHAIN_FIRST_PROFILE_CANDIDATE=true
PRAISONAI_FIRST_PROFILE_CANDIDATE=false
LANGCHAIN_VERSION_REVIEWED=1.4.0
LANGCHAIN_CORE_VERSION_REVIEWED=1.6.2
LANGGRAPH_VERSION_REVIEWED=1.2.11
LANGGRAPH_PREBUILT_VERSION_REVIEWED=1.1.0
SELECTED_SOURCE_REPRESENTATION=EXISTING_UNFILTERED_ASTREAM_EVENTS_V2_LC_DUMPS_JSONL_V1
PUBLIC_SPEC_ONLY_PROFILE_FEASIBLE=true
PUBLIC_SOURCE_CONTRACT_QUALIFIED=true
SOURCE_CONTRACT_QUALIFIED=true
SOURCE_SAMPLE_QUALIFIED=false
EXTERNAL_SOURCE_SAMPLE_QUALIFIED=false
EXTERNAL_SAMPLE_REQUIRED_FOR_PROFILE_FREEZE=false
EXTERNAL_SAMPLE_REQUIRED_FOR_EXTERNAL_VALIDATION=true
TOOL_RUN_LIFECYCLE_CORRELATION_PROVEN=true
MODEL_REQUEST_TO_TOOL_RUN_CORRELATION_PROVEN=false
POST_TERMINAL_ID_BRIDGE_AVAILABLE=true
MODEL_TOOL_CALL_ID_ON_TOOL_START=UNAVAILABLE
MODEL_TOOL_CALL_ID_ON_TOOL_END=AVAILABLE
MODEL_TOOL_CALL_ID_ON_TOOL_ERROR=AVAILABLE
REQUEST_SOURCE=on_tool_start.data.input_with_tool_run_id
REQUEST_SEMANTICS=RUNTIME_TOOL_REQUEST_OBSERVATION
CAPABILITY_CLASSIFICATION=OBSERVED
BUSINESS_CODE_CHANGE_REQUIRED=false
CAPTURE_HELPER_REQUIRED=false
SDK_FREE_GATE=PASS
QGATE_1=PASS
QGATE_2=PASS
QGATE_3=PASS
QGATE_4=PASS
QGATE_5=PASS
QGATE_6=PASS
QGATE_7=PASS
NEW_SCHEMA_REQUIRED=false
NEW_RUNTIME_REQUIRED=false
NEW_GOVERNANCE_PROTOCOL_REQUIRED=false
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
PROFILE_FREEZE_READY=true
PROFILE_FROZEN=false
PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1
TARGET_TIME_TO_FIRST_RESULT_MET=false
TARGET_TIME_MEASUREMENT_STATUS=NOT_MEASURED
PILOT_IMPLEMENTATION_AUTHORIZED=false
PILOT_OUTREACH_AUTHORIZED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
ARCHITECTURE_CHANGE_REQUIRED=false
IMPLEMENTATION_STARTED=false
CODE_CHANGED=false
TEST_CHANGED=false
DEPENDENCY_CHANGED=false
FINAL_RECOMMENDATION=GO_TO_LANGCHAIN_PROFILE_FREEZE
FINAL_STATUS=LANGCHAIN_PUBLIC_SPEC_SOURCE_QUALIFICATION_COMPLETE_READY_FOR_INDEPENDENT_REVIEW
```
