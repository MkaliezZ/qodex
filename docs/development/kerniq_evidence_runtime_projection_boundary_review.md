# Executive Summary

日期：2026-09-07。任务：Evidence Runtime Projection Proof 的最小边界设计，不是实现、runtime 接入或新的执行证明。

**建议：以一个固定版本、固定采集边界的既有 runtime 原生记录做离线、只读投影，复用冻结的 Evidence v0.2 契约与已有结构验证器。首选现有 DSH production observer 记录；不先新增 framework adapter，也不把合成 v0.2 fixtures 当作真实外部事件。**

```text
PROJECTION_SCOPE=ONE_PINNED_RUNTIME_PROFILE_OFFLINE_EVENT_REPLAY
SCHEMA_VERSION=kerniq.governance-evidence.v0.2
IMPLEMENTATION_STARTED=false
PROTOCOL_IMPLEMENTED=false
RUNTIME_PROJECTION_PROVEN=false
FINAL_STATUS=RUNTIME_PROJECTION_BOUNDARY_REVIEW_COMPLETE_READY_FOR_IMPLEMENTATION
```

READY_FOR_IMPLEMENTATION 表示本边界设计足以交给下一项**单独授权**的任务，不是当前开始编码的许可。真实 source capture 的取得、来源确认和选定 profile 的冻结是该任务的入口条件；未满足时不能宣称 real-runtime projection proof。

本次依据与核验：

