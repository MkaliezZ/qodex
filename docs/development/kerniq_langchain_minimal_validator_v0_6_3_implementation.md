# KerniQ LangChain Minimal External Validator v0.6.3 — Implementation Report

任务：实现 v0.6.2 freeze 授权的 Minimal Validator（`GO_TO_MINIMAL_VALIDATOR_IMPLEMENTATION`，[freeze 第 10 节](kerniq_langchain_external_profile_v0_6_2_freeze.md)）。本文记录 files / architecture / profile mapping / tests / real regression check / known limits / timing 状态，以及第 9 节 Proof-Closure Hardening 修复。

## 1. Baseline 与交付

- BASE_MAIN_HEAD = `ae0c6ae5cf6d4069a949c7716a62a03545c0ef82`（PR #31 merge commit，含 v0.6.1 qualification 与 v0.6.2 freeze 两份文档，任务前验证）
- 分支：`feat/kerniq-langchain-minimal-validator-v0-6-3`（自 origin/main）
- 规范优先级遵照任务书：v0.6.2 freeze > v0.6.1 qualification > v0.6 pilot design > Evidence v0.2 spec/validator > 旧 projector 仅作实现参考

## 2. Files

| 文件 | 职责 |
| --- | --- |
| `python/kerniq_external_validation/langchain_profile.py` | 冻结常量（profile/pins/claims/reasons）——只声明，不解释 |
| `diagnostics.py` | 九类诊断 code、result 枚举、固定优先级选择器、确定性汇总 |
| `source_loader.py` | path safety、inventory 绑定、exact-byte digest（utf8-jsonl-exact-v1）、严格 JSONL 解析、provenance pin 校验、结束重核 |
| `validator.py` | envelope→root→lifecycle 匹配、关联规则、F-01 有界排除（类型式必需判定） |
| `evidence_mapping.py` | freeze §6 映射表 → Evidence v0.2 文档（过冻结 conformance validator）+ 独立 lineage |
| `artifact.py` | kerniq-json-canonical-v1 序列化、artifact digest（自排除）、envelope 组装 |
| `verifier.py` | 重读字节→重算 digest→重跑映射→一致性比对（排除 run metadata） |
| `cli.py` / `__main__.py` | `python -m kerniq_external_validation validate|verify`，exit 0/1/2/3 |
| `tests/`（6 文件 + helpers + synthetic fixture） | 89 项测试；fixture 声明 SYNTHETIC_TEST_FIXTURE=true |

新增 pilot README：`kerniq_langchain_external_validator_v0_6_3.md`。未修改任何既有文件（schema/validator/runtime/旧 projector/旧 bundle 零改动）。

## 3. Architecture 要点

- **单包、纯 stdlib、无网络**。CLI 两个子命令；validate 流水线即任务书 14 步：path safety → exact-byte read → digest → strict JSONL parse → provenance validation → envelope validation → root validation → tool lifecycle matching → refusal/exclusion → Evidence v0.2 mapping → frozen Evidence validator → artifact creation → artifact digest → write。
- **关联唯一键 (source_digest, root_run_id, tool_run_id)**：start/terminal run_id + 有序 parent_ids 全等 + 行序 start<terminal<root_end；按 timestamp/相邻行/工具名/参数相等/output 相等的配对在实现中不存在。
- **F-01 有界排除**：结构三元 `lc==1 ∧ type=="not_implemented" ∧ id==["langgraph","types","Command"]`（跳过 repr 值；跨节点拆分不匹配，有测试）。必需记录判定是**类型式**的（on_tool_start/on_tool_end/on_tool_error 及一切 parent_ids==[] 事件永不排除），不依赖匹配是否成功——匹配已拒时 terminal 内的 marker 不可能被降级为 nonessential 排除（测试 test_case23 固定此行为）。排除行 raw 字节原样保留。
- **序列化歧义 fail-closed**：必需数据（tool start input、terminal kwargs、terminal cached input）中任何 `lc`/`__lc_escaped__` 键 → UNSUPPORTED_SERIALIZATION；root start/end 内容不投影，仅做 marker 扫描（必需记录含 marker → 拒）。
- **verifier 不信自报字段**：重读 source 字节 → 重算 source digest 与 artifact digest → 用冻结 profile 重跑完整映射 → 比对 result/Evidence（排除 recorded_at 等 run metadata）/claims。篡改 claims 后重算 digest 仍会被 replay 比对抓住（test_case27b）。
- **kerniq-json-canonical-v1**（pilot §11 Option B 授权的极小方案）：`json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)` 的 UTF-8 字节 SHA-256；artifact 树内数值仅整数（无浮点规范化分支）；artifact_digest 排除自身字段；写出文件本身就是 canonical 字节（+最终 LF），任何 reader 可复算。文档化于 artifact.py 与本报告，测试覆盖（sorted/compact/非 ASCII/digest 自排除/同输入稳定）。

