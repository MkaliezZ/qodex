# Executive Summary

审查对象：`origin/feat/kerniq-langchain-proof-capture-v0-5-1`，固定提交 **`7ba1f9cfce6959d2c929339028b2a1b8800a56b9`**。本次已取得并只读审查实际 bundle，不再沿用先前“材料未定位”的 pending 结论。

**LANGCHAIN_SOURCE_QUALIFICATION_STATUS=REJECTED（针对当前完整 bundle 及其无 fallback 声明）。**

唯一主要阻塞项是 **F-01 / P1：4 条原生事件包含不支持对象的 `not_implemented + repr` 序列化降级，但 session 仍报告 ok、diagnostics 为空**。这与已批准作为审查依据的 acquisition plan 中“遇到不支持类型不得用 repr 静默替代、应标记 incomplete”的要求冲突。不是摘要损坏，不是发现伪造，也不是 LangChain 无法投影。

完整性核验 PASS；模型请求、工具返回和后续模型 continuation 有可关联的结构化记录，具有局部观察价值。但审查不能自行放宽计划，将这些局部事实等同于当前完整 bundle 已合格。若人工另行接受一个明确排除 opaque Command 的有限 profile，可以保留原件重新评估；本次不授予这种尚未批准的例外。

输入：[Acquisition Plan](kerniq_langchain_engineering_proof_source_acquisition_plan_v0_5_1.md)、[Qualification Plan](kerniq_langchain_source_qualification_v0_5_0.md)。仅更新本审查报告；未生成 Evidence 或运行实验、SDK、bundle 测试及 Evidence validator。

# Source Bundle Identity

