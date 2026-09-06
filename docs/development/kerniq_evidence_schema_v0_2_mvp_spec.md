# Executive Summary

日期：2026-09-07。文档性质：**Evidence Schema v0.2 MVP 规范基线，冻结供后续单独授权的 conformance proof 使用**。规范完成不表示 wire protocol、reader、writer、认证或执行控制已经实现，也不表示 DHMS 已发布新 schema package。

输入：[v0.2 Design](kerniq_evidence_schema_v0_2_design.md)、[v0.2 Scope Review](kerniq_evidence_schema_v0_2_scope_review.md)。仓库：`MkaliezZ/qodex`；本地基线 HEAD：`b743a5727f51986bcafbac4e638af8ad218badbb`。这两份输入不改动；本规范定义裁剪后的 MVP，原设计的完整身份/授权平台内容仅为 future proposal。若原设计与本文的 MVP 字段或生命周期规则冲突，以本文为 MVP conformance 基准，尤其不能从 policy block 删除历史 approval。

```text
SPEC_STATUS=MVP_SPEC_FROZEN_FOR_CONFORMANCE
SCHEMA_VERSION=kerniq.governance-evidence.v0.2
SCOPE=REFERENCE_AND_LIFECYCLE
IMPLEMENTATION_STARTED=false
PROTOCOL_IMPLEMENTED=false
CONFORMANCE_PROOF_AUTHORIZED=false
```

本文的 MUST、MUST NOT、SHOULD 分别表示该 MVP 契约的必需、禁止、建议要求；这些词不是当前运行时具备能力的声明。字段与枚举保持 framework-neutral；修改其语义须明确修订规范，不能由 producer 自行重解释。

本次只生成本文件，不创建 fixture、测试、JSON Schema 实现、adapter、SDK、服务、UI、PR 或 commit。

# Relationship With v0.3.3.3 Runtime Integrity

v0.3.3.3 冻结能力回答受审计范围内“运行的 runtime 是否符合已准入身份、内容、依赖、解析拓扑与 executable composition”。audited identity、content seal、dependency closure、resolution topology、admission gates 和 fail-closed startup 保持原状。本次没有重新执行其历史证明，也没有修改 manifest 或 gate。

本规范回答“关于请求、决定、授权引用和执行结果，有哪些带来源的事实可以记录与关联”。Runtime Integrity 不证明某个人批准了动作；一个完整 evidence JSON 也不证明 runtime 经过 admission。

| 边界 | 必须提供的东西 | 不能据此推出 |
| --- | --- | --- |
| Schema | 记录形状、阶段、引用、unknown 和关联约束 | 身份真实、权限充分、阻断生效或副作用发生 |
| Runtime / evidence producer | 原始请求与结果事件、真实审批/dispatch receipts、各自观察边界和可靠关联 | 外层 started/callback 自动等于物理入口 |
| 外部或既有可信 identity boundary | 对主体命名空间和认证来源的验证依据 | 被认证主体拥有该动作批准权限；登录等于确认执行 |

Evidence Schema 版本与 KerniQ release、AgentFuse package、Action schema、bridge protocol 和 runtime manifest 的版本是不同维度。本文不重命名或替换现有 `kerniq.action.v1` 等协议。

# Evidence Model Goals

必须保留：

```text
Decision != Outcome
Authorized != Executed
Blocked != Failed
Unknown != False
Approval existence != Approval attribution
Authenticated != Authorized
```

MVP MUST 能表达已知事实、来源、关联与无法观察的部分。MUST NOT 因为字段可以填写就认为相应能力已证明。合法 unknown 可以被 reader 接受用于诊断；这不是允许 enforcer 用 unknown 满足 required authorization 的规则。

六项交付限于 request、decision、authorization、argument_binding、execution、outcome。不得引入第二套 agent loop、policy engine、授权签发器或工具执行器。

# MVP Required Records

## 1. 文档 envelope 与记录单位