## 4. Profile mapping（freeze §6 落实）

known/derived：request（RUNTIME_TOOL_REQUEST_OBSERVATION；request_id=null；attempt_ref=`langchain-tool-run:<root>:<tool>`；tool_call_id 仅取自 typed terminal；action_name 显示名；action_ref=null；identity unknown）· argument_binding.requested（snapshot_ref 指针 + digest=null）· execution.completion（occurred=true, at=null，runtime 结算）· outcome（source-reported success + result_ref）。

unknown（frozen reasons）：decision · authorization · effective/executed args · scope · authorization_match · release/dispatch/start。lineage（Evidence 封套之外）记录每条 known 字段的规则与精确定位（`langchain-archive:<full 64-hex digest>#L<line>#<pointer>`）。

refused（claims_refused 固定）：GOVERNED_CAPABILITY · AUTHORIZATION_PROOF · PHYSICAL_EXECUTION · PHYSICAL_SIDE_EFFECT · EXACTLY_ONCE_EXECUTION · MODEL_INTENT_PROVENANCE · GENERAL_LANGCHAIN_SUPPORT · ZERO_CHANGE_CAPTURE_FOR_ALL_USERS · RUNTIME_TRUST。

所有映射文档经**既有** `kerniq_evidence_conformance.validate_evidence_document` 验证（未复制语义；测试重新调用冻结 validator 复核）。Evidence 封套不含自定义字段，lineage 独立存放。

## 5. Tests

- **新 validator**：113 tests（3.11.15 与 3.13 双绿；89 项初始 + 24 项 proof-closure hardening，见第 9 节）。任务书 34 项正负矩阵全覆盖（1-6 正向；7-33 负向；34 模型关联不伪造），另加：BOM/CRLF/空行/NaN/非对象行/lone surrogate、降级 termination 声明、filtered capture、duplicate root end、root end 先于 terminal、首行非 root、root 无 data.input、tool error、raw/list terminal、`lc` 键歧义（tool input/escaped marker/root start marker）、repr 文本永不匹配 marker、verify unknown profile、verify 缺文件、no-network（socket 禁用下全流程）、CLI exit codes、`python -m` 入口。
- **回归**：conformance 46 + LangChain projection 32 + DSH projection 21 = 与新测试合计 **188 passed 双 Python**（3.11.15 `F:/KerniQ/.venv-preview`、3.13 系统 Python + pytest 9.1.0）；agentfuse bridge 29 passed 2 skipped（仓库根布局，预存在要求）；`pnpm -r test` 全绿（apps/desktop 185 passed）。LOCAL_TEST_RESULT=PASS；CI_RESULT=NOT_RUN（GitHub 无 workflow 运行，保持本地/CI 分离纪律）。
- **拒绝语义抽查**：UNSUPPORTED_PROFILE/INVALID_SOURCE/INCOMPLETE_SOURCE/CORRELATION_CONFLICT/UNSUPPORTED_SCOPE/UNSUPPORTED_SERIALIZATION/SOURCE_BINDING_FAILURE/OPAQUE_SOURCE_EXCLUDED 全部有专测；result 折叠按 pilot §13 固定优先级（VALIDATION_ERROR>UNSUPPORTED_SOURCE>CORRELATION_UNPROVEN>SOURCE_INCOMPLETE>PASS；PARTIAL/NO_EXECUTION_TRUTH 枚举已定义，本首版不产生——拒绝不吸收为部分成功）。

## 6. Real regression check（read-only compatibility）

历史内部 capture（`experiments/langchain-proof-v0-5-1`，Core **1.6.1**）：