| 输入 | 核验范围 |
| --- | --- |
| 本地 v0.3.3.3 | `MkaliezZ/qodex` checkout HEAD 为 `b743a5727f51986bcafbac4e638af8ad218badbb`；未改 branch/HEAD，未重跑历史 runtime proof |
| [MVP spec](kerniq_evidence_schema_v0_2_mvp_spec.md) | 已读；本地 Git blob 为 `79884665244ec46a5aad3d4e24ea47711f8af94d` |
| [Conformance proof](https://github.com/MkaliezZ/qodex/blob/9e4f80917c7f1aed530c1b969bfdad59d8d14445/docs/development/kerniq_evidence_schema_v0_2_conformance_proof.md) | 位于 `feat/kerniq-evidence-schema-v0-2-conformance`，固定提交 `9e4f80917c7f1aed530c1b969bfdad59d8d14445`；本地冻结 checkout 没有此文件，已通过只读 GitHub API 获取 |
| 同提交 spec | 远端 blob 与本地 spec 相同，确认 proof 使用同一规范内容，不代表测试已在本机复跑 |
| [已有 validator](https://github.com/MkaliezZ/qodex/blob/9e4f80917c7f1aed530c1b969bfdad59d8d14445/python/kerniq_evidence_conformance/validator.py) | 只读核对了结构校验、Observation、ID 冲突等职责；没有运行或改动 |
| [DSH observer](../../packages/dsh-control-plane-observer/index.js) 与 [历史 evidence 记录](kerniq_governance_evidence_hardening_v0_3_1.md) | 核对可用字段与观察位置，用于推荐既有 source；没有读取私有运行记录或新采集真实 trace |

Conformance 文档记录 **46 passed**；这是该文档的历史结果，本次未运行测试。它使用 synthetic fixtures，明确不解析引用、不证明 producer 历史真实性或 execution control。Layer 3 不能从这个测试数量自动推出。

# Relationship With Runtime Integrity

三层分别回答不同问题：

| 层次 | 问题 | 本次关系 |
| --- | --- | --- |
| Layer 1: Runtime Integrity | 当前 runtime 身份、内容、依赖、解析拓扑与 executable composition 是否在审计/准入范围内 | v0.3.3.3 freeze 不变；projection 可以引用已有 admission receipt，不能重新签发 admission |
| Layer 2: Evidence Contract | 记录能否结构化区分请求、决定、批准引用、参数和执行事实 | 已有 spec/离线 conformance 是结构基线，不证明 source 真伪 |
| Layer 3: Runtime Projection | 固定 runtime 原生事件能否按明确规则映射，且不升级或丢失事实 | 本次只定义未来 proof 的边界 |

```text
Projection != Execution Control
Projection != Runtime Trust
Projection != Authorization
Projection != Proof of Physical Side Effect
```

原生 trace 中写有 runtime version、admitted=true 或 seal hash，不等于当前运行已验证。collector 的文件摘要只能标识采集制品的字节，不能替代 runtime admission，更不能认证批准人。本任务不增加 gate、不修改 seal、manifest 或执行路径。

# Relationship With Evidence Schema

输出必须是现有 `kerniq.governance-evidence.v0.2`，保持六类记录与 `Observation<T>` 的 known/unknown/not_applicable 规则。不得增加 EXECUTED、OBSERVED、directly_observed 等新 schema 枚举或顶层字段。本文的事件分类仅用于 profile 与伴随 lineage 说明。

必须保持：

```text
Decision != Outcome
Authorized != Executed
Blocked != Failed
Unknown != False
Approval existence != Approval attribution
Authenticated != Authorized
```

已有 validator 检查字段形状、枚举、字符串、时间、digest 形式及重复 evidence ID 的内容冲突；它不解析 source_ref、检查真实 handler，也不认证 identity_provenance。给不存在的来源编造 ref，可能仍具备合法形状；因此 projection proof 必须额外逐字段核对真实输入和来源，不只调用 validator 后宣布通过。

MVP spec 的 `source_ref` 可以指向获准的原始事件记录，或可复核的只读派生记录。派生记录必须列明源事件、字段路径和规则，不能借新的 ref 伪造来源。profile/lineage 属于 proof 的伴随说明，不嵌入新 schema 字段，也不是新的公共治理协议。

原设计和 conformance 中的成功/blocked fixtures 继续只证明可表达性。未来真实记录只有 request/result 时，不能复制 fixture 中的 release、identity 或 executed 参数来“完成”输出。

# Projection Model

## RP-01 / RP-02：最小输入输出边界

最小接口是批次投影而非一事件一最终事实。一个 call 的 request、approval、decision 与 result 通常来自多条记录；无法可靠关联时必须保留 incomplete 或报诊断。

```text
project(
  pinned_profile,
  read_only_source_bundle,
  bounded_runtime_events,
  projection_context
)
  -> evidence_records + diagnostics + lineage_references
```

这是接口职责设计，不是函数实现或新 package API。

| 输入/输出 | 最小职责 |
| --- | --- |
| pinned_profile | 固定 runtime/producer revision、原生事件格式、发出位置、字段语义、关联键、可覆盖与不可覆盖路径；从 reviewer 认可的配置选择，不由事件 payload 指定规则 |
| read_only_source_bundle | 原生采集制品、collector/source 标识、采集范围、已知截断/丢失情况、输入摘要及获准访问的引用；与既有 admission receipt 分开 |
| bounded_runtime_events | 保存 native event kind、原 payload/只读 ref、原 event ID（若有）、原时间（若有）、call/run/session/attempt 关联信息；缺失不伪造 |
| projection_context | proof producer/profile ref、命名空间、明确的 recorded_at 与批次身份；若使用既有前序 evidence，只读引用，不复写 |
| evidence_records | 固定 schema 的不可变视图；所有已知事实都有 source_ref，所有缺口按 spec 表达 |
| diagnostics | unsupported event/profile、结构错误、关联不足、冲突、source 不可读等；不是 policy decision，也不回传给运行中的 agent |
| lineage_references | 每个输出字段到输入字段/事件与派生规则的只读说明；便于人工复核和后续 proof，不能执行内容 |

未来 adapter 的最小职责只是读取获准的原生事件、保留 source identity/context 并按固定 profile 映射。不得调用工具、同意审批、访问认证系统、请求模型、查远端 URL、改变 retry 或操控执行暂停/继续。第一步只处理既有文件/内存事件批次，不建设 live subscriber/sidecar。

## 关联、时间与冲突

- 使用 source producer/capture 命名空间 + runtime/run/session 范围 + 原生 call/attempt 关联。不能只靠 tool_name、相邻时间或同名 agent 合并记录；两个 worker 的同一 call ID 不能自动合并。
- 原生未给 event ID 时可以用采集制品摘要和记录 offset 建立**制品引用**；这不是新的原生 event ID，也不是 tool attempt identity。未给 request_id/attempt 时保留 null，不把行号伪装成原生调用身份。
- source order 只证明采集顺序。跨 producer 事件不能凭 wall-clock 建立全局因果；recorded_at 是投影时间，不能填进缺失的 decided_at 或 execution.at。
- 对相同 profile、source bytes 与显式 projection_context，映射应可复现。不同投影时点如产生不同 recorded_at，应有独立视图身份，不要求真实时钟永远输出相同字节。
- 相同事件重复读取可幂等；同 native ID 内容不同或同 attempt 的证据冲突应报告。不得 last-write-wins 覆盖 approval，不能把冲突吞成 unknown。存在无法区分的 retry 时，隔离该组，不推测一次执行。
- 不完整输入不是自动失败的全部输出，但缺口必须可见。known 事实不能被全量降为 unknown 来伪装保守；没有依据的字段也不能补齐为 false。
- 冲突/不支持的组不得作为一致的有效 projection 发布；原始 source 可只读保留供诊断。投影失败仅影响投影结果，不能改变原始执行或追加执行控制动作。

# Runtime Event Classification

`directly observed` 表示按固定 source contract 直接读取到的记录事实，不表示发出者绝对可信。`derived` 是可重算、可追溯且不增加权限/物理结论的转换。`unknown` 表示无法确定目标事实。三种分类存于 profile/lineage，不改 schema。

| 原生事件类别（示意名称） | directly observed | 允许 derived 的映射 | 必须 unknown 或禁止推断 |
| --- | --- | --- | --- |
| `tool_call_requested` | 请求记录、原 call ID、工具名称、该时点实际提供的 args | request ref、原生 ID 无损映射；从确认为原始请求的快照建立 requested 引用/digest | 请求是否由真人发起；只有后期请求记录时不能冒充模型最初 intent |
| `tool_call_approved` | 审批记录/ref、明确 grant/refusal、原 target/时间（若有） | Authorization Reference；source 是有效原生授权事件时可 granted | 事件名、approved boolean 或 approval_id 单独不证明人类 identity；不能自动填 policy allow |
| 原生 policy result | 明确 policy action、policy/decision/target ref | 冻结映射表支持的 canonical allow/block；已观察 error 则 action=null | 未知 local enum、approval yes、普通成功结果不能推导 canonical allow |
| release receipt | 已有放行 receipt | execution.release known/occurred=true | dispatch/start/side effect |
| `tool_call_started` | 某个命名为 started 的事件出现 | 只有发出位置的契约支持时，映射为 release、dispatch 或真实 start 中的相应一项 | 不可仅按名称映射 start；不得把一个模糊 callback 扩成三个阶段已发生 |
| `tool_call_completed` | per-call result/终态事件与其 typed status | 源契约明确终态时 completion=true；status 可确定时映射 outcome | successful tool body、executed args、全部 side effects；session ended 不是每个 call 的 completed |
| cancellation/timeout/日志中断 | cancel 请求、超时通知、记录缺口 | 保留有依据的取消/不确定结果及原 reason | cancel 请求不是已取消，timeout 不是未执行，EOF 不是无后续 dispatch |

非执行结论需要 call 级、target/attempt 关联完整的受控阻止/终态依据。只有批准被拒绝或 policy block 事件时，decision/authorization 可 known，而 dispatch/start/outcome 仍可能 unknown。不能依赖终态字符串“denied”猜测 handler 从未进入。

派生规则仅允许语义明确的无损字段映射、可核对的摘要、已有 scope/target 内容比较、已确认关联的视图汇总。例如已知源错误事件可形成 `decision.status=known, value.evaluation=error, value.action=null`；不是新 policy error 计算。

# Execution Evidence Boundary

## RP-03：不新增 EXECUTED 枚举

本契约没有独立 `EXECUTED` wire status。以下词仅解释证据强度：

| 可表达的最强结论 | 必需依据 | v0.2 表达 |
| --- | --- | --- |
| OBSERVED | 有原生记录和固定 source 语义 | source/profile/lineage 留存；无法确认目标阶段时该阶段仍 unknown |
| DISPATCHED | 有证据表明原执行链/handler 已被委托，不只是准备调用 | execution.dispatch known，occurred=true；start 可 unknown |
| STARTED / bounded EXECUTED-entry | 来源位置明确位于真实受支持实现入口，而非外层 lifecycle 回调 | execution.start known，occurred=true；只证明该入口被观察，不代表成功结束或副作用 |
| 执行成功返回 | 已观察对应工具调用的成功返回/结果，且 profile 区分缓存/合成返回等路径 | outcome success；入口是否观测仍单独表达 |
| physical side effect | 独立可观察的资源变化及其受限因果证明 | 不属本 MVP；不新添字段或从上述阶段推出 |

确认一个 emitter 足以支持 start，未来 profile 至少要核对其固定版本发出位置、对应真实工具身份、exception/cancellation 路径，以及该记录是否能在没有进入原实现时发出。若只是 callback fired、日志命名为 executed、wrapper 即将调用 next、任意用户 override 返回值，则不满足入口证明。

真实 start 可 observed 而 executed arguments unknown：入口被观察并不代表采集了函数最终收到的参数。反之，event 提供一份“final args”也不能证明 start 已发生。

失败和取消必须保留时间位置。release 后崩溃、dispatch 后无 result、完成后持久化失败均不能变为未执行。可靠来源的 block 与同 attempt 实际 dispatch/start 相冲突时，报告冲突，不为维持“governed”结论删改源。

`execution.completion` 是 attempt 已到终态，不是物理执行完成；因此已有 approval、随后 block、completion=true 与 dispatch=false 可以合法共存，但 false 必须有充分依据。未观察 execution 阶段使用 unknown，不能使用 not_applicable 掩盖它。

# Argument Binding Mapping

## RP-04：参数的来源优先于字段名称

| Runtime 提供的内容 | requested | effective | executed |
| --- | --- | --- | --- |
| 模型原始 tool-call args，来源在 mutation 前 | 可 known | 除非有独立依据，否则 unknown | unknown |
| 已知 policy/normalizer 后、决策实际针对的 args | 不回填 requested | 可 known | unknown |
| 真实工具入口收到的完整参数 | 不能反推 requested | 不能反推被批准目标 | 可 known，引用明确入口事件 |
| 仅名为 final_args 的字段，无发出位置说明 | unknown | unknown | unknown；原字段保存在 source |
| final_args 明确是委托前快照 | unknown（原始未采集） | 仅当 profile 确认其为决定/授权对应版本时 known，否则保留源且 unknown | unknown |
| final_args 明确在真实入口采集 | unknown | unknown（授权目标未采集） | 可 known；不由名字决定 |

requested/effective/executed 不可复制来补空白，三个 digest 相同也不自动证明三阶段均被观察。schema conversion、默认值和注入发生在快照之后时，不能预测 executed 值；不得调用用户 validator/tool 来推算。

digest 只能对已取得的对应快照按已知 representation 计算，或无损保留原 source digest。投影不得重算覆盖旧值、将原生算法重命名为 sha256、把脱敏副本当完整参数。缺少获准的快照访问时，保留 ref/unknown，不新增远程取数。

`authorization_match=matched` 需要原授权 target 与当前 effective target 的工具身份、参数和 scope 可复核。只比较 args hash、tool name 或 ref 字符串不充分。批准后 clamp 即便看似更安全，也不能自动承袭批准；旧 authorization_ref/target 保留，对新目标记 mismatched 或无法比较的 unknown。离线 projection 不执行撤销、重新审批或阻断。

# Authorization Mapping

## RP-05：approval 事件不是身份凭证

原生 approval event 只有在 profile 明确其代表实际授权记录时，才映射为已知 Authorization Reference。若没有 native approval_id，但该源事件本身确为授权记录，可使用其受控制品引用作为 authorization_ref，并注明这是记录引用，不是新签发 grant ID。只有 pending/询问通知时 disposition=unknown；仅有不明含义的 approved flag 时不推断 grant。

- approval_id/ref 不等于 approver identity，runtime 登录名、agent state 或 caller metadata 不可成为 trusted subject。
- 没有已验证认证来源时，identity_provenance 必须为 source=unknown、subject_ref=null、provenance_ref=null，并有原因。
- 第一版 proof 不新增身份验证器；既有可验证来源若另行纳入 profile 才可引用。validator 接受形状正确的 trusted 字段，不证明其真实性。
- 授权存在与 policy judgment 独立。tool_call_approved 不生成 decision allow；随后 policy block 必须保留此前授权。
- 来源没有 approval event 时不代表未批准；authorization 保持 unknown，不据 policy block 设置 not_applicable。
- expires_at、generation、validity_ref 只反映既有记录/检查时点。projection 不计算全局 current validity，不实现 expiry/revocation，不提升 current-user 身份到历史审批。

Schema-neutral 引用不会引入独立 authorization service；任何 EvidenceRecord 都不能作为新的 bearer capability。执行系统不能因为 projection 输出 granted 或 matched 而放行一个新动作。

# SDK-free Adapter Boundary

## RP-06：多来源，一个契约，不承诺已支持

LangChain、AutoGen、MCP、OpenAI Agents、Hermes 等未来**可以作为不同 source profile 的候选**进入同一 Evidence Contract；这是架构可容纳性，不是本次核验了这些系统的 API、SDK-free attachment 或事件真实性。MCP 的 request/response 边界也不能代替整个 agent runtime 的所有执行路径。

核心 schema 不引用任一框架的 ToolCall/Message 类、SDK、provider token 或 agent abstraction。未来 source-specific decoder 只负责可审计的字段/事件映射；如确需第三方 SDK 读取来源，必须在独立任务中审查，不能使其成为核心 contract 依赖。

最小 SDK-free 路径是读取现成 export/log/event bundle，业务代码不变；若现成来源不存在，就明确缺口，不能要求用户改工具函数却称为 zero-code。观察性 attachment 不等于 pre-execution governance，schema-neutral 不等于 universal runtime support。

本任务不设计框架 monkey patch、tool wrapper、launcher、live IPC 或新的 Backend 抽象，不要求用户添加 `middleware=[...]`、`import kerniq` 或继承 KerniQ 类。

# Minimal Runtime Projection Proof

## RP-07：一个真实 source profile，离线映射，不新增治理系统

**推荐首选已有 DSH production observer 的原生事件，而不是先连接新框架。** 它已是外部 Agent Runtime 的记录来源，可利用固定 KerniQ/DSH profile 背景，减少额外集成变量。历史运行证明不自动充当原始输入；下一任务仍须取得并核对实际采集制品。

现有 observer 在固定本地基线中的输出能力如下：

| Source 字段/位置 | 未来 profile 可验证的内容 | 首版保守边界 |
| --- | --- | --- |
| `model_request`：toolCallId、toolName、turn、step | 模型请求事件的调用身份，来源是 session/event 的 tool/call | 没有 args 或 human identity；requested arguments 与 identity unknown |
| `pre_execute`：observed、随后 decision.kind 或 errorName | 工具前置链结果/错误记录 | 必须核对固定 DSH kind 语义与决策来源后才能映射 canonical action；不捏造 decision ID、policy/target 或 approval |
| `dispatch`：tools/execute hook 中先记录，再调用 next | 直接证明该 hook 已被进入、marker 已发出 | marker 自身不证明后面的 next 或真实工具入口已经调用；单靠本文件将 execution.dispatch/start 保持 unknown |
| `result`：isError、errorCode | 对应 call 的原生结果元数据 | 需固定 runtime 的 terminal/typed status 语义；不能将 isError=false 一律变成工具物理执行成功 |

若进一步只读核对固定 DSH 源码，证明 tools/execute hook 的进入本身已经是原生执行链 delegation，可在 profile 中**明确将 dispatch 定义为执行链委托**再映射 known=true；仍不能升级为物理 start。不能仅凭字段名 dispatch 改掉这一要求。

这些记录没有通用 approval_ref、三阶段 args、认证来源，也没有每条 runtime timestamp。未知字段必须保留，不能把 turn/step、文件时间或同一 call 的相邻事件当作缺失参数/身份/原时间。本 MVP 不为了填空修改 observer。

## 下一任务入口条件

1. 固定 source emitter/runtime/profile revision 与原生格式；必须与被回放制品的实际生产版本对应，而非拿当前 main 假定来源版本。
2. 取得至少一份真实原生采集制品，证明它不是从 v0.2 fixture 反向构造；登记获准读取范围、collector/run/worker 命名空间、输入摘要、完整性/截断信息。摘要不作 runtime 信任证明。
3. 一个成功调用记录组可作为首个外部投影正向样本；如需要真实 blocked projection 声明，另需同样有来源和覆盖依据的 blocked 记录组。没有该样本时该项保持 NOT_PROVEN，不捏造。
4. 如找不到可用真实制品，停止 real-runtime proof，报告 SOURCE_CAPTURE_UNAVAILABLE；不在本任务边界内自动启动模型、工具、安装 runtime 或创建新采集路径。
5. 已有 conformance validator/spec 使用上述固定提交和一致版本。它负责结构验证，不扩展成新的 runtime/identity validator，也不更改 schema。

## Proof 应交付与验证什么

未来经授权的最小交付：一个固定 profile 的离线投影、对应 source 到字段的 lineage、符合既有 schema 的输出，以及区分真实记录与 synthetic negative cases 的结果报告。本次不创建这些实现制品。

| 验证项 | 应证明 | 不得混同 |
| --- | --- | --- |
| 原生记录到 request/decision/result | 保留确知值、scope/call identity 和原语义，有可复核 source | 全 unknown 的形式通过不是有用正向 proof |
| 审批记录后 policy block | 若存在相应输入，历史 approval 不被覆盖；identity 缺失仍 unknown | 合成输入通过不是证明 DSH 已发出 approval event |
| 模糊 started/callback | 不升级为 physical start，不复制 release/dispatch | 事件出现不是 handler 入口证明 |
| 仅 final args / 无 args | 按真实观察位置映射，缺失阶段 unknown | 不执行工具/validator 计算最终参数 |
| 无 terminal、乱序、截断、相邻同名调用 | 缺口与关联不确定可见；不错误合并，不从 EOF 推导零执行 | 控制侧 timeout 或分布式 tracing |
| 同 ID 重复/冲突、跨 worker call ID 碰撞 | 幂等读取或隔离冲突，保持 source 不变 | physical exactly-once 或 retry 控制 |
| 不可信 approver、伪造 source_ref | 在 profile/lineage 核对中不能成为可信 attribution；结构检查不作为真实性证明 | 新身份管理服务 |
| 回放可复现 | 相同输入和显式 context 产生同样事实/关联；原制品不变，无网络/工具调用 | 新执行或实时采集 |

未来 negative cases 可在单独授权后使用明确标注的合成变体，以核对映射不升级事实；不将这些变体算作新真实 runtime 运行。普通 source 缺少 start/args/auth 时，不把它变成一次要求更广 runtime hardening 的任务。

最低完成声明应是：“固定 source profile 的获准真实记录可以映射至既有 v0.2，已观察字段与 unknown 均保真，lineage 可追溯，结构合规。”不得声称 universal projection、治理生效、独立身份验证或新的物理执行证明。

# Deferred Scope

- full governance system、approval/identity management、delegation、revocation 或新的 policy service。
- LangChain、AutoGen、Cheshire Cat、MCP、OpenAI Agents、Hermes 的实际接入或具体 SDK API 审计。
- live adapter、网络 subscriber、外部模型运行、UI、distributed tracing 与跨系统全局时钟/身份。
- 新 runtime emitter、工具执行器、修改 observer 或为 unknown 字段添加 instrumentation。
- physical side-effect proof、sandbox/OS 安全边界、跨进程 exactly-once、自动恢复/replay。
- 修改 Evidence Schema/validator 协议、runtime seal、manifest、admission gates 或 frozen security scope。

若下阶段必须新增运行时采集或控制才能满足新声明，需另记 `PROTOCOL_REQUIRES_RUNTIME_CHANGE` 并独立授权，不能通过扩大本 projection proof 实现。

# Open Questions

1. 已有真实 DSH 原生采集制品保存在哪里、是否可脱敏用于 proof？本次只核对 emitter 与历史记录，没有取得或认证具体 capture。
2. 该制品能否区分 run/worker/retry？若 observer 行本身缺少这些字段，collector context 是否足以建立不混淆的边界？否则不能强行合并。
3. 固定 DSH 源中 decision.kind 与 tools/result 的精确语义、tools/execute hook 所处位置能否支持所选投影规则？未确认前按上文保守映射。
4. 真实 capture 是否覆盖 block 非执行终态？没有充分来源就只完成有依据的字段投影，不声称真实 blocked execution proof。
5. 是否后续单独授权实现离线投影与必要 proof cases？本任务不构成该授权。

这些是下一实现任务的输入与 profile 核验条件，不要求现在扩展 schema 或开始接新 runtime。本边界设计完成后停止。

本次验证仅包括固定提交文档/validator 的只读检查、本地/远端 spec blob 一致性，以及新增报告的结构和空白检查。未运行 conformance/product tests，未创建 source、fixture、adapter 或依赖。此前未提交文档保持不变；没有 commit、push、PR、branch 切换或私有记录修改。

```text
FILES_CHANGED=docs/development/kerniq_evidence_runtime_projection_boundary_review.md
CODE_CHANGED=false
TEST_CHANGED=false
DOCUMENT_CHANGED=true
IMPLEMENTATION_STARTED=false
PROTOCOL_IMPLEMENTED=false
DEPENDENCY_CHANGED=false
FINAL_STATUS=RUNTIME_PROJECTION_BOUNDARY_REVIEW_COMPLETE_READY_FOR_IMPLEMENTATION
```