顶层必需字段如下，不存在隐式默认值：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schema_version` | string | 精确值 `kerniq.governance-evidence.v0.2` |
| `evidence_id` | 非空 string | 在 `producer_ref` 命名空间内唯一；不同内容不得复用同一 ID |
| `producer_ref` | 非空 string | 记录映射/采集者引用，不是可信身份的自我证明 |
| `profile_ref` | 非空 string | 明确输入格式、观察边界、引用解析和映射规则的文档引用，不是可执行 module |
| `recorded_at` | UTC timestamp | 本记录生成时间，格式 `YYYY-MM-DDTHH:mm:ss[.fraction]Z`，不得冒充原事件时间 |
| `previous_evidence_ref` | string 或 null | 同一 attempt 的先前不可变记录；null 表示无先前记录引用，不证明历史事件不存在 |
| `request` | `Observation<RequestRecord>` | 请求引用与身份信息 |
| `decision` | `Observation<DecisionRecord>` | 策略判断记录 |
| `authorization` | `Observation<AuthorizationRecord>` | 已有授权/批准事实引用 |
| `argument_binding` | `ArgumentBindingRecord` | 三阶段参数、scope 与批准目标匹配 |
| `execution` | `ExecutionRecord` | release/dispatch/start/completion 的分别观察 |
| `outcome` | `Observation<OutcomeRecord>` | 结果记录 |

一个 evidence object 描述一个可关联的 invocation attempt 在 recorded_at 时的视图，不是完整全局账本。重新授权、参数改版或 policy 决定更新 MUST 保留原 source records，并生成新 evidence_id/previous_evidence_ref，不覆盖历史。无法确认属于同一 attempt 的材料 MUST NOT 合并，允许保留独立 incomplete 记录。

引用是 opaque、带 producer/profile 命名空间的记录标识。reader MUST NOT 根据引用自动联网、导入代码或执行目标；后续解析只能使用获准的只读映射。MVP 不要求新建引用服务。除下表明确允许 null 的字段外，所有列出的字段均必需。未知字段 MUST 报告 unsupported，而非默默赋予治理语义；原生额外字段通过 source_ref 保留，不强制复制到 MVP 对象。

所有 ID、ref、名称、generation、representation 和 reason 的非 null string 值必须非空且不能只含空白；不得隐式 trim/改写原标识使两个不同来源合并。time 必须为上述格式的实际有效 UTC 日期时间；未知时间使用允许的 null，不填写零时间。输入必须为合法 JSON，重复 object key、错误类型或缺失必需字段不是可自动修复的 unknown。对象字段顺序不影响本契约读取，但不得因此重算或改写引用中原始参数字节的 digest。

## 2. 通用 Observation 类型

每个 `Observation<T>` 恰有四个字段：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `status` | `known` / `unknown` / `not_applicable` | 表示有来源的记录、无法确定、不适用 |
| `value` | T 或 null | known 时必须为 T；其他状态必须 null |
| `source_ref` | string 或 null | known/not_applicable 必须非空；unknown 可指向不完整源，也可 null |
| `reason` | string 或 null | known 必须 null；unknown/not_applicable 必须非空原因码 |

`known` 只表示有支持该记录的来源，不代表其内容已完成认证或所有内层可空字段都有实值。特别是 `authorization.status=known` 不等于“批准人已验证”。reason 为有文档说明的 machine-readable string，不携带可执行语义，不靠自然语言决定 allow/block。

各字段允许的状态进一步限定如下，不能任意使用 not_applicable：

| Observation 所在字段 | 允许状态 |
| --- | --- |
| request、decision、outcome、argument_binding.requested/effective/scope、所有 execution 阶段 | known / unknown；尚未观察到不能写 not_applicable |
| authorization | known / unknown；源明确证明不要求授权时可 not_applicable |
| argument_binding.executed | known / unknown；有依据证明真实工具入口未发生时可 not_applicable |
| argument_binding.authorization_match | known / unknown；源证明授权不适用，或已知 authorization 明确 refused、无肯定授权可比较时可 not_applicable |

无参数工具的已知参数是对应空参数 snapshot，不是 requested/effective 不适用。无资源约束也应由已知 scope 表示，不将 scope 本身省略。

## 3. 六类记录字段

以下 `string?`、`time?`、`Digest?` 表示字段必须存在，但值可为 null；null 明确表示源没有提供足够事实，不表示空字符串、无期限、否定事实或 wildcard。

**RequestRecord**

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `request_id` | string? | 原生请求或可信入口分配的关联 ID，不伪造 model 原始 ID |
| `tool_call_id` | string? | 原始工具调用 ID；不是全局唯一键 |
| `attempt_ref` | string? | runtime 定义的尝试引用；未知时不得假定为“第一次” |
| `runtime_ref` | string? | 来源 runtime 命名空间或既有 admission 引用；名字本身不证明 admission |
| `action_name` | string? | 工具/动作显示名称 |
| `action_ref` | string? | 版本绑定或有命名空间的工具/动作身份引用 |
| `identity_provenance` | IdentityProvenance | 发起者来源；不要求一定是人，也不将 agent 归为人 |

known RequestRecord 至少需要 request_id、tool_call_id、attempt_ref 中一个非空，且 source_ref 必须支持该关联；其他已知内容 MUST 保留。关联不足的记录不能标为完整 attempt proof。

**DecisionRecord**

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `decision_id` | string? | 决定引用的原生 ID |
| `evaluation` | `decided` / `error` / `unknown` | 有效策略判断、已观察错误、源无法确定判断 |
| `action` | `allow` / `block` / null | 只有 evaluation=decided 时允许且必须为 allow/block；否则必须 null |
| `policy_ref` | string? | 原始 policy/version 引用，不新增策略计算 |
| `target_ref` | string? | 决定针对的动作与参数/scope 目标 |
| `decided_at` | time? | 原始决定时间，不用 recorded_at 补齐 |

本地 deny 只有在 profile 明确证明来自 canonical block 时才能映射为 block。本地 hold/error 等不能凭名称压成 block：保留原 source，action=null，并按来源映射 evaluation。禁止新增 modify action。

**AuthorizationRecord**

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `authorization_ref` | 非空 string | 原有 approval/authorization 记录引用，不签发新 grant |
| `disposition` | `granted` / `refused` / `unknown` | 引用中确认的事实；不能由 ref 存在推出 granted |
| `target_ref` | string? | 该记录实际绑定的原目标，不随当前 effective args 自动变化 |
| `approved_at` | time? | 已记录的批准时间；非 granted 时必须 null |
| `expires_at` | time? | 原始有限期限；null 不是永不过期 |
| `generation` | string? | 保留原 generation 的无损文本形式，不引入新的计数或消费规则 |
| `validity_ref` | string? | 既有有效期/撤销/检查记录的引用，含检查时点与适用范围；不是当前有效性的布尔值 |
| `identity_provenance` | IdentityProvenance | 谁批准的来源，默认允许 unknown，不要求安装认证系统 |

不存在可用授权记录时用 Observation unknown；只有源明确表示该路径不要求授权才可用 not_applicable。不可因 policy block 直接设置不适用，也不可把缺失 ref 当成拒绝。

**ArgumentBindingRecord** 固定字段：`requested`、`effective`、`executed` 均为 `Observation<ArgumentsRecord>`；`scope` 为 `Observation<ScopeRecord>`；`authorization_match` 为 `Observation<MatchRecord>`。

- `ArgumentsRecord`：`snapshot_ref: string?`、`tool_ref: string?`、`scope_ref: string?`、`digest: Digest?`。snapshot_ref/digest 至少一个非 null；其来源 MUST 是对应阶段的实际快照或可验证指纹。
- `ScopeRecord`：`scope_ref: string`、`runtime_ref: string?`、`context_ref: string?`、`resource_refs: string[] 或 null`、`operation: string?`。context_ref 保留 project/run/session/tenant 的原生范围，缺失不能跨域拼接。空 resource_refs 只表示源明确声明该范围无资源项，不是任意资源。
- `MatchRecord`：`result: matched | mismatched`、`authorization_target_ref: string`、`effective_target_ref: string`。source_ref 支持完整工具、参数和 scope 的比较；无法比较用 Observation unknown，不能编造 matched。
- `Digest`：`algorithm: sha256`、`representation: 非空 string`、`value: 64 位小写十六进制 string`。本规范仅定义一种 algorithm；不能将其他算法改名为 SHA-256。旧原生 digest 保留在 source；不支持的算法只读保留引用，不冒充本类型。

**ExecutionRecord** 固定字段：`release`、`dispatch`、`start`、`completion`，每项均为 `Observation<StageRecord>`。`StageRecord` 为 `occurred: boolean`、`at: time?`。true/false 均需来源；false 表示有依据的未发生，而不是没有找到日志。阶段具体语义见 Lifecycle Model。

**OutcomeRecord**：`status: success | failure | not_executed | cancelled | unknown`、`reason: string 或 null`、`result_ref: string?`。source_ref 必须支持状态；除 success 外 reason 必须非空。success 表示源确认工具调用返回成功，不证明副作用或物理入口；failure 表示已观察调用失败，是否已进入工具由 execution.start 单独回答。保留 blocked 与 failed 的区别。

本规范不强制 source 自称的成功一定可信。profile 与 source 的边界仍决定哪些事实可以验证；不同工具的 validation failure、合成返回、远端响应必须如实标明 reason/source，不能自动推断 physical execution。

## 4. JSON 示例：已经批准，随后策略仍阻止

此 JSON 仅为文档中的合成例子，不是 fixture 文件或真实运行证据。假设请求 limit=10，已有受控处理将 effective limit 变为 5，既有 approval 针对 effective 目标；后续 policy block，运行时产生明确的非执行终态记录。所有引用均为说明性占位标识，不代表可用服务或已验证主体。

示例 representation `utf8-json-exact-v1` 表示对存档 JSON 的原始 UTF-8 字节计算 SHA-256，不重新排序/归一化。两个示例输入字节分别精确为 `{"limit":10}`、`{"limit":5}`；该方案不修改既有 proposal digest，也不声称跨序列化器语义等价。

```json
{
  "schema_version": "kerniq.governance-evidence.v0.2",
  "evidence_id": "example-evidence-2",
  "producer_ref": "example:recorder",
  "profile_ref": "example:document-only-profile",
  "recorded_at": "2026-09-07T10:00:05Z",
  "previous_evidence_ref": "example:evidence-approval-1",
  "request": {
    "status": "known",
    "value": {
      "request_id": "req-1", "tool_call_id": "call-1", "attempt_ref": "example:attempt-1",
      "runtime_ref": "example:runtime-1", "action_name": "records.list", "action_ref": "example:tool-records-list-1",
      "identity_provenance": {"source": "unknown", "subject_ref": null, "provenance_ref": null, "reason": "requester_not_authenticated"}
    },
    "source_ref": "example:event-request", "reason": null
  },
  "decision": {
    "status": "known",
    "value": {"decision_id": "decision-1", "evaluation": "decided", "action": "block", "policy_ref": "example:policy-1", "target_ref": "example:target-effective", "decided_at": "2026-09-07T10:00:03Z"},
    "source_ref": "example:event-policy-block", "reason": null
  },
  "authorization": {
    "status": "known",
    "value": {
      "authorization_ref": "example:approval-1", "disposition": "granted", "target_ref": "example:target-effective",
      "approved_at": "2026-09-07T10:00:02Z", "expires_at": "2026-09-07T10:01:02Z", "generation": "1", "validity_ref": null,
      "identity_provenance": {"source": "unknown", "subject_ref": null, "provenance_ref": null, "reason": "legacy_approval_without_attribution"}
    },
    "source_ref": "example:event-approval", "reason": null
  },
  "argument_binding": {
    "requested": {
      "status": "known",
      "value": {"snapshot_ref": "example:args-requested", "tool_ref": "example:tool-records-list-1", "scope_ref": "example:scope-1", "digest": {"algorithm": "sha256", "representation": "utf8-json-exact-v1", "value": "ca502dec04523cdc33afece69a9b600d5b9bd022d453791cc693b6b372f808ad"}},
      "source_ref": "example:event-request", "reason": null
    },
    "effective": {
      "status": "known",
      "value": {"snapshot_ref": "example:args-effective", "tool_ref": "example:tool-records-list-1", "scope_ref": "example:scope-1", "digest": {"algorithm": "sha256", "representation": "utf8-json-exact-v1", "value": "a03c8657a575356de5937110fc9038dafa42d659089628586aa8f8d73924cd16"}},
      "source_ref": "example:event-effective-before-approval", "reason": null
    },
    "executed": {"status": "not_applicable", "value": null, "source_ref": "example:event-non-execution-terminal", "reason": "entry_prevented_by_policy"},
    "scope": {
      "status": "known",
      "value": {"scope_ref": "example:scope-1", "runtime_ref": "example:runtime-1", "context_ref": "example:project-run-1", "resource_refs": ["example:dataset-1"], "operation": "read"},
      "source_ref": "example:event-scope", "reason": null
    },
    "authorization_match": {
      "status": "known",
      "value": {"result": "matched", "authorization_target_ref": "example:target-effective", "effective_target_ref": "example:target-effective"},
      "source_ref": "example:target-binding-record", "reason": null
    }
  },
  "execution": {
    "release": {"status": "known", "value": {"occurred": false, "at": null}, "source_ref": "example:event-non-execution-terminal", "reason": null},
    "dispatch": {"status": "known", "value": {"occurred": false, "at": null}, "source_ref": "example:event-non-execution-terminal", "reason": null},
    "start": {"status": "known", "value": {"occurred": false, "at": null}, "source_ref": "example:event-non-execution-terminal", "reason": null},
    "completion": {"status": "known", "value": {"occurred": true, "at": "2026-09-07T10:00:04Z"}, "source_ref": "example:event-non-execution-terminal", "reason": null}
  },
  "outcome": {
    "status": "known",
    "value": {"status": "not_executed", "reason": "policy_blocked", "result_ref": "example:correlated-block-result"},
    "source_ref": "example:event-non-execution-terminal", "reason": null
  }
}
```

示例中的 matched 仅表示批准目标与 effective 目标一致，不表示身份可信、授权当前有效或允许越过 policy block。若源没有完整的非执行边界证据，dispatch/start MUST 为 unknown，executed MUST 为 unknown，outcome 不得声称已经证明 not_executed。

# Lifecycle Model

概念上的阶段关系：

```text
Request -> Decision -> Authorization Reference -> Execution Release
        -> Dispatch -> Start -> Completion / Outcome