1. 原字节只读拷贝 + **诚实** provenance（声明 1.6.1）→ `UNSUPPORTED_PROFILE`，无 Evidence——版本 gate 真实拒绝，符合 freeze“旧 bundle 是回归参考，非 1.6.2 外部 source”。
2. 直接指向旧 bundle 目录（无 inventory/provenance 布局）→ SOURCE_BINDING_FAILURE，无 best-effort 解析。
3. 泛化性由 transformation tests 保证（动态 root/tool/model run id、动态工具名/参数/输出/content list 仍 PASS，test_case3）——matcher 不依赖固定 run ID、工具名、参数值、输出值或行号。

## 7. Known limits

- 首版仅 success profile；错误路径是显式 scope 排除（非把 error 折叠为 unknown）。
- provenance 是声明不是认证；digest 证明字节同一性，不证明外部归属/诚实捕获/物理执行（freeze §8-9 原样保留）。
- artifact 分发仍无 validator_digest 清单锚定（kit 分发形态未定，pilot §10 字段位已留 validator_version）；canonicalization 为本实现冻结的极小方案，非 RFC 8785。
- Windows 本地实测 CRLF 假象规则同前：fixture/artifact 均为 LF 字节。

## 8. 10-minute gate status

TARGET_TIME_TO_FIRST_RESULT_MET=**false**；TARGET_TIME_MEASUREMENT_STATUS=**NOT_MEASURED**（gate 的正式测量须含 setup/download 且由非团队用户执行）。内部参考计时（clean `python -m` 调用、kit 本地、不含分发）：validate 0.14s + verify 0.13s。

## 9. Proof-Closure Hardening（55f9569 之上）

独立 review 确认两个 blocker，已修复（未扩 profile、未改 schema/runtime/governance、未动 truth boundary）：

**BLOCKER 1 — artifact semantic replay binding（truth-boundary bug）**：原 verifier 只比对部分字段，伪造 `capability_assessment: OBSERVED→GOVERNED` 并重算 artifact_digest 可能仍 VERIFIED。修法（非零散 if）：

- `verifier.verify_artifact` 重构：从 source 字节重跑完整 validation/mapping → 用 fresh outcome 重建 **expected artifact envelope** → 双方做 semantic normalization → 对其余全部 shareable 字段做 **deterministic whole-envelope canonical 比较**（`ARTIFACT_SEMANTIC_REPLAY_BINDING=true`）。绑定的字段包括（不限于）：pilot_version / artifact_version / validator_version / profile_id / profile_version / source_reference_type / **完整 source_digest 记录（algorithm+representation+value+byte_length）** / result / capability_assessment / claims_proven / claims_unknown / claims_refused / claim_checks / evidence_validation / diagnostics / exclusions / evidence / lineage / privacy。
- 排除项仅限真正的 per-run metadata，各有明确理由与测试：`validation_started_at` / `validation_completed_at` / `duration_ms` / `validation_id`（工具运行时钟事实，replay 不可再derive）；`artifact_digest`（自引用）；`evidence.recorded_at`（Evidence v0.2 schema 定义其为"本记录生成时间"，每次 replay 必然新铸；pilot design §11 要求 replay 比较排除时钟类 run metadata）。
- **Artifact 严格解析 fail-closed**（`ARTIFACT_CANONICAL_INPUT_ENFORCED=true`，`artifact.parse_artifact_bytes`）：拒绝 duplicate JSON keys、NaN/Infinity、malformed UTF-8、lone surrogate、非 object 顶层、缺最终 LF；并要求文件字节 == canonical 序列化 + LF——语义相同但改 spacing/order/newline 的文件不能冒充 canonical artifact。digest 字段三重检查：`algorithm=="sha256"`、`canonicalization=="kerniq-json-canonical-v1"`、`value==重算值`。canonicalization 方案不变（未引入 RFC 8785，未重开 serialization design）。
- 新增攻击测试：伪造 capability/claims_unknown/claim_checks/diagnostics/exclusions/privacy.local_only/validator_version/source_digest.representation/source_digest.byte_length/evidence payload/result 降级/pilot_version **各自重算 digest 后仍 REJECTED**；duplicate key / 非 canonical whitespace / 无最终 LF / NaN / invalid UTF-8 / 非 object / digest.algorithm / digest.canonicalization 篡改均 REJECTED；recorded_at 与 run 时钟差异（诚实重算 digest）仍 VERIFIED（排除项理由测试）。

