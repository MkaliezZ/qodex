# KerniQ External Validation Pilot Track v0.6 Design

## 1. Executive Decision

**设计可行，推荐 GO_TO_SOURCE_QUALIFICATION_BEFORE_IMPLEMENTATION。** 独立审查认可总体方向；当前只授权 Pre-Pilot Source Qualification 阶段，不授权 pilot 实现或 pilot outreach。本次任务仅修正文档，source qualification 尚未开始，也不发送任何请求。采用一份伙伴自有真实 source、一个经资格审查的固定 profile、一次本地验证和一份默认不含业务内容的结果 artifact。不得把团队固定样本换一个操作者运行就算外部验证。

这是 external validation / evidence track milestone，不是整个 KerniQ 产品 release v0.6，也不重编号历史产品 v0.6.x。

基线实际核验：`origin/main=1eabd5fdca94e000bc462a78be84ceb701bf7c00`，与任务固定起点相同。相对 v0.5.2 freeze commit `99e0e49c8e2cacfab53f4a9d08112b010c3e9720`，只有 README 中英文更新和 PR #29 merge；没有新 runtime/schema/protocol milestone。工作树起始干净。

本设计依据 main 中以下资料，不以聊天历史代替源证据：

- [README](../../README.md)：desktop-first、vendor-neutral control plane；GOVERNED / OBSERVED / OPAQUE；SDK-free 方向与版本 track。
- [v0.5.2 freeze](kerniq_evidence_projection_v0_5_2_freeze.md)：当前已接受与禁止的 claims。
- [Evidence v0.2 MVP spec](kerniq_evidence_schema_v0_2_mvp_spec.md) 与 [conformance proof](kerniq_evidence_schema_v0_2_conformance_proof.md)：规范与结构验证边界。
- [Projection boundary](kerniq_evidence_runtime_projection_boundary_review.md)、[DSH proof](kerniq_evidence_projection_dsh_v0_1_proof.md)、[LangChain limited proof](kerniq_evidence_projection_langchain_limited_v0_5_2_proof.md)：已有映射和缺口。
- [F-01 disposition](kerniq_langchain_f01_limited_profile_review_v0_5_1.md)：有限来源例外不修复完整 capture。

任务提及的 external runtime validation strategy 文件不在此 main 的 tracked 文档中，未把其他工作区草稿当作已合并依据。当前未取得 PraisonAI 样本或从该仓库确认联系人互动历史。

**关键准备缺口：** source format 待伙伴样本；PraisonAI 不处于可运行状态；10 分钟只是设计预算，未实测。GO 仅指进入来源资格审查，不是 implementation GO 或“kit 已就绪”。执行顺序冻结为：

```text
Design -> Human / Architecture Review -> Source Qualification
-> Receive real external-owned source format/sample
-> Review producer/version/correlation semantics
-> Freeze ONE qualified external profile
-> Separately authorized Minimal Pilot Implementation
-> 10-minute usability test -> Separately authorized Pilot Outreach
-> External Run -> Artifact Verified
```

不得先实现 CLI/parser 再找 source 或补定义语义。资格审查/冻结未通过时，后续实现、试用邀约和外部成果状态均不能提前推进。

## 2. Goal

让一位项目外开发者，在自己的真实项目/source 上独立运行验证，并收到自己也有价值的、机器可复核的观察与缺口说明。一个 root run 中至少一个可关联 tool request 和 tool observation/result 即可，不要求证明完整 agent 图。

目标从获取 kit 开始到生成首份本地结果不超过 10 分钟，理想不超过 5 分钟。raw 不上传，KerniQ 团队不代跑。首轮验证“可用来源能否忠实表达”，不是新增治理能力。

保持冻结状态：

```text
EVIDENCE_V0_2_CONFORMANCE_PROVEN=true
DSH_OFFLINE_PROJECTION_PROVEN=true
LANGCHAIN_LIMITED_OFFLINE_PROJECTION_PROVEN=true
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
```

## 3. Non-goals

不创建第三个 runtime proof，不 harden LangChain，不新增内部 fixture 来冒充 external run，不设计 Agent SDK、framework replacement 或 upstream integration proposal。没有云服务、执行控制、自动审批、runtime seal 扩展、身份系统或物理副作用证明。

不修改业务 agent、Evidence v0.2、core validator、AgentFuse、agent loop、dispatch 或 approval lifecycle。本次只新增本文；不实现任何 kit、命令、parser 或 helper。

## 4. External Validation Definition

以下条件必须同时成立；UNKNOWN 不得通过门槛：

| 条件 | 所需依据 |
| --- | --- |
| VALIDATOR_OPERATOR_EXTERNAL=true | 实际操作者独立于 KerniQ 团队；伙伴确认及已有沟通渠道支持，不能只信 JSON 自报 |
| SOURCE_OWNED_BY_EXTERNAL_PARTY=true | 伙伴拥有/获权使用该项目及 source；并非 KerniQ 团队为其造的例子 |
| SOURCE_NOT_CREATED_BY_KERNIQ_TEAM=true | 原始 run/trace 由伙伴真实工作流产生；KerniQ 可以提供 kit，不能构造输入证据 |
| REAL_AGENT_OR_RUNTIME_SOURCE=true | 机器可读 source、producer/version/capture 范围、至少一条真实 tool 调用链 |
| EXTERNAL_PARTY_EXECUTES_VALIDATION=true | 伙伴自行运行固定 kit，并在本地重新核验同一 source/artifact |
| RESULT_ARTIFACT_MACHINE_VERIFIABLE=true | 结构、摘要、版本、profile 规则、结果一致性及本地 source 绑定核验有记录 |
| NO_MANUAL_FIXTURE_FABRICATION=true | 无手工拼接事件、模拟 PASS 或用 synthetic fixture 替代真实材料 |
| NO_KERNIQ_TEAM_EXECUTES_ON_PARTNER_BEHALF=true | 团队可解释步骤，但不远程代操作、不拿到 source 代跑 |

