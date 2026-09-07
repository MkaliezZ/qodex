# Executive Summary

任务：KerniQ v0.5.1 LangChain Engineering Proof Source Acquisition Plan。本文仅规划，不创建实验环境、脚本、工具、source bundle、extractor 或 projection。

**推荐：在下一项单独授权的任务中建立一个隔离、预先固定的团队实验，使用未修改的 LangChain `create_agent`、一个普通纯计算工具和一个真实模型，通过单一公开原生事件流调用运行一次，将完整事件按明确的序列化规则归档到本地，再交独立 source qualification。** 不依赖 LangSmith cloud，不注入 callback，不修改 KerniQ 或业务 agent。

当前 [Actual Source Review](kerniq_langchain_actual_source_qualification_review.md) 的 `PENDING_MISSING_EVIDENCE` 保持不变。它表示没有实际 bundle，不是 LangChain 已被判为不可行。本计划也不改变这个判定。

```text
PLAN_STATUS=PROPOSED_FOR_HUMAN_REVIEW
SOURCE_CLASS=TEAM_OWNED_ENGINEERING_EXPERIMENT
SOURCE_ACQUISITION_STARTED=false
SOURCE_BUNDLE_CREATED=false
SOURCE_QUALIFICATION_STATUS=PENDING_MISSING_EVIDENCE
IMPLEMENTATION_STARTED=false
```

本条任务在“最小 bundle 结构，例如：”处结束，没有指定文件名或后续模板。本文沿用项目文档命名，并补充最小流程、验收及停止条件；这些补充不增加实现授权。

# Baseline and Scope Change

本次核对以下五项输入，均保留原文：

| 输入 | 继承的约束 |
| --- | --- |
| [External Runtime Validation Strategy](kerniq_external_runtime_validation_strategy_v0_5.md) | 单一 profile；工程 proof 不等于外部验证；不扩大为 framework support |
| [Source Qualification Plan](kerniq_langchain_source_qualification_v0_5_0.md) | provenance、版本、关联、参数阶段及 unknown 要求 |
| [Actual Source Qualification Review](kerniq_langchain_actual_source_qualification_review.md) | 实际 source 缺失，不能用示例替代 |
| [Evidence v0.2 MVP Spec](kerniq_evidence_schema_v0_2_mvp_spec.md) | 冻结的 request/decision/authorization/argument_binding/execution/outcome 契约 |
| [Runtime Projection Boundary](kerniq_evidence_runtime_projection_boundary_review.md) | 原生记录与治理事实分离，投影不赋予执行或授权能力 |

本地 checkout HEAD 仍是 v0.3.3.3 的 `b743a5727f51986bcafbac4e638af8ad218badbb`；本次不重跑 Runtime Integrity 或 DSH proof。

本轮相对旧计划的变化必须透明：旧计划寻找既有外部应用的现成导出；本轮允许**设计自建实验以取得真实运行记录**。未来为这个新实验预设原生 stream 入口，不等于修改现有业务 agent，也不证明通用零代码 attach。旧计划中“不能新增业务 stream 消费代码仍称既有应用未改”的约束没有被推翻。

| 维度 | Engineering Proof | External Validation |
| --- | --- | --- |
| 实验/应用 owner | KerniQ 团队，明确披露 | 外部 owner |
| 场景 | 预先固定的最小实验 | 外部真实使用场景 |
| Runtime | 第三方原版包，无 fork/patch | 外部运行环境及原有路径 |
| 可支持结论 | 该实验的真实记录可被取得和审查，后续可能投影 | 外部 owner 的真实材料能否复现且有用 |
| 不可推导 | 社区采用、官方支持、外部试用接受、production readiness | 单次反馈也不自动等于 adoption/endorsement |

```text
Projection != Execution Control
Projection != Runtime Trust
Projection != Authorization
Projection != Proof of Physical Side Effect
Decision != Outcome
Authorized != Executed
Blocked != Failed
Unknown != False
Approval existence != Approval attribution
Authenticated != Authorized
```

# Minimal LangChain Runtime Scope

第一个样本只追求一个真实、可关联的成功调用，不建立完整测试平台。