实际路径为仓库中的 [experiments/langchain-proof-v0-5-1/engineering-source-bundle/](https://github.com/MkaliezZ/qodex/tree/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle)，不是仓库根目录下的同名目录。

| 项目 | 实际结果 |
| --- | --- |
| 固定提交 | `7ba1f9cfce6959d2c929339028b2a1b8800a56b9` |
| Bundle format | `engineering-source-bundle-v1` |
| Source class | `TEAM_OWNED_ENGINEERING_EXPERIMENT` |
| Experiment ID | `langchain-proof-capture-v0-5-1` |
| Capture class | `TEAM_LAB_NATIVE_STREAM_CONSUMER` |
| Archive representation | `lc-dumps-jsonl-v1` |
| 文件 | 13 个普通 Git blob；manifest 列出 11 个 payload，另有 manifest 与根摘要 |
| Raw events / receipts | 53 / 53 |
| Capture UTC 范围 | `2026-09-07T12:54:57.454Z` 至 `2026-09-07T12:55:02.897Z`，是 collector 时间 |
| Session / diagnostics | `exit_status=ok`；diagnostics 文件 0 字节，但不能推出无序列化降级 |

采用固定 GitHub commit/tree/blob 的只读读取，避免切换已有未跟踪文档的本地 worktree。全部制品在内存解析/散列，无落盘副本，无 `load.loads`、pickle、eval 或源码执行。

# Provenance Review

| 检查 | PASS / FAIL / UNKNOWN | 依据与范围 |
| --- | --- | --- |
| 实际 bundle 已发布、可读取 | PASS | 固定 tree 的 13 个 blob；不再是设计目录或示例 |
| 原生机器记录的内部一致性 | PASS（有限） | 原生 run/parent/call 结构、两轮模型事件、工具结果、receipts 及源码快照一致；不代表独立证明现场生成过程 |
| 团队实验分类 | PASS | manifest、provenance、session 均一致声明 TEAM_OWNED_ENGINEERING_EXPERIMENT |
| 完整无损 capture 的 provenance 声明 | FAIL | serializer profile 的无 repr/可逆声明与 4 个 fallback 不一致 |
| 真实 DeepSeek API 历史过程的独立认证 | UNKNOWN | 有 ChatDeepSeek 代码、provider/model/usage 原生元数据和操作者说明；无本审查者现场观察或独立 provider 认证凭据 |
| 历史上从未人工修改、运行包绝对未改 | UNKNOWN | 自洽摘要与当前源码不足以独立证明历史；未引入新的运行安全证明要求 |

[provenance.md](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle/context/provenance.md)说明模型、环境凭据来源、collector/native producer 的区别以及团队实验性质。没有外部 owner 或外部使用场景证明，不能称为社区采用、外部 trial 或 LangChain 官方支持。

源码快照自校验通过，且等于同提交 `capture_agent.py`：11,207 bytes，SHA-256 `61340b3b3a556acd721e4ea51f4f633e9d931e186636a8ac1d6263798c150d61`。但 [capture_agent.py:194](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/capture_agent.py#L194) 是运行后读取自身源码，不是独立的运行前封存证明。这个局限不等于发现篡改。

# Runtime Identity

以下 KNOWN 表示该 capture 的版本资料已提供且可交叉核对，不表示验证了其他机器实际安装包的全部内容。

| 项目 | 状态 | 值/依据 |
| --- | --- | --- |
| Python | KNOWN | CPython 3.11.15；Windows AMD64 |
| langchain | KNOWN | 1.4.0 |
| langchain-core | KNOWN | 1.6.1 |
| langgraph | KNOWN | 1.2.11 |
| Provider integration | KNOWN | langchain-deepseek 1.1.0；langchain-openai 1.6.0；openai 3.8.0 |
| Serializer | KNOWN | `langchain_core.load.dump.dumps`，core 1.6.1 |
| Pydantic | KNOWN | 2.13.5 |
| Native event interface | KNOWN | `agent.astream_events(..., version="v2")` |
| Requested model | KNOWN | `deepseek-chat` |
| Returned model label | KNOWN | 原生模型终态记录为 `deepseek-v4-flash` |
| 固定服务端模型权重/部署版本 | UNKNOWN | alias 与返回 label/fingerprint 不等于可复现的权重 snapshot |

版本来自 [runtime-versions.json](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle/context/runtime-versions.json) 与同 bundle 的 `dependencies.lock`；模型事件的 `lc_versions` 还支持 core、langchain、langchain-openai 三项。

**R-02 / P2：可复现性配置不足。** execution-config 的 inference/retry/timeout 仅写 provider defaults，recursion limit 仅写 LangGraph default，没有具体解析值或显式预算；因此配置“固定”的程度不足。原生 usage 中存在 provider cache_read，不能把“none configured”理解为不存在任何 provider 缓存。保留事实即可，不修改本次实验或把配置缺口推成执行失败。

# Capture Boundary

只读 [capture_agent.py](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/capture_agent.py) 及与其相同的源码快照，确认：

- 用 `create_agent(model=ChatDeepSeek(...), tools=[add])` 构建一个实验 agent；工具函数计算 `a + b`。
- 一次消费公开 v2 原生事件流；没有第二次 invoke 或手动拼接 ToolMessage 来填结果。
- 快照未出现用户新增 callback 注册、middleware 配置、monkey patch、KerniQ SDK 或 governance 字段注入。原生库内部 callback 属于原生实现，不能称整个 runtime 没有 callback。
- 采集 receipt/诊断/session 位于 raw 之外；每条事件写入前只经过 dump.dumps 和 JSON 语法解析。
- 与冻结基线的远端 compare 显示改动限于隔离实验、bundle、文档及 .gitignore，没有 KerniQ runtime、Evidence schema 或 validator 的改动。该差异检查不认证目标机器包内容。

**R-03 / P2：采集程序不是可安全重复执行的通用 recorder。** raw 使用 append，而 receipts/session 后写覆盖；快照中的代码未拒绝已有 bundle。当前制品的 53/53 对齐和一个 root run 没显示混入另一次 capture，但不可据此承诺下一次运行不会混合历史。本次没有重跑或修复它。

# Evidence Field Mapping

以下是对当前 raw 中可读部分的逐字段审查，不是投影结果，也不抵消 F-01。行号均指固定提交的 [raw/native-events.jsonl](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle/raw/native-events.jsonl)。

| 字段 | AVAILABLE / DERIVED / UNKNOWN | 实际依据与限制 |
| --- | --- | --- |
| request | AVAILABLE | L21 `AIMessage.kwargs.tool_calls[0]` 提供 add、参数和原 call ID；不使用 L22/L23 的 repr 重建 |
| 请求关联 | AVAILABLE | L1 root；L21 请求 call ID；L25 tools 输入；L26/L27 同 tool run；L27 回传原 call ID |
| request_id / caller identity | UNKNOWN | 原生 tool_call_id/run_id 不等于独立请求 ID或可信 requester |
| decision | UNKNOWN | 无 policy evaluation/allow/block；成功调用不推 allow |
| authorization | UNKNOWN | 无 approval/authorization record |
| argument_binding.requested | AVAILABLE | L21 完整 `{"a":17,"b":25}`；只证明此模型输出边界上的 runtime 参数表示 |
| argument_binding.effective | UNKNOWN | L25/L26 可见分发前输入，但没有 policy/authorization 目标绑定；不能自动当治理 effective 版本 |
| argument_binding.executed | UNKNOWN | 没有 add 函数入口的最终实际入参记录 |
| scope / authorization_match | UNKNOWN | run 上下文可见，但没有完整授权 scope/target 可比较 |
| 参数 source ref / digest | DERIVED（潜在） | 可从 L21 的真实快照与固定 representation 建立；本次未生成摘要绑定或 Evidence |
| execution.release | UNKNOWN | 无 execution release receipt |
| execution.dispatch | UNKNOWN（治理阶段） | tools/run observation 可见，未把外层 start 自动提升为该阶段的 receipt |
| execution.start | UNKNOWN（真实实现入口） | on_tool_start 在实际参数转换/实现调用前发出 |
| execution.completion | DERIVED（原生工具返回边界） | L27 的 on_tool_end、相同 tool run/call ID和核对过的原生终态语义，非单凭 root/span end |
| outcome | DERIVED（source-confirmed return） | L27 ToolMessage content `"42"`、status `success`；不证明物理副作用或外部业务成功 |

核心关联标识：

- Root run：`01a07bef-a4e2-7700-ab47-725ea424edd2`。
- Tool run：`01a07bef-aceb-7831-8bc8-ee0b6d04e216`。
- Tool call：`call_00_EMjZPaEGySyDBpxQD2St6577`。

L25 的 tools 输入含完整 call ID；L26/L27 parent_ids 指向该 tools run；L27 又包含相同 tool_call_id，因此这里不是按工具名或相邻时间猜测关联。只有一个工具生命周期对被观察，不证明跨重试/跨进程 exactly once。

# Execution Boundary

原生事件统计：

| Event | 数量 |
| --- | --- |
| on_chain_start / on_chain_end | 4 / 4 |
| on_chat_model_start / on_chat_model_end | 2 / 2 |
| on_chat_model_stream | 33 |
| on_chain_stream | 6 |
| on_tool_start / on_tool_end | 1 / 1 |

一次根 agent 调用包含两轮模型请求：请求工具、随后生成总结。不是一次模型请求；也没有据总结文本推导工具结果。

对声明版本进行只读上游核对：core 1.6.1 的 tag 解析到 `4fe9d3062f4b68e2e472eb92decf369c93aebb46`。[BaseTool.arun](https://github.com/langchain-ai/langchain/blob/4fe9d3062f4b68e2e472eb92decf369c93aebb46/libs/core/langchain_core/tools/base.py#L1201) 在参数转换与实际调用前报告 on_tool_start；[L1264-L1266](https://github.com/langchain-ai/langchain/blob/4fe9d3062f4b68e2e472eb92decf369c93aebb46/libs/core/langchain_core/tools/base.py#L1264) 是输出格式化及 on_tool_end 的返回路径。这里核对的是声明版本的语义，不是远程安装包的内容认证。

因此：

- **Tool requested：可以确认原生请求记录存在。**
- **Tool started：可以确认外层生命周期 start 被记录；实际 add 入口仍 UNKNOWN。**
- **Tool completed：可支持此原生工具返回边界的有限结论**，依据 L27 的 typed result、具体关联及该 source profile，不是“任何 span end 都等于工具完成”。
- Physical side effect、external success、真实 executed arguments、完整 exactly-once 保证：不支持。

# Argument Boundary

L21 requested args、L25 tools 节点输入、L26 tool lifecycle 输入都显示 `a=17,b=25`，但相同数值不证明三个治理阶段均有证据。

Requested arguments 可用；分发前输入可作为原生观察保留；effective governance target 和 executed arguments 均 UNKNOWN。上游实际参数转换位于 on_tool_start 之后，不能用 start 输入预测真实函数收到的值。本次没有利用 repr 解析 Command，也没有通过手动计算 17+25 来代替 source 的 ToolMessage。

没有参数 mutation/clamp 或 authorization binding 记录；不伪造三阶段相等、matched、默认批准或执行参数 digest。

# Authorization Boundary

原生记录未提供 approval、authorization reference、policy decision 或可信 approver identity。实验快照也未配置 human approval。对本 source 的授权事实与身份仍保持 UNKNOWN，不能因为未配置审批就自动输出授权不适用。

工具调用 != 授权；collector/operator 身份 != approver；模型/provider 元数据 != authentication boundary。没有生成 Evidence、授权引用、allow/block 或任何补充字段。

# Integrity Review

**字节完整性 PASS：**

| 检查 | 本次实际结果 |
| --- | --- |
| 固定 tree | recursive tree 完整，非截断；13 个普通文件，无 symlink/submodule payload |
| 根摘要 | bundle.sha256 与 manifest 原始字节 SHA-256 匹配 |
| 文件清单 | 11 个 payload 路径唯一，清单无遗漏/额外文件、无路径越界 |
| 逐文件 SHA-256 / bytes | 11/11 匹配 |
| Git blob 内容 | 获取的每个 blob 与其 Git 对象摘要匹配 |
| JSON / JSONL | JSON 与53条事件/53条 receipt 严格解析通过，无重复键或非有限 JSON 常量 |
| Receipts | index/raw_line 为连续1..53，与 event/run_id/parent_ids 一一相符；接收时间非递减 |
| Snapshot | 自声明摘要/大小匹配，body 等于同提交 capture_agent.py |
| Raw governance 字段 | 递归检查未发现 KerniQ、decision、authorization、argument_binding、evidence_id、policy_ref、identity_provenance 注入键 |
| Secret serializer marker | 未见 lc secret marker；这不是完整秘密信息认证或私有环境审计 |

根摘要：
`8e763aab1108e1d8ecadde86cb7ad41b6f350ed6f21e145513dff4aac7ed6f4e`

Raw SHA-256：
`4ec86fd2a3ba09f98f4b456defd660d86d1bde64019b058e15080dea59c6b0fc`

## F-01 / P1: Silent Serialization Fallback

实际发现四处：

| Raw 行 | 路径 | 实际表示 |
| --- | --- | --- |
| 22 | data.chunk[0] | lc=1，type=not_implemented，id=langgraph/types/Command，含 repr |
| 23 | data.output[0] | 同上 |
| 50 | data.chunk[0] | 同上 |
| 51 | data.output[0] | 同上 |

这些不是保留全部结构的可逆 Command 快照。JSON 语法正确不意味着对象完整序列化，空 diagnostics 只表示采集器没有捕获异常，不能证明没有降级。

根因有直接依据：[capture_agent.py:78](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/capture_agent.py#L78) 调用 dump.dumps；[L113](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/capture_agent.py#L113) 仅用 json.loads 检查语法，只有抛异常才标 incomplete。上游固定版本 [_serialize_value](https://github.com/langchain-ai/langchain/blob/4fe9d3062f4b68e2e472eb92decf369c93aebb46/libs/core/langchain_core/load/_validation.py#L101) 对不支持对象返回 to_json_not_implemented，[该函数](https://github.com/langchain-ai/langchain/blob/4fe9d3062f4b68e2e472eb92decf369c93aebb46/libs/core/langchain_core/load/serializable.py#L380) 使用 repr，因此不会触发这里的异常处理。

与 source 的[serialization-profile.md](https://github.com/MkaliezZ/qodex/blob/7ba1f9cfce6959d2c929339028b2a1b8800a56b9/experiments/langchain-proof-v0-5-1/engineering-source-bundle/context/serialization-profile.md) 所称可逆、没有 repr 替代，以及 acquisition plan 的完整性要求不一致。已披露的“6 tests passed”是 capture 文档的历史报告，本次未运行这些测试；它不推翻 raw 中直接可见的四个标记。

**必要处理（只提出，不执行）：** 保留当前原件，不修改 raw 或重算 manifest 掩盖问题。重新提交前必须明确解决当前 profile 的无损/失败语义声明，或由人工批准把这些对象排除为 opaque unknown 的有限 source profile，再独立审查该例外。任何采集器修复、修改后的制品或新运行都需要单独授权。本次不把“核心字段还在”当作自动放宽完整 capture 规则的许可。

# Qualification Decision

```text
LANGCHAIN_SOURCE_QUALIFICATION_STATUS=REJECTED
ACTUAL_BUNDLE_REVIEWED=true
BUNDLE_BYTE_INTEGRITY=PASS
LOSSLESS_CAPTURE_CLAIM=FAIL
CODE_CHANGED=false
TEST_CHANGED=false
DOCUMENT_CHANGED=true
IMPLEMENTATION_STARTED=false
PROJECTION_STARTED=false
DEPENDENCY_CHANGED=false
EVIDENCE_VALIDATION_RUN=false
FINAL_STATUS=LANGCHAIN_ACTUAL_SOURCE_QUALIFICATION_REVIEW_COMPLETE
```

拒绝的是**当前完整 bundle 对现有采集计划的符合性**，不是断言其中结构化请求/返回无价值或伪造。与先前 pending 不同，材料位置问题已解决，现在的阻塞是可复现的序列化事实与声明冲突。故不再用 PENDING_MISSING_EVIDENCE，也不直接发放 QUALIFIED_FOR_LIMITED_PROOF。

本次仅更新审查报告。全部远端读取固定提交，使用标准库在内存作摘要/结构/关联检查；未切换本地分支、修改 bundle、运行 capture_agent.py/test_bundle.py、安装依赖、执行 LangChain/模型、写 extractor/projector/adapter/Evidence output、改 schema/validator、commit、PR 或 push。停止于审查结论。