不计入：README review、issue 回复、star、设计赞同、运行团队 fixture、截图、手工 PASS、纯人工审查。独立审查团队工程 proof 也不等于外部使用验证。

这是**伙伴归属经过审查、机器结果经过核验的 bounded validation**，不是对抗恶意操作者的远程执行认证。hash 不能证明外部身份或历史真实性；归属/操作者依据必须与 artifact 技术核验分开记录。缺失时仅保留 artifact，不升级成果。

## 5. Adoption Signal Ladder

每次状态迁移记录时间、依据引用和核验人；状态历史追加，不覆盖失败或拒绝。材料可先收到，但条件未满足不得伪造前序状态。

| 状态 | 进入条件 |
| --- | --- |
| OUTREACH_SENT | 经单独授权实际发送了该 pilot 的小请求，保存私有发送引用 |
| REPLIED | 收到真实回复；不等于接受试用 |
| TRIAL_ACCEPTED | 明确同意自行试跑一个自有 source；不等于运行 |
| EXTERNAL_RUN_STARTED | 伙伴报告 validation 启动并给出本地 invocation 引用；不是开始 agent run 就算开始验证 |
| EXTERNAL_RUN_COMPLETED | 本地验证进程结束并产生结果，成功/部分/诊断分别记录 |
| ARTIFACT_RECEIVED | 实际收到机器可读 artifact，而不是截图或聊天 PASS |
| ARTIFACT_VERIFIED | 收件侧格式/摘要/版本/claim 核验 + 伙伴本地 source 重核结果 + 第 4 节条件成立 + 最低有用来源链成立 |
| WILL_REUSE | 已查看结果后明确愿意在具体下一 run/project 继续使用，或提供真实二次使用的依据；初次试用同意不算 |

`FIRST_EXTERNAL_VALIDATION_SIGNAL` 最早是一个符合上述条件的 `ARTIFACT_VERIFIED`。仅校验摘要通过但 source 归属未知，或结果只有 UNSUPPORTED_SOURCE，不能计入此 KPI；可单列 diagnostic artifact verified。

`FIRST_ADOPTION_SIGNAL` 最早是结果后的具体 `WILL_REUSE`；这是早期意愿信号，不等于 production adoption。真实第二次独立使用单列 repeat-use evidence。不得自动将单次 WILL_REUSE 写成 `ADOPTION_PROVEN=true`。

另保留 DECLINED、WITHDRAWN、VALIDATION_BLOCKED、ARTIFACT_REJECTED 分支，不把它们改写为成功主链。未记录 outreach 的主动来访单列 inbound origin，不补造 OUTREACH_SENT。

## 6. Pilot UX

伙伴只做：取得已资格审查的 kit、选择自有 source、执行一次本地验证、查看并自行决定是否分享结果。kit 应是包含依赖的固定验证工具，不要求安装完整 desktop 或重建 agent 环境；下载/安装时间计入预算。若无法提供这种低摩擦分发，先缩减目标 OS/环境，不要求伙伴调试依赖。

下列仅是未来交互名称示意，不是现有可运行命令：`kerniq validate <source>` 生成 artifact；`kerniq verify <artifact> --source <source>` 在伙伴本机核验来源绑定。对方不用接触 Python 源码、编辑业务脚本或填写 PASS。

| 时间 | Partner action | Validator action | Output | Possible failure |
| --- | --- | --- | --- | --- |
| Minute 0-2 | 获取固定 kit，阅读无需上传的短说明 | 离线可用性/平台/版本检查；不访问项目外文件 | kit identity、当前路径资格 | 下载慢、平台不符；停止计时并记失败，不隐藏 setup |
| Minute 2-5 | 选择已有获权 source；确认 owner 与范围 | 只读大小/格式/版本/digest/profile 预检 | source identity、profile match 或明确拒绝 | 无 profile、无导出或敏感 digest 不可分享 |
| Minute 5-8 | 执行一次验证 | 本地 source 映射、原 validator 检验、结果与缺口生成 | 本地 result artifact + 简短人类摘要 | 截断、关联不明、I/O/校验错误；不调用模型补齐 |
| Minute 8-10 | 本地 verify，检查分享预览并可选择返回文件 | 重算 source/artifact digest、复算派生结果；不自动发送 | verify receipt、可分享最小 artifact | 不一致或隐私检查不通过；不发送、不计成功 |

Path A 优先满足该旅程。Path B 只有可拆卸 helper 已按固定版本准备好、伙伴正常 run 能在同一时间预算内产出 source 时才进入试用；agent 运行时间也计入，不能排除等待模型的时间来制造达标。超过 10 分钟没有首个有用结果即 friction gate 不通过；超过 30 分钟终止本轮。

`TARGET_TIME_TO_FIRST_RESULT_MET=false` 表示**当前未测量，不能宣称已达标**，不是已观察到超时。设计预算为 10；只有 profile 已冻结、minimal kit 已在单独授权后实现，才能进行 10 分钟 usability 实测，然后才申请 pilot outreach。真实首轮必须另记耗时；不能把准备就绪前的 schema 协商隐藏成一个已经成功的 10 分钟体验。