```

此图描述需区分的事实，不强制所有 runtime 按图的顺序生成 approval。现有 `approval -> policy decision` 路径必须保留，不能重写 timestamps。authority/decision history 通过 source_ref 和 previous_evidence_ref 保持可追溯；不同 source 的 wall-clock 不能单独建立全局顺序。

| 阶段 | 精确定义 | 不能推断 |
| --- | --- | --- |
| release | 既有运行时将本 attempt 放行/生成准入 dispatch receipt | 已经委托 handler、工具入口或副作用 |
| dispatch | 已委托受支持工具执行链/原 handler 的调用观察 | 具体实现函数已进入，链中可能仍校验或短路 |
| start | 真实受支持工具实现入口被观察到 | 外部效果已完成 |
| completion | 本 attempt 达到已观察到的终态/结算事件，包括被阻止的终态 | success 或实际执行；不是“工具必已完成” |
| outcome | 该终态/结果的状态与来源；可 unknown | 从授权或 release 推出的执行结果 |

现有名为 Started 的 receipt 如果位于 handler 前，只能按真实含义映射 release，不能凭名字映射 start。start 未观测时必须保留 unknown，即使已有工具结果也不能合成入口事件。

对同一 attempt，可靠来源证明的 policy block 与实际 dispatch/start 发生若相冲突，reader MUST 报告因果/关联冲突，不删事件或改成正常 blocked 记录。允许保存源用于诊断，但不能判为一致的 governed lifecycle。新的 policy 决定或新目标必须区分历史，不把不同 attempt 的 block 与成功混为一体。

policy block 不删除已有 granted authorization。policy allow 不替代 required authorization；authorization refused 不自动变成 policy block。completion=true 可以与 dispatch=false/start=false 同时成立；这表示受控非执行终态。

`occurred=false` MUST 有边界证明或完整受控生命周期依据，`at` 必须 null；不记录一个“未发生事件的发生时间”。其观察/闭合时间由 source_ref 给出。true 时 at 可为 null，表示事件事实可知而可信发生时间不可得。

retry、resume 与重复事件不能自动产生新的执行事实。完全相同的重复 evidence ID 可幂等读取；同 ID 不同内容必须报告冲突。任何 reader/projection MUST NOT 发起重放或执行。该规则不等于跨进程 exactly-once。

# Argument Binding Model

## 三阶段与 scope

- requested：模型/调用方最初请求的参数；如果只能观察到变更后值，requested 必须 unknown。
- effective：被决定/授权所针对的确定参数版本；允许记录 policy-associated clamp 的结果，但不增加 modify decision，也不实现 mutation。
- executed：实际工具入口收到的参数；只有真实对应边界观察才可 known。没有入口观察必须 unknown；已证明未进入时可 not_applicable。

每阶段的 tool_ref、scope_ref、snapshot/digest 均需对应自己的来源。工具 schema conversion、默认值、runtime injection 可能位于 effective 与 executed 之间；不能复制值掩盖差异。对不可比较类型或隐藏参数应保留 unknown，不通过重跑 validator 猜测实际值。

MVP 支持 digest 或只读 snapshot 引用。相等比较 MUST 使用相同且已知的 algorithm/representation 与同一覆盖范围；representation 未定义、快照不可读或跨格式不能比较时为 unknown。`utf8-json-exact-v1` 只比较原始存档字节；字节不同不可被认定为 exact match，不声称它证明 JSON 语义不同。其他 source-specific representation 必须在 profile 中明确，不执行其内容。不得重算覆盖旧 native digest 或将旧方法假称为另一种标准。

单独参数 digest 不足以匹配授权。target_ref 指向的只读目标必须能恢复：工具身份、对应 effective snapshot/ref/digest、scope 和 request/attempt 关联。完整匹配至少包括这些维度；同名工具或不同 project/resource 下同样参数不能自动匹配。引用字符串相同只有在不可变目标与来源已确认时才足以建立该依据。

scope 至少标明当前 runtime/context 的实际边界，保留来源已有 project/run/session/tenant/resource 条件；不强制虚构多租户字段，也不能因 missing/null 把范围解释为全局。完整 binding 无法建立时 authorization_match=unknown。

## 参数变化与授权适用性

| 情况 | 规范要求 |
| --- | --- |
| 先 clamp，再对 effective 目标批准 | 可记录与 effective matched，requested 仍保留；matched 不是全局 validity |
| 先批准，随后参数/tool/scope 改变 | 旧 authorization_ref 与旧 target_ref 不变；对新 effective 目标报告 mismatched 或无法比较的 unknown |
| 变更看起来更安全 | 不自动继承批准；MVP 不支持 predicate/subset 授权推断 |
| 原有流程重新批准 | 记录新 authorization_ref 与目标、保留历史，不由 reader 签发或补签 |
| 实际执行后才发现差异 | 如实记录 mismatch 与 outcome，不追溯改写批准使其显得有效 |

这里冻结的是**授权引用对目标的适用性表达**，不是新增 invalidation/revocation service。未来 enforcer 若要根据 mismatch 停止 release，需要单独 runtime 授权和验证；当前既有审批/generation/expiry/barrier 不变。

参数及结果 SHOULD 通过获准的最小化引用保存，不泄露 tokens、认证头或完整私密 state。脱敏副本与完整参数不能共用“已验证完整绑定”的含义；普通 hash 也不是隐私保护。无权限读取的 snapshot 可以保留 ref，但比较结果不得伪造为 matched。

# Authorization Reference Model

MVP 只保留一个既有 authorization/approval 事实的引用，不要求新的 approval request/grant 实体服务。引用存在、记录 disposition、身份 attribution、target_match 和有效期是不同事实。

`authorization=known` MUST 指向实际来源；source 仅表明存在 pending request 时 disposition=unknown，不默认 granted。`authorization=unknown` 不表示没有批准；`not_applicable` 只用于源明确证明该路径不需要该记录的情况。

过往 granted 即使随后 expired、revoked、refused by a later decision 或 policy block，也不能从历史删除。新事实通过新 source/evidence 引用表示。`validity_ref` 只引用已有检查，其时间/范围必须在源中明确；没有该引用不能以 expires_at 尚未到期推断完整授权有效。MVP 不实施即时撤销、定时过期或单次 grant 消耗。

签署身份或认证主体不是必填事实，`identity_provenance.source=unknown` 是合法 MVP 记录。它不满足未来强 attribution profile 的可信条件，更不能作为放宽现有 human approval 要求的理由。

**Evidence object 不是授权 capability。** 执行系统 MUST NOT 仅凭上传的 JSON、granted 字符串、matched 或 approval ID 放行。只有现有受控运行时负责决策与审批执行；MVP reader 的结果不构成新的批准。

# Identity Provenance Boundary

`IdentityProvenance` 固定四字段：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `source` | `trusted` / `unknown` | 分别对应 Trusted Identity Source / Unknown Identity Source |
| `subject_ref` | string 或 null | trusted 必须非空，引用包含主体命名空间；unknown 必须 null |
| `provenance_ref` | string 或 null | trusted 必须指向可信验证依据，unknown 必须 null |
| `reason` | string 或 null | unknown 必须非空，trusted 必须 null |

unknown 包含 unavailable、unverified、caller-claimed 等情况。caller 的自报身份仍可保留在受控原始 source record 中，但 MUST NOT 放到 trusted subject_ref 中；本 schema 不新增未经审查的 claims metadata 通道。

trusted 只在已有、部署明确认可的认证验证边界下成立；来源须支持主体及其命名空间，不能由 proposing agent/caller 改写后自证。字段字面值不是验证，reader 若不能核对来源必须报告该 claim 未验证，不升级信任，也不偷偷篡改原始记录。格式有效与 provenance 已验证是不同结果。

run state、agent state、model output、任意 header、环境中的用户名或未经验证的 metadata 都不能单独构成 Trusted Identity Source。MVP 不选择认证协议，不要求 OIDC/OAuth/enterprise IAM，不保证 shared account 背后的自然人身份。

可信 authentication 只证明该来源如何标识主体；它不证明主体有权批准该工具、实际点击了确认或授权仍有效。不得将用户账户、agent identity 或 model provider account 混为一类。

# Unknown Semantics

| 表达 | 含义 |
| --- | --- |
| Observation known + value | 有来源的事实/记录；不能抹掉内层 null 或 identity unknown |
| Observation unknown + value=null + reason | 没有足够事实，可能是缺失、未观测、未验证或中断；不等于 false |
| Observation not_applicable + source_ref + reason | 来源支持该概念对当前路径不适用；不是省略字段的捷径 |
| Stage known + occurred=false | 有依据的未发生；不是搜索不到日志 |
| Outcome known + value.status=unknown | 已知源明确报告了不确定结果，例如终态持久化失败 |
| Outcome Observation unknown | 甚至没有足够来源形成 outcome 记录 |

未知不能吸收确定冲突。错误类型/枚举、missing required 字段、同 ID 内容冲突、跨 attempt 拼接、伪造已知事实应报告 invalid/conflicting/unsupported，而不是用 unknown 默认修复。所有返回给 agent 的自然语言 denied 文本都不足以单独证明 policy block 或 not_executed。

有可靠终态且明确预先阻止时可以记录 not_executed；只有 block 决定而没有 dispatch 覆盖时不能推出该结局。cancel/timeout 后副作用可能未知；不得自动输出 not_executed。source 明确记录 failure 时也不能为了通过验证改为 unknown。

schema 允许不完整历史记录，不表示治理执行可以用缺失证据满足强制条件。read-only conformance 只验证信息保真和契约，不运行或验证新的 release gate。

迁移必须保留原 schema/source、ID、顺序和 digest，缺少 attribution 或阶段参数的历史值维持 unknown。不得根据当前登录人补写旧 approver，也不得将 release receipt 升级为 physical start。MVP schema 未知版本不能按本版本自动解释。

# Deferred Features

以下不进入 MVP 必需字段、依赖或行为，继续 future extension/proposal-only：

- OIDC、OAuth integration、enterprise IAM 与特定 identity provider。
- human approval UI、多方批准和新的授权服务。
- delegation graph、authority federation、revocation service 与跨域权限一致性。
- external policy engine 集成；既有 AgentFuse policy decision source 保持不变，不新增替代引擎。
- 原设计完整 grant 消耗、独立 expiry sweeper、即时物理入口撤销协议。
- 跨系统 exactly-once、通用物理副作用证明、全框架参数转换/注入观测。
- 新事件存储、签名/外部锚定平台，以及强制重排现有 approval/decision 时序。

延期不删除已有审批、到期检查、重复调度保护、恢复语义或记录中的可信来源。未来扩展不能让旧 reader 静默把未知字段理解为新的授权；需要独立版本/兼容性决策。本次不预置空 OIDC、delegation 或 federation 字段。

# SDK-free Compatibility

本规范是 KerniQ governance evidence contract，不是 LangChain schema、AutoGen schema、Cheshire Cat schema 或 MCP schema。

- Provider neutral：无 provider SDK 类型或 API key 要求。
- Framework neutral：action/tool、request、source_ref 是语义记录，不要求框架继承关系或原生 Message 类。
- Runtime independent：保留 source-specific profile 与原顺序，不要求统一 agent loop、恢复模型或相同事件名。
- SDK-free：用户不需 `import kerniq`、继承 KerniQ Agent、改写工具业务函数或加入 framework middleware 才能表达已有记录。

这只证明契约没有 framework/SDK 耦合，不证明任意 runtime 都存在可信 zero-code attachment。需要接线时最小范围是读取既有请求/决定/授权/dispatch/result 来源并映射记录；缺少真实入口事实就保持 unknown，不增加第二条 execution path 来补字段。本任务不设计完整 launcher、interceptor、IPC 或 adapter。

# Future Runtime Requirements

DHMS/AgentFuse 继续拥有治理语义与 conformance contract；KerniQ 负责受支持部署的 evidence 映射/持久化；原 Agent Runtime 拥有 tool registry、agent loop 与执行。未来单独授权时，producer/profile 至少应说明：

1. source_ref 如何对应真实事件，ID 和 attempt 如何关联，哪些阶段可观察。
2. runtime release、dispatch、physical start、completion 的真实位置，以及何时能证明 false。
3. 参数三个阶段的采集位置与 digest representation；缺失或无法比对时如何保持 unknown。
4. authorization ref 与 policy record 的原生来源和真实顺序，不修改历史或回填身份。
5. 缺失/持久化失败、重复/冲突事件和权限不足的只读处理，不触发 replay。

只读已有记录映射不要求改 runtime execution path。若新数据采集或使用 v0.2 字段执行新的阻断必须改变运行时，则记录 `PROTOCOL_REQUIRES_RUNTIME_CHANGE`，另起获授权任务；不得因本文冻结就开始实施。

schema 无法完成认证归因、参数 drift 因果阻止、撤销时序或 physical effects 证明。未来若需要这些能力，必须分别验证相应信任与执行边界，不修改或扩大 v0.3.3.3 runtime integrity freeze 的既有声明。

下一阶段仅可在用户单独授权后做 conformance proof。本次没有创建或运行 fixture、tests、reader/writer、validator 或 runtime integration。

# Open Questions

以下不是 MVP 核心字段/枚举的待定项，也不阻塞本文作为 conformance 规范基线；它们属于未来部署/profile 或单独授权任务：

1. 哪一组已有、可获准读取且已脱敏的 source records 首先用于证明本规范映射？不能用全部 synthetic 数据宣称真实运行时能力。
2. 对选定源，哪些 native receipts 实际对应 release 而不是 start？哪些 attempt 身份或参数阶段必须保持 unknown？
3. source-specific digest representation 与引用解析 profile 由谁维护？未定义的方式保持不可比较，不自动归一化。
4. 将来是否需要可信 human attribution、委托或实时撤销？这些要单独做产品/信任边界决策，不进入本次 MVP。
5. 规范正式分发与 DHMS 版本协商如何安排？本文冻结标识供 conformance 使用，不自动发布 package、tag 或生产协议。

本次完成文档结构、字段示例和文件范围检查，不运行产品测试或 conformance proof。原设计、scope review、已有 LangChain 审计及冻结 HEAD 不变。

```text
FILES_CHANGED=docs/development/kerniq_evidence_schema_v0_2_mvp_spec.md
CODE_CHANGED=false
TEST_CHANGED=false
IMPLEMENTATION_STARTED=false
PROTOCOL_IMPLEMENTED=false
DOCUMENT_CHANGED=true
FINAL_STATUS=EVIDENCE_MVP_SPEC_COMPLETE_READY_FOR_CONFORMANCE_PROOF
```

规范生成任务到此停止；fixture、tests、implementation、runtime changes 均等待下一阶段单独授权。