| 项目 | 预先固定的实验要求 |
| --- | --- |
| 环境 | 一个隔离的本地 Python 实验目录/环境，不放进 KerniQ runtime/package 依赖图；安装与运行须下一任务授权 |
| Runtime | 原版 `create_agent`；固定 Python、langchain、langchain-core、langgraph、provider integration 及全部实际解析依赖版本 |
| Agent | 一个新建实验实例，原生 agent loop；运行前固定实验源码/配置摘要，采集期间不改源码 |
| 工具 | 一个普通同步工具，建议两个小整数求和；无网络、文件写入、shell 或外部业务副作用，返回值由真实函数计算 |
| 模型 | 一个真实模型/provider，固定请求 model ID、API 模式和推理参数；不使用 FakeModel、预录响应或 replay transport |
| 输入 | 固定的低敏感输入，要求使用该工具；例如对两个已知整数求和。输入可人为设计，原生执行事件不可人为编造 |
| 调用 | 每个 capture 一次根 agent 调用，目标为一个 tool request/result；根调用内的模型请求前后可能不止一次，不能称“只调用模型一次” |
| 运行设置 | 明确预算、timeout、迭代/递归限制、provider retry 和 cache 设置；只用原生配置，不加控制循环 |

排除 nested agents、multi-agent、MCP tools、provider-hosted tools、custom LangGraph、human approval、HITL middleware、业务系统和持久化 memory。实验的算术函数不是审批模拟器，也不能直接返回预先构造的 ToolMessage 或 Evidence。

“single invocation”是预定实验范围，不是 exactly-once 保证。模型未调用工具、重复调用或发生 retry 时，保留全部原始记录并标为范围未满足/需复核；不能过滤到只剩一次调用。不得为观察结果再直接调用工具，或先 invoke、再 stream 同一输入，把两个执行伪装成同一 run。

具体数值版本和 model/provider 尚未选定，当前都不标为已验证。下一任务 MUST 在首个正式 capture 前提交一套精确锁定的组合与参数；`latest`、版本范围和不明默认值不满足这一入口。若 provider 只提供可变 alias，记录请求 ID、实际返回的 model/revision（若有）和不可固定的限制，不能声称模型权重可重复。

# Source Acquisition Options

SDK-free 在此指不创建/使用 KerniQ Agent SDK、不要求业务 agent 接入 KerniQ；实验自身必然使用原生 LangChain 包。后续离线审查/投影不应 import 源 runtime 或执行其对象。

| 选项 | SDK-free | Runtime unchanged | Machine readable | Reproducible | 判断 |
| --- | --- | --- | --- | --- | --- |
| 原生事件流，在新实验入口消费并本地归档 | 是，无 KerniQ SDK；属于实验入口设计，不是已证明的通用 attach | 原包/工具分发不改；消费者及序列化规则必须公开 | 有条件；事件可能含 Message 对象，不天然是 JSON 字节 | 固定版本、序列化、输入与配置后流程可复现；模型输出不保证相同 | 首选候选 |
| 已存在的本地 native trace/export | 是 | 须核验 producer，不能仅凭“本地”推断 | 取决于真实 export 格式与字段 | 有现成 exporter/version 才可评估 | 可替代；当前未提供，不假设能靠环境变量直接导出 JSON |
| Offline callback capture | 不引入 KerniQ SDK也不代表符合任务边界 | 新注册 callback 会增加采集代码和影响观察路径 | 可以格式化不等于合格 | 与本任务禁止项冲突 | 排除，不设计注入方案 |
| 官方 export 格式 | 格式本身不要求 KerniQ SDK | 取决于获得它的方式 | 须保留完整请求、结果与关联字段 | 格式版本及导出范围可固定 | 格式不是采集机制；不得重写数据去“模仿官方格式” |
| LangSmith cloud 原生 tracing/export | 条件式，无额外业务代码的官方路径可讨论 | 配置、权限、数据流向需核验 | 导出形式需确认 | 依赖账号、服务及导出能力 | 仅可选讨论，非默认，不登录、不启用、不上传 |