## 7. Input Paths

**Path A: Existing Native Source Bundle（默认）**

- 接受一个伙伴已存在的 JSONL/结构化 export/bundle，或其已有原生 stream 的既有归档；“JSONL”本身不构成支持声明。
- 限一个固定 producer/version/format 的 root run；原 call ID 和 request-result 关联不能靠同名/相邻时间猜测。
- 输入 read-only、immutable、digest-bound；不执行 source 中代码、imports、references 或 shell 字符串。大文件、越界引用、链接到 bundle 外的制品拒绝，不递归扫整个项目。
- 验证开始/结束重核字节摘要；变化则拒绝混合快照。单文件摘要为原始字节 SHA-256；多文件用固定 profile 的有序路径/长度/SHA-256 清单摘要，覆盖 metadata 与 raw，排除结果输出。
- 未知格式返回 UNSUPPORTED_SOURCE，不选择“最像”的 parser。截断与不支持结构显式报告，不能静默 repr fallback 或删除事件造完整来源。

**Path B: Minimal Capture Helper（条件式备选）**

- 仅在一个固定 runtime/version 的官方 native hook/event stream/plugin seam 经只读核验后，外置、可卸载地做 capture/export；不控制 agent、工具或审批。
- 优先启动配置或已存在 exporter 的外置消费者；如果必须往核心业务脚本加入 callback/import，或包裹每个 tool，判为 UNSUPPORTED_PILOT_PATH。
- 原运行的模型请求由伙伴原有应用负责；validation 自身不发模型请求、不重放 tool。helper 不新增调用来补证据。
- helper 必须主动报告 unsupported serialization、丢失和截断；fail 或 mark incomplete，诊断不能为空却把降级报完整。每次新目录，旧 source 不修改。
- 当前没有确认 PraisonAI 存在此入口，不声称 helper 可用；Path B 不作为首轮的强制依赖。

## 8. Source Profile Strategy

首版只预留**一个 partner-qualified profile**，不是一个通用框架名称；第二个 profile 属于后续独立范围，需另行批准和实际来源需要。固定 producer/runtime/version、source representation、关联语义、支持的 record 形状、缺口及拒绝规则。固定的是格式边界，不是团队样本答案或伙伴 run ID。

| 候选来源 | 可否直接作为外部 pilot | 处置 |
| --- | --- | --- |
| 现有 LangChain limited profile | 否，它固定团队 bundle digest 和 run/call IDs | 保持冻结，不换 pins 接受伙伴 source，不伪称外部验证 |
| 现有 DSH observer profile | 只有伙伴本来就有符合已审查 producer/version 的自有原生 capture 才可重新资格审查 | 不替伙伴部署团队实验再冒称自有 run；不扩展 DSH semantics |
| PraisonAI native export | 未知 | FIRST DESIGN-PARTNER CANDIDATE；SOURCE_FORMAT_PENDING_PARTNER_SAMPLE |

样本入口条件是伙伴提供真实可用的 format/version 信息及本地结构诊断；原始业务 source 可始终不离开伙伴机器。必要时伙伴自行选择低敏真实 run 的最小样本，自愿分享并明确变换范围；不能要求敏感 raw 上传作为必要步骤。如果没有足够非敏信息可完成格式审查，保持 pending 或换候选，不凭空设计 PraisonAI schema。

未来 qualified profile 如需 source-specific 映射，仅作为离线记录解释进入现有 Evidence v0.2；不能复用错误语义或修改旧 frozen profile。若所需事实无法用既有契约表达，停止，不在 pilot 中扩 schema。人工资格审查、明确的 profile freeze 和单独实现授权完成前不实现 parser。

## Pre-Pilot Source Qualification

本阶段只回答：**CAN_A_TRUTHFUL_PROFILE_BE_BUILT=true/false**。结论必须来自外部自有真实 source 的资格审查；当前没有样本，尚不能判为 true，也不把“未审查”写成“不可能”。这是来源准备阶段，不是 pilot trial、external validation 或 adoption。

```text
SOURCE_QUALIFICATION_REQUEST_SENT
-> SOURCE_FORMAT_RECEIVED
-> SOURCE_SAMPLE_RECEIVED
-> SOURCE_SAMPLE_QUALIFIED
-> PROFILE_FREEZE_READY
```

| 状态 | 必需事实；不能推导的下一步 |
| --- | --- |
| SOURCE_QUALIFICATION_REQUEST_SENT | 实际发送仅索取来源资格资料的请求并记录引用；本任务未发送 |
| SOURCE_FORMAT_RECEIVED | 已收到 producer/runtime/version 和原生 export/trace 格式资料；格式说明不等于真实样本合格 |
| SOURCE_SAMPLE_RECEIVED | 已收到可审查的外部自有真实 tool-call 样本/非敏摘录及来源、范围说明；结构示例或手写 fixture 不替代真实 source |
| SOURCE_SAMPLE_QUALIFIED | QGATE_1 至 QGATE_7 全部通过，有明确 request 到 tool observation/result 的关联依据，无需 repr 或猜测 |
| PROFILE_FREEZE_READY | 样本已合格，下述 freeze 清单完整、无未决语义，可交人工正式冻结；ready 不等于已冻结或已授权实现 |

资料同批到达可以逐项核验，但不得仅因收到回复就跳到 qualified。缺失或未知 gate 保持 pending；任何必要 gate 不通过，`SOURCE_SAMPLE_QUALIFIED=false`、`PROFILE_FREEZE_READY=false`。当前阶段已授权但尚未执行，所有请求/样本状态均不能自动标为完成。