**BLOCKER 2 — full source digest references**：v0.6.2 freeze §8 要求 exact source digest binding，原实现用 `raw_digest[:12]`。已全部改为完整 64 位小写 SHA-256（`FULL_SOURCE_DIGEST_REFERENCES=true`，`SOURCE_REFERENCE_DIGEST_LENGTH=64`）：

- `LoadedSource.archive_ref()`：`langchain-archive:<full_digest>#L<line>[#<pointer>]`
- `attempt_ref`：`langchain-tool-run:<full_digest>:<root_run_id>:<tool_run_id>`（freeze §6 要求 namespaced reference 与 exact source digest 一起编码 original identity components）
- `runtime_ref`：`langchain-archive:<full_digest>:producer=…`
- claim_checks 的 `TOOL_RUN_LIFECYCLE_CORRELATION` locator、全部 lineage source_ref、全部 Evidence source_ref/snapshot_ref/result_ref
- `evidence_id`：改为绑定 full digest（`kerniq-external-validator:<full_digest>:<tool_run hash12 salt>`；尾缀仅为 producer 命名空间唯一性 salt，非 source locator）

测试新增全量 refs 断言（所有 `langchain-*` 引用段为 64-hex；artifact 文本中不再存在任何 12-hex 截断形式）。

## 10. Machine conclusions

```text
BASE_MAIN_HEAD=ae0c6ae5cf6d4069a949c7716a62a03545c0ef82
IMPLEMENTATION_HEAD=55f9569d81855f6efe02036189f3808ffb61f4cc
BRANCH=feat/kerniq-langchain-minimal-validator-v0-6-3
PROFILE_ID=langchain-create-agent-tool-run-jsonl-v0.1
PROFILE_VERSION=0.1.0
LANGCHAIN_MINIMAL_VALIDATOR_IMPLEMENTED=true
FROZEN_PROFILE_IMPLEMENTED=true
OFFLINE_VALIDATION_WORKS=true
LOCAL_ONLY_VALIDATION=true
STRICT_PROFILE_MATCHING=true
STRICT_CORRELATION=true
UNKNOWN_PRESERVATION=true
ARTIFACT_SEMANTIC_REPLAY_BINDING=true
ARTIFACT_CANONICAL_INPUT_ENFORCED=true
FULL_SOURCE_DIGEST_REFERENCES=true
SOURCE_REFERENCE_DIGEST_LENGTH=64
FORGED_CAPABILITY_WITH_RECOMPUTED_DIGEST_REJECTED=true
FORGED_UNKNOWN_CLAIMS_WITH_RECOMPUTED_DIGEST_REJECTED=true
FORGED_DIAGNOSTICS_WITH_RECOMPUTED_DIGEST_REJECTED=true
FORGED_PRIVACY_WITH_RECOMPUTED_DIGEST_REJECTED=true
F01_REPR_PARSE_USED=false
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
NEW_SCHEMA_REQUIRED=false
NEW_RUNTIME_REQUIRED=false
NEW_GOVERNANCE_PROTOCOL_REQUIRED=false
ARCHITECTURE_CHANGE_REQUIRED=false
FOCUSED_TESTS_PASS=true
EVIDENCE_CONFORMANCE_PASS=true
LANGCHAIN_PROJECTION_REGRESSION_PASS=true
DSH_PROJECTION_REGRESSION_PASS=true
ARTIFACT_WRITER_IMPLEMENTED=true
ARTIFACT_VERIFIER_IMPLEMENTED=true
SOURCE_ACQUISITION_MODE=EXISTING_ARCHIVE_ONLY
CAPABILITY_CLASSIFICATION=OBSERVED
TARGET_TIME_TO_FIRST_RESULT_MET=false
TARGET_TIME_MEASUREMENT_STATUS=NOT_MEASURED
PILOT_OUTREACH_AUTHORIZED=false
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
FINAL_STATUS=LANGCHAIN_MINIMAL_EXTERNAL_VALIDATOR_V0_6_3_PROOF_CLOSURE_COMPLETE_READY_FOR_FINAL_REVIEW
```

下一步（未开始）：final independent review → 内部 10 分钟实测（含分发）→ 单独授权的 external pilot outreach。