官方 [Runnable astream_events 参考](https://reference.langchain.com/python/langchain-core/runnables/base/Runnable/astream_events)描述原生事件字典及 v2 的 run/parent 关联；[streaming 文档](https://docs.langchain.com/oss/python/langchain/streaming)也展示模型工具请求与工具返回的观察路径。由此推荐把 `astream_events(version="v2")` 作为待固定版本核验的首选接口，不将它与 `stream_events(..., version="v3")` 或 updates 格式混为同一 profile。当前没有运行兼容性测试，不能保证选定组合的完整数据形状。

若该接口在拟选版本/普通工具路径中不可用或不能保留完整请求/结果，停止该选型并回到人工确认；不静默改用 private hook、callback 或第二条采集路径。

官方 [observability 文档](https://docs.langchain.com/oss/python/langchain/observability)说明通过配置记录到 LangSmith；这不是本地原始文件导出的保证。[Bulk export](https://docs.langchain.com/langsmith/data-export)涉及存储目的地、Parquet 和服务限制，超出单次本地最小采集需要，不为本 proof 建设该基础设施。

# Native Capture Boundary

未来实验可设计一个**单纯原生 API 消费入口**：调用一次原生 stream、逐条归档、等待该流结束。它是新增实验程序的一部分，必须明确声明 TEAM_LAB_NATIVE_STREAM_CONSUMER，不能冒称已有的官方文件 exporter、external application unchanged attachment 或 KerniQ adapter。

该入口的许可边界仅是存档表示，不是 extractor/projection：

- 不订阅/注入自定义 callback，不发 custom events，不替换 Agent/Tool/Runnable 方法，不截获 dispatch，不做 allow/block。
- 不选择性丢弃原生事件，不按内容改变 agent 行为，不加入治理字段、伪造 ID 或把返回改为预期值。
- 只在原生流外记录 collector 接收序号/时间、进程退出、序列化异常等采集事实；这些不能冒充 native timestamp 或 execution outcome。
- 不为了取得最终 state 再调用一次 agent；若现有流没有足够终态资料，保留缺口，等待资格审查。

**序列化是必须先解决的可行性条件。** 原生事件字典可包含 Message/Chunk 对象；打印 repr、只保存 content、默认 `str(object)` 都不是足够的机器可读归档。官方 [messages 参考](https://reference.langchain.com/python/langchain-core/messages)提供 Message 到字典的转换工具，但不能据此假定任意嵌套对象都可无损序列化。

未来只能使用预先审阅、固定版本的公开序列化能力，将原事件的类型与字段完整表示，保留转换说明。不得转换成其他 provider 的 message schema、只挑模型文本、删除 tool_call_id 或凭摘要还原参数。输出应叫“原生对象的序列化采集记录”，不是“模型 wire bytes”。

若遇到不支持类型、不可表示值、必要字段被 serializer 省略或脱敏：不得用 repr/空值静默替代。标记 capture incomplete/serialization failure，保存已有制品及诊断，停止把该次材料作为合格 success bundle；不在采集任务中发展新的通用解码器。只读审查不得通过 pickle、反射加载或导入构造器恢复对象。

# Provenance Requirements

MUST 表示未来交付的必需信息；缺失时写 UNKNOWN 并按影响决定 pending，不能编造。SHOULD 缺失需写原因，但不自动否定观察性 proof。

| 信息 | 级别 | 记录要求 |
| --- | --- | --- |
| 实验类别/owner/许可 | MUST | TEAM_OWNED_ENGINEERING_EXPERIMENT、采集目的与允许的分享范围；不是批准人证据 |
| Runtime 与依赖 | MUST | Python/OS/架构、精确解析版本、可复现依赖锁定资料；至少覆盖 langchain/core/graph/provider/serializer |
| 实验源码/工具/入口身份 | MUST | 运行前固定快照及摘要，采集后对照不变；不包含现有业务代码改写 |
| 执行配置 | MUST | 工具定义、输入/prompt、模型/provider/API 模式、推理参数、retry/cache/timeout/预算及 stream 版本；不收集 secret 值 |
| Source format/serializer | MUST | 原生事件格式版本、archive representation 版本、公开序列化方法与版本、任何转换规则 |
| Producer identity | MUST | 分开记 native producer、实验入口/归档者、operator 与版本；collector identity 不等于 runtime admission 或 approver |
| Capture timestamp/range | MUST | collector UTC 起止时间、正常结束/异常退出/截断状态；原生未给时间就 UNKNOWN，不回填 |
| Tool/run correlation | MUST | 保留原 run_id/parent_ids、模型 call ID、ToolMessage 关联及原始定位；不存在的 session/attempt ID 保留 UNKNOWN |
| 完整性/变换说明 | MUST | 采样、过滤、丢失、脱敏、缓存和 retry 的实际记录/未知状态；错误/未命中预期的 run 不能隐去 |
| Bundle digest | MUST | 逐制品字节摘要、大小、完整列表和可无循环计算的根摘要；见下节 |
| Provider 返回版本/request ref | SHOULD | 若响应提供则保留；缺失不推定 snapshot 固定，也不以账号证明身份 |
| 独立重复运行 | SHOULD | 另一次相同锁定环境下的真实运行、独立 bundle，不要求输出相同；不在当前任务执行 |
| Source 语义依据 | MUST | 与目标版本匹配的公开事件/序列化定义引用；不能只引用滚动 latest 文档作为实际版本证明 |

提供命令/配置记录时仅包含明确列出的非敏感项，不归档完整 env、home directory、认证头或 API key。优先预设低敏感工具与输入，避免采集后才修改原始事件。确需脱敏时原件与分享副本分离，并保留变换说明；脱敏摘要不是原参数 digest。

# No Fake Evidence Boundary

| 材料 | 为什么不能替代真实 source |
| --- | --- |
| README/官方示例的输出 | 说明接口，不证明本次运行 |
| 人工编辑 JSON、手写 fixture | 即使结构正确也不证明来源；不能把预期结果写成原生事件 |
| transcript、终端截图、人工整理日志 | 可能缺少类型、原始关联、完整参数和发出时点，不能作为主要 source |
| 从 LLM 答案复制的 tool result | 模型叙述不证明 runtime 产生了相应工具请求/返回 |
| FakeModel、录制回复回放、直接调用工具后拼接消息 | 可用于其他 synthetic 测试，不证明真实模型经原生 agent loop 的路径 |
| 修改一次 capture 以模拟 deny/failure | 只能是明确分离的 synthetic robustness case，不是真实执行/阻断证据 |

自建小工具、固定输入和已知算术答案本身不使实验变假：关键是实际原生 agent 运行、实际模型响应及真实工具调用产生记录。答案可预测不等于可以手写输出。归档后不得编辑 `raw/`；说明/索引应在独立文件，任何修订形成新制品并保留原引用。

实验未配置 human approval 时，不生成授权引用、可信身份或 AgentFuse 决定。success、on_tool_start、on_tool_end、ToolMessage 和进程退出均不能自动证明 release、实际工具入口、executed arguments 或物理副作用。

# Source Bundle Format

下面只是未来目录设计，**本次不创建这些文件或伪造样例**。文件名可在审批时固定；此归档格式不是 Evidence Schema v0.2 或新公共协议。

```text
engineering-source-bundle/
  manifest.json
  bundle.sha256
  raw/
    native-events.jsonl
  context/
    runtime-versions.json
    dependencies.lock
    execution-config.json
    invocation-input.json
    experiment-snapshot.txt
    serialization-profile.md
    provenance.md
  capture/
    session.json
    receipts.jsonl
    diagnostics.jsonl
  review/
    coverage.md
```

职责：

- `raw/native-events.jsonl`：每条记录是原生 event 对象按固定 serializer 得到的完整 JSON 表示；保留原类型和字段，不插入 KerniQ decision/evidence 字段。必要的 serializer 类型标记须说明，不叫原生 wire format。
- `receipts.jsonl`：归档者的记录序号、接收时间和 raw 位置，属于 collector metadata，不制造 native event/run/attempt ID。无 native timestamp 时不把接收时间填成执行时间。
- `session.json`：实验/collector capture identity、开始结束、流耗尽/异常/超时/写入失败、退出信息。正常退出不能替代工具终态，进程中断不能推出 not_executed。
- `runtime-versions.json` 与 `dependencies.lock`：所运行环境的实际解析版本和可复现安装依据，不能只保存未经解析的范围约束。
- `experiment-snapshot.txt`：未来获准实验的源码/工具/入口原样快照及其身份说明；这是新实验，不是修改业务 agent。当前不写源码或此快照。
- `execution-config.json`/`invocation-input.json`：实际使用的非敏感配置与输入。计划值与实际值须区分，不根据输出回填配置。
- `serialization-profile.md`：事件 API、格式/版本、serializer、观察边界、类型保留和错误策略；不存在字段记未知，不补齐。
- `coverage.md`：只读审查者的 source 定位及覆盖/缺口。它是解释材料，不是原生事件，不是自动提取或 projection 输出。

Manifest 最小字段类别：bundle format version、source class、producer/profile 引用、capture 引用、文件清单（相对路径、字节数、SHA-256）、说明版本。没有实际值前不生成一个看似真实的 manifest。

根摘要采用无循环方案：manifest 列出所有 payload 文件的字节摘要和大小，但不列自己与 `bundle.sha256`；`bundle.sha256` 记录最终 `manifest.json` 原始字节的 SHA-256。校验时同时核对 manifest 根摘要、全部清单文件和未列入文件；拒绝路径越界或链接到 bundle 外部。此规则仅界定制品，不是 runtime seal 扩展，也不认证操作者；篡改者能重算摘要，所以不能宣称真实性由 hash 自动证明。

如果发生归档失败，保留为 incomplete bundle，不修补遗漏事件或伪造正常结束。初版一个 bundle 只装一次根调用；再次运行另建目录和 manifest，不混合去重成一次运行。

# Acquisition Workflow

以下步骤全是待单独授权的实施范围，本次不执行。

| 步骤 | 动作 | 输出/停止条件 |
| --- | --- | --- |
| 1. 实验授权与锁定 | 批准新实验、一个 provider/model、预算、数据去向、依赖组合及单一原生流/serializer | 明确实验计划；版本/API/序列化不可固定则不开始采集 |
| 2. 隔离准备 | 在独立环境准备原版 runtime 和新实验入口，不改变 KerniQ 或业务应用；冻结输入和源码/配置 | 精确依赖与实验基线；需 patch/private hook/callback 则停止 |
| 3. 单次真实运行 | 从原生 stream 入口调用一次 agent，完整消费并逐条归档；不附加另一轮 invoke 获取结果 | 成功或失败的真实 source；模型不调用/重复调用也原样保留，不自动重试直到成功 |
| 4. 结束与封存 | 记录退出/流状态和异常，关闭制品，完成文件摘要与 manifest | 能被只读定位和校验的 bundle；部分记录只能标 incomplete |
| 5. 只读资格审查 | 核对版本、provenance、未修改原包、请求/结果关联、参数时点和缺口 | QUALIFIED_FOR_LIMITED_PROOF / QUALIFIED_FOR_PROJECTION / REJECTED / PENDING_MISSING_EVIDENCE，依据真实材料决定 |
| 6. 停止 | 交付 source 与资格报告，等待投影任务授权 | 不运行 Evidence validator 宣称 source 已认证，不创建 extractor/projection |

“可复现”分开记录：固定包/实验/配置可复现，原生调用流程可复现，同一制品字节可校验；模型的内容、ID、时延甚至工具调用选择不保证相同。相同输入或 temperature=0 不能保证逐字节同样运行。是否需要第二次真实运行须另设预算，所有尝试均保留，而非挑选成功样本隐去失败。

首个 success bundle 只解决最小正向 source 的缺口。v0.5 strategy 的完整工程 proof 仍要求合适的真实负面/不完整路径和后续 projection 验证；本计划不靠人工改日志补负面结果，也不增加审批系统制造 block 演示。

# Acceptance and Stop Conditions

未来 source 可交审的最低条件：

1. 原版 runtime、实际解析版本、实验源码和执行配置可核对；KerniQ/schema/validator 无变化。
2. 原生机器可读记录来自真实模型及原生 agent loop，包含至少一个可关联模型 tool request 与工具返回；原 ID 与层级不被丢弃。
3. 存在可定位阶段的真实 requested arguments；effective/executed、审批、身份和入口未观察时如实 UNKNOWN，不为填满字段加 instrumentation。
4. 原生 run_id 与 tool_call_id 不互相冒充；如果完整 trace 仍无法解释二者关联，停止当前资格判断，不按同名或时间最近猜测。
5. Provenance、capture 范围、序列化、退出/丢失状态和摘要满足要求，原生记录与操作者说明分开。

停止项：需修改业务 agent/KerniQ/runtime；需 callback/middleware/monkey patch；无真实模型预算/许可；必须启用未获准云端 tracing；无法保留必要 Message/ID；需要自定义语义转换才能“取得原始 source”；关键来源字段未知；采集失败却无法明确界定缺口。停下时报告具体原因，不重新设计 Agent SDK 或扩大安全范围。

原生格式没有 physical-entry evidence 不是失败理由，但必须限制最终 claim。归档成功也不等于资格 PASS；资格 PASS 不等于 Evidence Validator PASS；后者仍不等于执行控制、外部用户验证或采用。

# Decision and Handoff

建议批准的下一任务是：**隔离团队实验的真实原生 source 采集及只读资格审查**，先冻结精确版本、provider 配置和序列化边界。不是直接开发 LangChain projector 或 adapter。若不批准实验入口的原生事件消费/归档，则本地采集路径仍待定，只能等待既有获准 export，不能用 callback 绕过。

```text
CODE_CHANGED=false
TEST_CHANGED=false
DOCUMENT_CHANGED=true
IMPLEMENTATION_STARTED=false
SOURCE_ACQUISITION_STARTED=false
SOURCE_BUNDLE_CREATED=false
PROTOCOL_CHANGED=false
DEPENDENCY_CHANGED=false
SOURCE_QUALIFICATION_STATUS=PENDING_MISSING_EVIDENCE
EXTERNAL_VALIDATION_OBTAINED=false
FINAL_STATUS=LANGCHAIN_ENGINEERING_PROOF_SOURCE_ACQUISITION_PLAN_COMPLETE
```

本任务仅新增本文，未修改五项输入、runtime、Evidence Schema 或 validator；未安装依赖、运行 agent、调用模型、接入 LangSmith cloud、创建 source/fixture、commit 或 PR。完成后停止，等待人工 review 和后续明确授权。