**Source qualification activity is not an adoption signal.** 此状态链及其请求记录必须与第 5 节 pilot/adoption funnel 分开。它不自动增加 OUTREACH_SENT、TRIAL_ACCEPTED、ARTIFACT_VERIFIED、WILL_REUSE，也不使 EXTERNAL_VALIDATION_PROVEN 或 ADOPTION_PROVEN 变成 true。第 18 节的 qualification 等待指标只记录准备耗时，不计入 pilot 转化或主 KPI。

### 最小资料请求与隐私

未来首个 PraisonAI source qualification 请求只需要：producer/runtime version、native trace/export format、一个真实且已脱敏的 tool-call sample。不要求试用尚不存在的 validator，也不宣称 PraisonAI supported、profile/validator 已存在或 pilot ready。

不便提供 raw 时，可先提供 version、format description、structural schema/field sample 或 non-sensitive excerpt。仅格式说明只能推进 SOURCE_FORMAT_RECEIVED；只有真实来源依据及摘录足以审核 essential fields 和明确 ID/lineage 关联时，才能推进 SOURCE_SAMPLE_QUALIFIED。脱敏范围必须披露；如果脱敏破坏关联而无法审核，继续 pending，不要求上传敏感 raw，不以人工解释或团队造样本填空。

### Source Qualification Gates

| Gate | 通过条件 |
| --- | --- |
| QGATE_1 - Producer Identity | producer/runtime/version 固定明确，source representation 可识别；名称不是 runtime trust/身份认证 |
| QGATE_2 - Native Source | source 来自伙伴真实 agent/runtime run，有归属/采集范围依据，不是 KerniQ 团队 fixture 或手工补写事件 |
| QGATE_3 - Correlation | request 到 tool observation/result 由明确原生 ID/lineage 关联；禁止按时间相邻、同名工具或参数相等猜测 |
| QGATE_4 - Serialization | essential fields 完整结构化可读；禁止 repr parsing、string heuristic、unsupported-object silent fallback；排除与缺口显式记录 |
| QGATE_5 - Evidence Mapping | known/unknown/refusal 可以在冻结 Evidence v0.2 与原 core validator semantics 下表达，NEW_SCHEMA_REQUIRED=false |
| QGATE_6 - SDK-Free | 不修改 business logic、framework core 或 tool implementation；仅既有获审查外置读取/导出路径 |
| QGATE_7 - Privacy | validation 可 local-only，来源资格审查不要求上传敏感 raw；非敏资料足够支持必要语义判断 |

**全部通过且 freeze 清单齐备后，PROFILE_FREEZE_READY=true；否则 false。** 暂无合格样本不等于路线失败，但禁止实现过程中边写 parser 边决定语义。若发现必须改 Evidence schema、core validator semantics、runtime 或 governance protocol，立即停止并记录 ARCHITECTURE_CHANGE_REQUIRED=true、FINAL_RECOMMENDATION=REDESIGN。

### Profile Freeze Before Implementation

正式冻结必须先于实现，至少记录：profile_id；producer/runtime；version；source representation；supported event/record shapes；correlation rules；required source fields；known mappings；unknown mappings；refusal rules；truncation/incomplete behavior；source digest representation。

冻结记录应有审核依据及精确版本，只覆盖 ONE qualified external profile。PROFILE_FREEZE_READY 是进入人工冻结的门槛，不是实现授权。source profile 的语义与 source digest representation 在此确定；新 result artifact 的 canonicalization 属于另一层，可按第 11 节在 implementation proof 单独冻结，不能借此延后 source 语义决定。

## 9. SDK-Free Boundary

`SDK_FREE=true` 是设计约束，不是任意 runtime 已可零代码接入的证明。允许已有 native hooks/streams、官方 plugin seam、外部 helper、只读 processor；不允许继承 KerniQ 类、业务逻辑 import KerniQ、逐工具 SDK 包装、重写应用或 framework fork。

这里的 kit 是外部离线验证工具，不是 Agent SDK。保持 existing runtime 的 agent loop、tool registry、physical execution ownership 不变；治理只在已有受审查 seam 存在时有依据，离线验证不新增该 seam。

## 10. Artifact Contract

建议单一分享文件：`external-validation-result.json`。这是**新的 pilot 结果封套格式**，不是改写 Evidence v0.2，不将封套送进 core Evidence validator。封套检查器只校验工具版本、结果类别、派生摘要和 claim allowlist；内部 Evidence 仍由原 validator 校验。

下表为设计字段，无真实 artifact 在本任务生成。未知值为 null/unknown，不填示例 PASS：

