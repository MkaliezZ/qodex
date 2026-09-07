# Executive Summary

结论：**GO_LIMITED_PROFILE**。4 条 opaque Command 事件不是第一个有限、离线 Evidence Projection Proof 的必要来源。请求、requested arguments、原生 call/run 关联及 typed tool return 有独立、完整结构化的记录，可形成有意义的来源链，无须解析 repr。

推荐 profile：`langchain-create-agent-native-stream-v0.1-limited`。这是对固定制品的有限使用边界建议，不是完整无损采集认证，不是 projector 实现或执行授权。当前原完整 profile 的 `LANGCHAIN_SOURCE_QUALIFICATION_STATUS=REJECTED` **保持不变**；F-01 并未修复。本任务明确评估此前未授予的有限使用例外，不能将新建议追溯写进 manifest、session 或旧报告。

审查日期：2026-09-08。固定 GitHub commit：`7ba1f9cfce6959d2c929339028b2a1b8800a56b9`。

主要输入：

- [Source acquisition plan](kerniq_langchain_engineering_proof_source_acquisition_plan_v0_5_1.md)。
- [Actual source qualification review](kerniq_langchain_actual_source_qualification_v0_5_1.md)。
- [Evidence v0.2 MVP specification](kerniq_evidence_schema_v0_2_mvp_spec.md)，尤其 completion 与 outcome 的来源边界。
- 固定提交中的 [engineering-source-bundle](https://github.com/MkaliezZ/qodex/tree/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle)。

仅新增本处置报告。未切换/修改本地分支、修改既有文档或原始制品、安装依赖、运行 LangChain/模型、创建 capture 或实现投影。

# F-01 Reproduction

本次从固定 GitHub commit 只读取得 manifest、根摘要、raw、session、diagnostics、receipts，在内存核对。没有调用 serializer、导入原生对象或重新运行采集程序。

| 检查 | 本次观察 |
| --- | --- |
| Raw / receipts | 53 / 53 条 |
| Manifest SHA-256 | `8e763aab1108e1d8ecadde86cb7ad41b6f350ed6f21e145513dff4aac7ed6f4e`，与 bundle.sha256 相符 |
| Raw SHA-256 | `4ec86fd2a3ba09f98f4b456defd660d86d1bde64019b058e15080dea59c6b0fc`，与 manifest 及前次审查相符 |
| Session | `exit_status=ok` |
| Diagnostics | 0 字节 |
| Unsupported objects | 4 个，均为 `lc=1, type=not_implemented, id=[langgraph,types,Command]`，有 repr 字段 |

以下行号均指固定 [raw/native-events.jsonl](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle/raw/native-events.jsonl)：

| 行 | Event | Opaque 对象位置 |
| --- | --- | --- |
| 22 | on_chain_stream | `data.chunk[0]` |
| 23 | on_chain_end | `data.output[0]` |
| 50 | on_chain_stream | `data.chunk[0]` |
| 51 | on_chain_end | `data.output[0]` |

本次只检查类型标记和 repr 字段是否存在，不解析或利用 repr 内容。前次审查已定位原因：固定 serializer 对不支持对象返回 fallback 而不抛异常，采集器的 JSON 语法检查无法检测该降级。F-01 的“静默降级与完整 capture 声明冲突”复现成立。

此前 13 文件完整清单、11 个 payload 的完整性 PASS 作为既有审查结果继承；本次重点重核根摘要、raw 及字段依赖，不冒称重新执行了全部历史验证。摘要自洽不认证历史现场、操作者身份或物理执行。

# Projection Dependency Analysis

使用已序列化的结构化字段，不实例化 `AIMessage`、`ToolMessage` 或 `Command`。最小来源集合是 L1、L21、L25、L26、L27；L29 仅为可选一致性旁证。此集合完全不含 unsupported 标记。

| 必答问题 | 是否依赖 opaque Command | 可独立使用的来源与结论 |
| --- | --- | --- |
| 1. Request mapping | 否 | L21 `data.output.kwargs.tool_calls[0]` 提供原生请求、tool name、call ID；无须恢复 Command 的 update |
| 2. tool_call_id correlation | 否 | L21 call ID = L25 `data.input[0].id` = L27 ToolMessage 的 tool_call_id；L26/L27 同 run ID、同 parent_ids，并属于 L25 的 tools run |
| 3. Requested argument mapping | 否 | L21 `tool_calls[0].args` 为完整 JSON 对象 `{"a":17,"b":25}`，不拼接 stream chunks 或 repr |
| 4. Tool completion mapping | 否 | L27 的具体 `on_tool_end` 与 typed result、call/run 关联支持已观察终态；不是使用 L23/L51 的通用 chain end |
| 5. Typed outcome mapping | 否 | L27 `ToolMessage.kwargs` 包含 `content="42"`、`status="success"`、tool_call_id；不依赖模型最终回答或人工算术 |
| 6. 完全不使用 opaque 事件能否保留有效链 | 是 | 上述五项均有独立结构化依据；decision、authorization、physical start、effective/executed args 继续 UNKNOWN，不从缺口补推 |

具体关联：

- Root run：`01a07bef-a4e2-7700-ab47-725ea424edd2`，L1；其 ID 位于 L21/L25/L26/L27 的原生 parent chain。
- Tools node run：`01a07bef-ace9-73d1-9bf0-9cdac91c1e23`，L25；L26/L27 均将其列为直接 parent。
- Tool run：`01a07bef-aceb-7831-8bc8-ee0b6d04e216`，L26/L27。
- Tool call：`call_00_EMjZPaEGySyDBpxQD2St6577`，L21/L25/L27。

本次内存断言核对原 ID、parent 链、结构类型、请求参数、typed result 和一对工具 start/end 均通过。这是只读依赖检查，不是 projector 或 Evidence validator 测试。关联不依靠“名称一样”“时间最近”“参数相等”或 opaque 中的路由信息，也不把 run_id 伪装成原生 tool_call_id。

该 source 内可定位一个调用观察链，但没有据此证明完整 agent 状态演化、无隐藏执行、无 retry 或 exactly-once。若今后不同制品出现重复/冲突 call ID、跨 root 配对或必要字段缺失，不能凭这个样本的单工具假设补全关联。

# Opaque Command Impact

失去的是这些 Command 对象的可逆结构及其承载的状态更新/控制信息。本文不判断 repr 中有哪些值，不恢复 update、goto、resume 或其他字段，也不通过前后状态差值重建它们。

因此无法从它们确定状态变更、路由决定、参数变换历史或完整执行控制链。后续的结构化工具输入/返回可以独立说明各自观察点发生的记录，但不能证明中间 Command 完整、未修改参数或没有隐藏分支。

“忽略”仅指不将这 4 条事件用作 known Evidence 的语义来源：原始 53 行仍全部保留、原行号不变，排除位置和原因在本报告中显式披露。不生成删去 4 行的新 raw，不把剩余 49 行统称全部合格，也不把未知当作否定。

凡只能依赖 opaque material 的字段保持 UNKNOWN；若未来某项必需关联只能从 repr 恢复，应停止该字段或样本的有限使用，而不是增加解码补丁。当前这一条 request/result 链没有这种依赖。

# Limited Profile Feasibility

**LIMITED_PROFILE_FEASIBLE=true。** 建议边界如下；本文记录设计审查建议，实施仍需单独授权。

| 项目 | Profile 限定 |
| --- | --- |
| 名称 | `langchain-create-agent-native-stream-v0.1-limited` |
| 制品身份 | 仅本报告固定 commit、bundle 路径、manifest/raw 摘要；分支未来 HEAD 不自动进入本 profile |
| 已声明版本组合 | Python 3.11.15；langchain 1.4.0；langchain-core 1.6.1；langgraph 1.2.11；langchain-deepseek 1.1.0；原生 astream_events v2；lc-dumps-jsonl-v1 |
| 应用范围 | TEAM_OWNED_ENGINEERING_EXPERIMENT；create_agent、普通 add 工具、一次 root invocation 中的一条可关联工具观察链 |
| 来源使用 | 最小 L1/L21/L25/L26/L27；已完整结构化且通过原始身份/关联核验的字段；L29 仅旁证 |
| Opaque 排除 | 整条 L22/L23/L50/L51 不作为 known Evidence 的来源；保留原始记录及排除说明 |
| 数据处理限制 | 不解析 repr，不执行 constructor 标记，不反射加载原生类型，不恢复 Command，不重新调用 agent/tool |
| 允许的缺口 | Decision、authorization、可信 identity、effective/executed arguments、execution release/dispatch/start 仍 UNKNOWN |
| 失败条件 | 必需来源含 unsupported、必要 ID 缺失、身份/结果冲突或摘要不符时停止有限映射；不能为了 validator PASS 降格隐藏已知冲突 |
| Profile 性质 | 有损制品中的限定结构化来源可用性，不是 lossless profile、完整 governance 认证或通用 LangChain 支持 |

新 profile 是独立的审查解释边界，不更改原 `serialization_representation`，不覆盖 producer 的旧声明，也不向 bundle 补写新的资格状态。与新任务有关的审批应引用本报告及固定制品身份，而非将原 session 的 ok 当作资格 PASS。

# Allowed Evidence Claims

允许的最强当前结论是：

> 固定团队实验制品中，存在不依赖 opaque Command 的结构化来源，足以支撑对一个 add 工具请求、其 requested arguments、原生 call/run 关联以及 source-confirmed typed return/终态的有限离线 Evidence 映射设计；执行控制、授权、真实函数入口、实际执行参数及物理副作用未由此证明。

这不是“已经完成投影”或“Evidence validator 已通过”。本次仅确认输入依赖的可行性。

| Evidence 概念 | 最强允许语义 | 不得补充的缺失事实 |
| --- | --- | --- |
| request | L21 的原生工具请求可作为 known 来源；保留原 call ID 和 tool name | 独立 request_id、可信 requester 不凭空生成 |
| requested arguments | L21 完整存档对象可作为参数 snapshot 来源 | 不声称原始模型 wire bytes、不推实际执行参数 |
| correlation | 同一 source/root 下原 call ID + tool run + parent chain 的关联 | 不扩展为跨进程、跨重试或全局调用身份保证 |
| completion | L27 是已观察工具调用终态，可按现有 MVP completion 语义表达 | 不倒推出真实 start；collector 时间不填成精确执行时间 |
| outcome | L27 typed ToolMessage 的 `status=success`、`content="42"` 支持 source-confirmed return | 不推外部业务成功、持久化效果或物理副作用 |
| decision / authorization / identity | UNKNOWN，无可用治理/认证来源 | 不从工具被调用推 allow/granted；缺失不等于 block/refused 或 not_applicable |
| effective / executed / authorization_match | UNKNOWN | L21/L26 值相等不是参数阶段证明，也不是授权匹配 |
| execution release / dispatch / start | 本 profile 保守保持 UNKNOWN | 不将 on_tool_start 升级为真实实现入口或准入放行 |

completion 的解释沿用 MVP：已观察到的终态/结算事件，不保证实际执行；outcome success 指源确认返回成功。前次审查核对过固定 core 的返回路径，本次不扩大为任意 callback/span 的执行证明。L29 的副本只能增加一致性旁证，不能计作第二次执行或独立认证。

未来若既有 validator 无法容纳这些真实缺口，必须停下报告，不增加 Evidence 字段、不伪造 start/authorization、不改 schema 或 validator 来通过验证。

# Forbidden Claims

- 完整无损 capture、所有原生对象均可逆、session ok 证明没有降级，或 F-01 已经修复。
- `on_tool_start = physical tool entry`。
- `ToolMessage success = physical side effect / external success`。
- `requested args = tool input` 因而 `executed args` 已知。
- 从 Command repr、最终回答、人工求和或缺失记录推导任何 known Evidence。
- 真实 policy allow/block、AgentFuse 对该调用做出决定、authorization granted 或可信批准人身份。
- 完整图执行/路由证明、SDK-free attach 已验证、runtime trust/admission 已验证、跨进程 exactly-once。
- LangChain 官方支持、外部用户验证、adoption、endorsement；也不得反向声称 LANGCHAIN_UNSUPPORTED 或 SOURCE_FABRICATED。

保持：

```text
Projection != Execution Control
Projection != Runtime Trust
Projection != Authorization
Projection != Proof of Physical Side Effect
Decision != Outcome
Authorized != Executed
Blocked != Failed
Unknown != False
```

# Fresh Recapture Decision

**FRESH_RECAPTURE_REQUIRED=false（仅针对上述第一个有限 proof 的来源需求）。** 必需字段具有独立结构化来源，排除 opaque 不会使 proof 退化为最终回答 transcript，也不会强迫伪造治理或执行事实。

这不表示完整无损目标已达成。若后续人工拒绝有限 profile，或目标改为完整 Command/状态变更证明，应重新决策，而不是沿用本结论声称无需补证。当前不启动 Option B、不设计采集器修复、不改制品、不重新生成 manifest/hash、不运行新模型请求。

F-01 处置：**旧完整 profile 中仍未解决；新限定来源用途下可显式排除其影响。** 不是修复完成，也不是静默接受原 capture 声明。采用有限 profile 的人工确认与 projector 实施授权仍是独立事项。

# R-02 / R-03 Disposition

| 项目 | 本次处置 | 对有限 profile 的影响 |
| --- | --- | --- |
| R-02 reproducibility config gaps | 保留既有 P2，不扩大修复或重新调查配置 | 不承诺完整配置/模型可复现性；不妨碍定位这份不可变制品中既有请求与返回 |
| R-03 append/re-run safety | 保留既有 P2，不运行/修复 recorder | 当前样本的关联已核对；不据此认证重复采集安全性或后续 bundle |

因为本次不需要 fresh recapture，不追加“顺手修复”要求。两项都不是忽略风险：它们继续约束可复现性和再次采集的声明，但不成为本次有限读取的新增 P1。若未来单独授权新采集，再在该任务评估，不能修改旧 bundle 来清除历史问题。

# Recommendation

推荐 **GO_LIMITED_PROFILE**，将本报告交人工确认。第一个 proof 可以限定为“结构化 request + requested args + 显式 correlation + source-confirmed completion/outcome”；其他事实维持未知。没有必要为这个用途先重采，也不修改旧 REJECTED 报告。

验证：固定 GitHub 制品只读读取；根/raw 摘要核对；53 条 raw 的 unsupported 标记检查；排除四条事件后的最小字段依赖/原 ID/parent 链内存核验 PASS。未运行 LangChain、采集测试、Evidence validator 或 projector；这些检查不称为 Evidence Validation PASS。

```text
LIMITED_PROFILE_FEASIBLE=true
FRESH_RECAPTURE_REQUIRED=false
CURRENT_BUNDLE_MUTATION_ALLOWED=false
PROJECTION_IMPLEMENTATION_AUTHORIZED=false
FINAL_RECOMMENDATION=GO_LIMITED_PROFILE
CODE_CHANGED=false
TEST_CHANGED=false
IMPLEMENTATION_STARTED=false
DOCUMENT_CHANGED=true
PROTOCOL_CHANGED=false
DEPENDENCY_CHANGED=false
```

仅新增本文。未修改 source、tests、capture、bundle、原审查、schema 或 validator；未创建 commit、PR 或 push。完成处置审查后停止。