| 字段 | 类型/最小约束 |
| --- | --- |
| pilot_version / artifact_version | 固定非空版本字符串；未知版本拒绝 |
| validator_version / validator_digest | kit 版本和代码分发摘要；另记录 frozen evidence validator 版本/摘要，不把自报版本当认证 |
| profile_id / profile_version / profile_digest | 固定已审查 profile 身份；未匹配时 null，并返回 unsupported |
| source_digest | algorithm=sha256、representation、value；覆盖精确原件，无法读取时 null |
| source_reference_type | single_file / bundle_manifest；不含绝对路径或 URL |
| source_format_version / producer_version | 原生可得值或 null；不猜测 |
| operator_class / source_owner_class | external / team / unknown；是 declaration，不是 trusted identity |
| provenance_basis | partner_declaration 等受限枚举和不含 PII 的私有审查引用；不承载任意自由文本 |
| validation_started_at / validation_completed_at | 工具记录 UTC；不是工具执行时间、可信远端时钟或身份依据 |
| duration_ms / validation_id | 非负整数；本次本地 validation 标识，不伪装 runtime call ID |
| result | 第 13 节固定枚举；不等于 tool outcome |
| claims_proven / claims_unknown / claims_refused | 固定 claim ID 数组，互斥；proven 仅限该 profile 来源语义 |
| claim_checks | 每项 claim 的 source-relative locator、规则 ID、检查结果；不含 prompt/args/result 原文 |
| capability_assessment | GOVERNED / OBSERVED / OPAQUE，限定 reviewed scope；无治理证据不得填 GOVERNED |
| evidence_validation / local_replay_verification | pass / fail / not_run / unknown；派生结果稳定摘要及理由码，不携带 bearer authority |
| diagnostics | allowlisted code、severity、count、相对记录序号；禁止原异常全文/traceback/业务值 |
| exclusions / share_policy_version | 不支持/脱敏/未覆盖的范围及隐私规则版本，不能隐藏跳过事件 |
| artifact_digest | algorithm=sha256、canonicalization 标识、value；排除自己计算，见下节 |

伙伴本机可保留完整 Evidence/source 映射用于复查；分享封套是其受限投影，不要求上传完整 Evidence 对象，因为 source_ref、action_name、错误详情本身也可能敏感。分享层隐藏某值不允许重写本地 Evidence 的 known/unknown。

## 11. Artifact Integrity

采用 **Option B**：本阶段只冻结确定性 artifact serialization 要求，不再定义自创 canonical JSON 标准。具体 canonicalization profile 在单独获授权的 implementation proof 中选择、验证并冻结；在其冻结前不能声称 artifact 字节摘要已具备跨实现可复核性。

```text
DETERMINISTIC_ARTIFACT_SERIALIZATION_REQUIRED=true
CANONICALIZATION_PROFILE=TO_BE_FROZEN_DURING_IMPLEMENTATION_PROOF
```

保留 source digest、artifact digest、profile version/digest、validator version/digest 及确定性派生结果要求。未来方案必须明确摘要覆盖范围、artifact_digest 自引用排除方式及固定实现测试，不修改 raw source、Evidence v0.2 或既有参数 digest representation；不在本任务决定新的排序、转义或数值编码标准。

artifact digest 绑定结果封套，具体字节规则以上述待冻结 profile 为准；摘要自身不递归包含在摘要输入中。源码、profile、分发包各自摘要从固定发布清单核对；该清单随 kit 本地取得，验证时不联网下载任意声明的版本。带时间戳的两次 artifact 不要求字节相同；同一输入/上下文的派生 claim 结果应稳定，local replay 比较排除时钟等 run metadata 的结果部分。

核验分两层：

1. **收件侧无需 raw**：严格解析、重算 artifact digest、检查预先取得的 validator/profile 清单、claim/结果一致性与隐私字段；只证明 artifact 内部一致和声明所指版本可识别。
2. **伙伴本地持有 raw**：重算 source digest、用固定 kit/profile 重跑离线映射与原 validator，比较 source binding 和派生结果，生成不含 raw 的 verify receipt。伙伴仍自己执行，不由团队代跑。

**不可过度声明：** 自带 hash 不能防止改内容后重算，也不能证明代码真的由声明版本运行、外部人真的操作过或历史 source 真实。收到后另保存首次接收的 artifact digest，可发现相对该留存基线的变化；没有独立摘要基线时只能说 self-consistent，不能说“从未修改”。不引入 PKI、签名云、账户或认证体系。

ARTIFACT_VERIFIED 必须同时满足技术检查与独立记录的外部归属/操作者审查。伙伴 local receipt 仍是有来源的声明，不是远程 attestation；不能用 receipt 中一个 `external=true` 自动通过归属门槛。要求对抗恶意自报时，本 pilot 不提供该级别证明，不扩大安全架构。

## 12. Privacy Model

`LOCAL_ONLY_VALIDATION_REQUIRED=true`。kit 获取可由伙伴下载；安装后验证与 verify 不出网、不遥测、不自动上传、不读取 credentials。Path B 的原 agent 可能按原配置调用 provider，这不是 validation 新增数据外传，须明确区分。

默认不分享 raw source、prompts、API keys、客户数据、business payload、绝对敏感路径、provider credentials 或完整本地 Evidence。只分享经预览同意的结果封套、整份 source digest、必要固定诊断码和 profile metadata。原始 native event/run IDs 可能是标识符，默认用 artifact 内相对记录序号；本地保留关联映射，不把匿名化 ID 当原生身份。

source digest 也可能泄露关联，短小/低熵材料存在字典猜测风险；默认不分享单参数 digest。若伙伴认为整份 source digest 也敏感，可不分享并退出该次远程核验；不得自动上传 raw 补证。可另选伙伴原有的低敏真实 source，但不能修改旧原件或手造样本。

输出目录由伙伴指定且在 source 外；只创建新结果文件，不覆盖旧 source/artifact。不在 repo 收集联系人、客户身份或原件。项目侧如未来获准记录归属/联系证据，仅本地私有 tracker；公开报告只有经同意的聚合/匿名结果。保留、撤回、删除分享副本均由伙伴同意范围决定；本任务不建立任何 tracker 或发送路径。

## 13. Result Semantics

结果是 validation 状态，不是 agent/tool 执行结果；tool block 不等于 validation fail。

| Result | 条件 |
| --- | --- |
| PASS | 固定 profile 的所有必需来源/关联/终态检查和 Evidence conformance 通过；已声明非必需缺口仍可 UNKNOWN，不表示全字段 known |
| PARTIAL | 有独立可核验观察，部分可用但 profile 规定的完整验证条件未齐；列出缺口，不用 PARTIAL 吸收身份冲突 |
| UNSUPPORTED_SOURCE | producer/format/version 无获准 profile，或需深侵入才可读取 |
| SOURCE_INCOMPLETE | source 截断、丢失、必要记录/序列化不完整；保存明确覆盖范围 |
| CORRELATION_UNPROVEN | 无法不猜测地关联 request/tool result，或存在身份/终态冲突；不得拼成一次成功调用 |
| NO_EXECUTION_TRUTH_AVAILABLE | 只有文本/外层 lifecycle，连 profile 定义的工具观察/终态都没有；不是因为 physical entry 未知就拒绝有限 return proof |
| VALIDATION_ERROR | kit 内部错误、输入完整性/读取/写入/重核错误；不是 tool failure |

主结果按 error、unsupported、correlation conflict、incomplete、no useful tool observation、partial、pass 的固定优先级选择，所有诊断仍保留；profile 事先定义哪些缺失意味着 incomplete，不能运行后调整门槛。完全未知 source 不尝试补出 request/args。

最低有用链是“真实 request + 显式 tool correlation + 受支持 tool observation/terminal”。只有达到该门槛且所有外部条件成立的 PASS 或明确有用 PARTIAL 才能进入主 KPI；诊断报告也有价值，但不冒充 projection 成功。

缺少 physical start、execution args、authorization 时保持 unknown；不把 ToolMessage、span end、callback 升级为物理执行。`claims_refused` 表示这个 source/profile 不允许提出的主张，不表示它在现实中为假。

## 14. Partner Value

本地摘要与 artifact 必须同时让伙伴回答：

| 输出问题 | 有用结果 |
| --- | --- |
| WHAT_WAS_OBSERVED | 哪条真实 request 与哪条工具返回/观察可关联，定位到自己的 source |
| WHAT_CAN_BE_PROVEN | 当前 profile 支持的 request/参数/终态 facts，而非简单绿灯 |
| WHAT_REMAINS_UNKNOWN | 哪些信息源没记录、哪些序列化不支持、哪些关联缺失 |
| WHERE_GOVERNANCE_EXISTS | 只有已有审查过的 pre-dispatch/control 证据才报告受限 GOVERNED |
| WHERE_GOVERNANCE_DOES_NOT_EXIST | 分清“已知只提供 observation、不能宣称 control”和“治理是否存在未知”，不把无日志说成无治理 |

价值在于帮助对方检查自己的 tracing/approval/观察盲点，不是向 KerniQ 交数据。若仅输出测试数量或“感谢支持”，VALUE_GATE=FAIL；无需引导对方集成 AgentFuse 才能获得结果。

## 15. PraisonAI Pilot Path

PraisonAI 是本任务指定的 **FIRST DESIGN-PARTNER CANDIDATE**，不是已接受试用或已准备好的支持 runtime。

```text
PRAISONAI_FIRST_CANDIDATE=true
PRAISONAI_PILOT_NOT_READY=true
SOURCE_FORMAT_PENDING_PARTNER_SAMPLE=true
```

最少需要伙伴一条真实 agent run、至少一个真实 tool call、可读取的 native event/trace/export、request 到 tool observation/result 的关联，以及 producer/source format/version/capture 范围说明。当前 main 不提供这些 PraisonAI 资料，不猜字段名、hook 名、导出命令或兼容版本。

路径优先 A。若没有原生 export，只把 B 作为待验证可能性：固定官方 seam、外置捕获、可删除、无业务/core/tool 修改。若这些限制不能同时成立，保持 PRAISONAI_PILOT_NOT_READY=true 并拒绝该路径，返回候选选择；不做永久 instrumentation 或 framework fork。

按 Pre-Pilot Source Qualification 的独立状态链，先取得实际来源资料并通过七项 gates，正式冻结一个 profile 的映射和 unknown 矩阵，再单独申请实现。kit 实现后的 10 分钟 usability test 通过后，才可单独授权 pilot outreach。此资格准备阶段不是外部成功，不计 ARTIFACT_VERIFIED。没有样本不能发送“kit 已支持你的 runtime”的承诺。

## 16. Outreach Recovery Strategy

本节只讨论未来 **pilot outreach**，不包括独立的 source qualification 请求。本任务不联系任何人；只有 profile 已正式冻结、kit 已实现、10 分钟 usability test 通过且 pilot outreach 单独获授权后，才发送：“用你自己的真实 source 试一次，看看哪些观察能被证实，返回结果 artifact”。不要重复“请集成 AgentFuse”的旧要求，不索取会议、roadmap、依赖合并、first-party support 或维护承诺。

只设计候选槽位，不编造具体联系人或历史：

| Tier | 上限 | 资格与顺序 |
| --- | --- | --- |
| A: warm | 3 | A1 PraisonAI 中可由私有记录确认曾有技术互动的 runtime/tooling 负责人；A2 既有 tool-boundary 技术交流对象；A3 既有 approval/evidence 技术交流对象。记录无法确认则槽位未填，不称 warm |
| B: cold-but-qualified | 5 | 实际维护 agent runtime/product、拥有真实 tool traces、可独立操作、愿意本地验证且已有合格来源；排除纯媒体/influencer/无 runtime 项目的账号 |

当前 main 无足够具体联系人依据，名单留空。PraisonAI 是优先资格审查对象，不因任务命名自动计入 warm 已联系人数。第一次只邀请一位符合 source/profile 的伙伴，看到有用结果后才启用剩余名额，不并行承诺多个新 parser。

## 17. Outreach Template

仅供未来 profile 冻结、kit 就绪、10 分钟 usability test 通过且 pilot outreach 单独获授权后使用；不是 source qualification 索样模板。方括号内容必须来自已核实上下文。本任务未发送。

> Hi [name], your work on [verified runtime/tool-boundary feature] makes your perspective especially useful. We have a small local-only validation pilot for [qualified source format]. Would you try one existing real tool-call source from your own project and send back the machine-verifiable result artifact? The goal is under 10 minutes, with no integration or maintenance commitment. Raw prompts, credentials, and business payloads stay on your machine. The result separates what was observed, what can be supported, and what remains unknown. You can stop if the format is unsupported or setup takes too long. Would this small trial be useful to you?

## 18. Metrics

未来 scoreboard 一行一个匿名 candidate/pilot case，记录 OUTREACH_SENT、REPLIED、TRIAL_ACCEPTED、EXTERNAL_RUN_STARTED、EXTERNAL_RUN_COMPLETED、ARTIFACT_RECEIVED、ARTIFACT_VERIFIED、WILL_REUSE 的时间与依据、路径/profile、耗时和结果类别。当前计数为 NOT_COLLECTED，不凭历史聊天填零或填成功。

**PRIMARY_KPI=ARTIFACT_VERIFIED（符合第 4/5/13 节的独立外部 case 数）**。同一伙伴、source digest、profile 的重复发件/重跑只算一次；不同 artifact timestamp 不增加 KPI。伙伴数、真实 repeat-use 数另外报告。

辅助指标：kit 获取到首个有用结果的耗时、source qualification 等待、setup 放弃率、未知格式率、privacy opt-out、各 ladder 转化及失败理由。stars/views/likes 不纳入成功；WILL_REUSE 不是 production adoption。

## 19. Killer Gates

这是设计审查，不把未实施/未测量写成实测 PASS。**任一实际 gate FAIL 即 FINAL_RECOMMENDATION=REDESIGN**；PENDING 阻止对外 ready 声明，不能视作已通过。

| Gate | 设计约束/通过方式 | 当前状态 |
| --- | --- | --- |
| 1 Friction | 合格 Path A 10 分钟内有用首结果；包含下载/setup，理想 5 分钟 | PENDING_MEASUREMENT；预算可行但没有实测 |
| 2 Source honesty | 外部 owner/operator、自有真实 source；不可团队代造 | PENDING_PARTNER_SAMPLE |
| 3 SDK-free | 核心业务零改动；helper 仅获准外置 seam | DESIGN_CONSTRAINT_MET；伙伴路径待确认 |
| 4 Machine-verifiable | 确定性 artifact + source 本地重核 + 收件侧一致性检查 | DESIGN_FEASIBLE；canonicalization 待 implementation proof 冻结，不是远程执行认证 |
| 5 Privacy | 默认 raw 不上传、无遥测、分享预览/退出 | DESIGN_CONSTRAINT_MET；待验证 |
| 6 Truthfulness | 不推执行/授权；unknown/拒绝/冲突显式保留 | DESIGN_CONSTRAINT_MET；沿用冻结契约，待 profile 测试 |
| 7 Partner value | 本地可定位的事实/缺口与可采取行动的诊断 | DESIGN_FEASIBLE；需伙伴反馈确认 |

没有已发现必须改变 architecture 的 gate；但不存在“pilot 所有 gates 已 PASS”的当前结论。未能取得合格 profile 时不能只发一个总返回 unsupported 的 kit 来满足上线目标。

## 20. Kill Criteria

| 条件 | 处置 |
| --- | --- |
| KILL_1: setup >30 min | 终止试用并 redesign；10 分钟无首结果已触发 friction review |
| KILL_2: 必须改 framework core | reject path |
| KILL_3: 必须改 partner business logic/tool | reject path |
| KILL_4: artifact 主要靠人工解释，机器检查无有用结果 | reject；人工归属审查不能替代技术可核验性 |
| KILL_5: source 主要由 KerniQ 团队构造 | not external validation，退回 engineering 分类 |
| KILL_6: 必须上传敏感 raw | redesign，不以 partner 默认同意绕过 local-first |
| KILL_7: 必须改 Evidence v0.2 schema | STOP，ARCHITECTURE_CHANGE_REQUIRED=true |
| KILL_8: 为 PASS 必须将 unknown 推成 known | STOP，不修改 validator 放行 |

出现真实性矛盾、source 变化、无资格重用团队 bundle、无法确认外部操作者，也阻止主 KPI。诊断失败不是 agent/tool 失败，不删除失败记录。

## 21. Minimal Implementation Scope

**IMPLEMENTATION_SCOPE=M**：不是平台工程，但可靠的无 raw 分享、确定性 artifact 和 source-qualified 映射比一个命令 wrapper 更大。首版只实现获批的一条 Path A，第二 profile 和 Path B helper 都不能因本文被默认纳入首批工作。

本节是未来范围上限，不是当前实现任务。只有 human review、七项 source qualification gates、完整 profile freeze 均已完成，再取得单独实现授权，才进入 MUST_HAVE：一个 local validation CLI；ONE qualified external profile；只读 source loader；artifact writer；artifact/local-source verifier；确定性测试；短 pilot README。复用冻结 Evidence validator 与适用的既有投影能力；若新 source 必须有特定映射，只能限于已审查离线 profile，不写 generic parser。不能先开发再补 source/profile 语义。

未来测试至少覆盖：完整可用来源、预期 unknown、unsupported/incomplete、关联冲突、摘要/版本不符、source 读期间变化、opaque 排除、无秘密内容泄露、确定性派生结果和拒绝改 schema。synthetic negatives 与伙伴真实 positive 明确分开，测试数量不作为外部采用证据。本次不创建测试或 fixtures。

DEFER：GUI、dashboard、cloud backend、accounts、hosted upload、telemetry 平台、plugin marketplace、framework catalog、generic parser、自动 outreach、证书/PKI、签名服务及执行控制。若唯一可行输入是尚未核验的深侵入 helper，先回到设计，不先实现 CLI 外壳掩盖来源问题。

## 22. Architecture Stop Conditions

当前设计不需要改变 Evidence Schema、core validator semantics、runtime/agent loop、governance protocol、dispatch 或 approval lifecycle。新 pilot artifact 封套是工具结果格式，不是新治理协议，不承载执行权限，也不扩充 canonical Evidence 字段。

一旦伙伴需求要求这些改变，立即停止、记录 ARCHITECTURE_CHANGE_REQUIRED=true / FINAL_RECOMMENDATION=REDESIGN；不继续实施或推 half-designed implementation。本任务不修改已有 runtime integrity / Evidence freeze。

维持 provider-neutral、runtime-independent 契约；SDK-free 不等于无需 source-specific qualification。不得把允许新工具结果格式解释为允许修改现有安全协议。

## 23. Recommendation

当前推荐仅为 **GO_TO_SOURCE_QUALIFICATION_BEFORE_IMPLEMENTATION**。source qualification 阶段已授权，但本次只完成设计 micro-closure，不开始任何 qualification 请求。未来先获得 PraisonAI 候选人的外部自有、非敏可审查格式与真实样本资料，通过七项 gates，冻结 ONE qualified external profile；再单独申请最小实现、完成 10 分钟实测，最后单独授权 pilot outreach。不能因格式回复就认为 profile 已可实现；不能把 qualification 记入 adoption funnel。

以下 false proof/measurement flags 表示当前未获证明或未就绪，不等于事实已被否定。`TARGET_TIME_TO_FIRST_RESULT_MET=false` 的原因为 NOT_MEASURED。GO 只允许推进来源资格审查，不是实现 GO，也不是外部成功；本次结束后立即停止，不自动执行该阶段。

```text
BASE_MAIN_HEAD=1eabd5fdca94e000bc462a78be84ceb701bf7c00
BASELINE_REVIEW_REQUIRED=false
EXTERNAL_VALIDATION_PILOT_FEASIBLE=true
PRAISONAI_FIRST_CANDIDATE=true
PRAISONAI_PILOT_NOT_READY=true
SOURCE_FORMAT_PENDING_PARTNER_SAMPLE=true
SOURCE_QUALIFICATION_REQUIRED=true
SOURCE_QUALIFICATION_AUTHORIZED=true
SOURCE_QUALIFICATION_STARTED=false
PROFILE_FREEZE_READY=false
TARGET_TIME_TO_FIRST_RESULT_MINUTES=10
TARGET_TIME_TO_FIRST_RESULT_MET=false
TARGET_TIME_MEASUREMENT_STATUS=NOT_MEASURED
LOCAL_ONLY_VALIDATION_REQUIRED=true
SDK_FREE=true
BUSINESS_CODE_CHANGE_REQUIRED=false
FRAMEWORK_CORE_CHANGE_REQUIRED=false
NEW_SCHEMA_REQUIRED=false
NEW_RUNTIME_REQUIRED=false
NEW_GOVERNANCE_PROTOCOL_REQUIRED=false
CANONICALIZATION_PROFILE=TO_BE_FROZEN_DURING_IMPLEMENTATION_PROOF
DETERMINISTIC_ARTIFACT_SERIALIZATION_REQUIRED=true
FIRST_EXTERNAL_VALIDATION_DEFINITION=ARTIFACT_VERIFIED_WITH_EXTERNAL_SOURCE_OPERATOR_AND_USEFUL_CORRELATED_OBSERVATION
FIRST_ADOPTION_SIGNAL_DEFINITION=POST_RESULT_CONCRETE_WILL_REUSE_OR_VERIFIED_REPEAT_USE
PRIMARY_KPI=ARTIFACT_VERIFIED
IMPLEMENTATION_SCOPE=M
OUTREACH_RESTART_REQUIRED=true
ARCHITECTURE_CHANGE_REQUIRED=false
PILOT_IMPLEMENTATION_AUTHORIZED=false
PILOT_OUTREACH_AUTHORIZED=false
IMPLEMENTATION_AUTHORIZED=false
IMPLEMENTATION_STARTED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
FINAL_RECOMMENDATION=GO_TO_SOURCE_QUALIFICATION_BEFORE_IMPLEMENTATION
FINAL_STATUS=EXTERNAL_VALIDATION_PILOT_DESIGN_MICRO_CLOSURE_COMPLETE_READY_FOR_SOURCE_QUALIFICATION
```

本次只修订此设计文档，在原 docs 分支、815303f013e39efb11cad4fca171f83e902968bf 之上创建并推送一个 micro-closure commit。未创建新分支、PR、merge、tag、README 改动或任何代码；未联系伙伴、未开始 source qualification。完成后停止。
