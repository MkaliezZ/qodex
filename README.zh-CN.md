# KerniQ

<p align="center">
  <img src="docs/assets/kerniq-logo.png" alt="KerniQ" width="520">
</p>

[English](README.md) | **中文**

> 面向真实 AI Agent 的桌面优先、厂商无关控制平面。

**统一编排独立 Runtime；只有在真实 pre-dispatch 边界存在时才声明治理；更强控制不可用时，明确保留证据与未知，而不是制造虚假的执行确定性。**

KerniQ 原名 Qodex。为避免破坏已有集成与本地数据，部分内部包名空间（`@qodex/*`）、`qodex-config/` 路径和持久化标识**有意保留** Qodex 名称（向后兼容）。

![Beta](https://img.shields.io/badge/status-beta-blue)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Tauri)-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
[![CI](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml/badge.svg)](https://github.com/MkaliezZ/qodex/actions/workflows/ci.yml)
![Built With](https://img.shields.io/badge/built%20with-Tauri%20%7C%20React-cyan)

---

## KerniQ 是什么？

KerniQ 是一个桌面优先、厂商无关的**多 Agent 控制与治理平面（multi-agent control / governance plane）**。它协调独立的 Agent Runtime，如实划分每个 Runtime 的能力等级，只在经过审查的真实 pre-dispatch 边界存在时接入 AgentFuse 治理；治理不可用时降级为观察，明确保留 Evidence 与 unknown，并对多 Agent 结果做 reconciliation。

KerniQ 同时也是一套可运行的 AI 编程产品：包含 Provider 抽象、Context Engine、Skills、MCP、Diff-first 编辑、Git Checkpoint、Session / Action Runtime、多 Agent 编排以及受限的原生执行路径。这套编程能力是 KerniQ 的一个 product surface，不是项目的全部定义。

KerniQ / AgentFuse 的核心集成方向是 **SDK-free by default**。原则上不要求用户：

- 继承 KerniQ 基类；
- 在业务逻辑里 import KerniQ；
- 围绕 KerniQ SDK 重写工具；
- fork 自己的 Agent Framework。

如果框架本身已有 native hook、event stream、plugin seam 或进程边界，可以利用这些已有能力，但不能把“重写业务 Agent”包装成 SDK-free。

---

## 为什么做 KerniQ？

KerniQ 关注的核心问题不是“哪个模型更强”，而是：**这个 Runtime 到底能控制什么、观察什么、证明什么？**

| 问题 | KerniQ 的处理方式 |
|:--|:--|
| 多个独立 Agent / Runtime 能不能从一个地方统一协调？ | 通过 control plane 处理生命周期、编排和结果汇总。 |
| 一个 policy 是否真的能在执行前阻断？ | 只有存在经过审查的 pre-dispatch seam 才声明 `GOVERNED`。 |
| Runtime 没有安全控制 seam 怎么办？ | 降级能力，不伪造 execution control。 |
| policy decision 是否等于 execution outcome？ | 不等于。Decision 与 Outcome 在证据里分离。 |
| 哪些是观察到的，哪些只是推断？ | Evidence v0.2 明确区分 known 与 unknown，记录 source reference；不支持的 projection 会拒绝，而不是补造值。 |

---

## Capability Model

KerniQ 按“实际证明能力”而不是“希望拥有的能力”来分类 Runtime：

| 层级 | 含义 |
|:--|:--|
| **GOVERNED** | 存在经过审查的真实 execution-before / pre-dispatch seam，policy 可以在 dispatch 前阻断。 |
| **OBSERVED** | 可以观察或控制 lifecycle / evidence，但不能诚实地声称 pre-dispatch governance。 |
| **OPAQUE** | Runtime 暴露的控制面或证据面不足，不能作更强 claim。 |

核心不变量：

- **Unknown > fabricated certainty**
- **Projection != Execution Control**
- **Decision != Outcome**
- **Blocked != Failed**

---

## 当前已经证明了什么？

当前所有 claim 都是严格有边界的：

| 范围 | 当前证明状态 |
|:--|:--|
| **KerniQ 原生 Desktop Project Command** | **GOVERNED** —— 已证明一条受限、经过审查的原生 pre-dispatch 路径（审批、canonical AgentFuse decision evidence、durable start evidence）。仅此审查路径成立；不代表所有 KerniQ action 都被治理。 |
| **DSH 真实治理 Runtime** | **GOVERNED** —— 真实 DeepSeek Harness runtime，由真实 model tool call 经过真实 `tools/pre-execute` seam，canonical AgentFuse 决策：BLOCK 阻止 dispatch 与 tool-body 执行、ALLOW 到达物理执行，且存在 fail-closed admission 路径。仅适用于审查过的 pinned 边界——不支持“所有 DSH 版本 / 所有工具 / 通用 DSH 治理”（[governance proof](docs/development/kerniq_dsh_agentfuse_governance_v0_2.md)）。 |
| **DSH Evidence projection** | 已证明一个经过审查的真实 source 离线投影到 Evidence v0.2（与上面的治理 runtime 是两件独立的事）。 |
| **Microsoft Agent Framework 治理** | **GOVERNED（bounded）** —— 在官方 pinned MAF Python runtime（`agent-framework-core` 1.17.0）上完成真实 single-agent 与官方 `Agent → B.as_tool → protected tool` 委派运行：adapter 创建的本地 async `FunctionTool(value: str)` 路径，canonical AgentFuse 决策发生在 continuation release 之前，并有 single-use 物理入口绑定。被治理的是 **child 本地函数执行边界**，不声称 delegation 本身被治理（[proof](docs/development/kerniq_microsoft_agent_framework_governance_proof_v0_8.md)）。 |
| **真实多 Agent 控制平面** | **Codex（OBSERVED）+ DSH（GOVERNED）** 两个独立真实 worker 的两 worker 控制平面 proof：任务执行前的 capability admission、真实生命周期协调、durable worker/session evidence、reconciliation 路径，以及 `governanceRequired` 任务不可静默降级。这证明 KerniQ 能协调不同真实能力等级的 Runtime——不是说所有 worker 都被治理（[wiring proof](docs/development/kerniq_control_plane_product_wiring_v0_3.md)）。 |
| **Evidence v0.2** | 已有冻结的 conformance proof，用于约束 canonical Evidence contract 及 known / unknown 边界。 |
| **LangChain / LangGraph 轨道** | **OBSERVED** —— 一个冻结的有限 source/evidence profile（`langchain-create-agent-tool-run-jsonl-v0.1`）加上最小本地 external validation CLI；内部 usability 已证明（见 [External Validation](#external-validation)）。Full capture qualification 仍为 **REJECTED**，F-01 仍为 **UNRESOLVED**，model-request 关联未证明。不是通用 LangChain 支持。 |
| **External validation / adoption** | **尚未证明。** 已存在一个最小本地 external validation CLI，仅支持一个冻结的 `OBSERVED` LangChain profile；首次内部 10 分钟 usability 因文档 friction 失败，文档修正后 fresh rerun 已 PASS（synthetic sample 上约 61 秒得到 PASS + VERIFIED artifact）。这仍不是 external validation。 |

### Runtime Capability Matrix

Proof ≠ generic support。下表每个 tier 仅对链接 evidence 中审查过的 pinned 边界成立：

| Runtime / 边界 | Tier | 已证明边界 |
|:--|:--|:--|
| KerniQ Project Command | **GOVERNED** | 审查过的原生桌面 pre-dispatch 路径 |
| DeepSeek Harness（DSH） | **GOVERNED** | pinned 的真实 pre-dispatch 工具路径 |
| Microsoft Agent Framework | **GOVERNED** | pinned 的本地 async `FunctionTool(value: str)` 路径 |
| Codex | **OBSERVED** | 真实 worker 生命周期 / 结果观察 |
| LangChain / LangGraph | **OBSERVED** | 冻结的有限 source / evidence profile |

当既不存在可信控制、也不存在足够观察时，`OPAQUE` 仍是显式的兜底分类。

当前 Evidence Projection 冻结记录：
[`kerniq_evidence_projection_v0_5_2_freeze.md`](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md)

### 当前没有声称

KerniQ 目前**没有**声称：

- 通用 LangChain support；
- 通用 Framework governance（包括超出 pinned bounded proof lane 的 Microsoft Agent Framework 支持）；
- 通用 Runtime projection；
- 所有 DSH 版本 / 工具或所有 MAF 工具类型被治理（hosted tools、MCP、provider 侧执行仍被排除）；
- Codex 或 LangChain 治理（两者保持 OBSERVED）；
- 仅凭 terminal event 就能证明物理副作用；
- 通用 cross-process exactly-once execution；
- 已获得 external validation 或 production adoption；
- 所有 action 都由 AgentFuse 保护。

对于冻结的 LangChain 轨道，边界仍然是：

```text
FULL_CAPTURE_QUALIFICATION=REJECTED
F01_FULL_CAPTURE_STATUS=UNRESOLVED
EXTERNAL_VALIDATION_PROVEN=false
ADOPTION_PROVEN=false
```

---

## 架构

### Control Plane / Evidence 视角

```text
Agent / Runtime Sources
  ├─ KerniQ 原生 Runtime
  ├─ 外部 Agent CLI / Runtime
  └─ 结构化 Trace / Event Export
                ↓
        KerniQ Control Plane
   生命周期 · 编排 · 结果汇总
                ↓
        Capability Classification
        ├─ GOVERNED ─→ AgentFuse decision gate
        ├─ OBSERVED ─→ lifecycle / evidence
        └─ OPAQUE   ─→ explicit unsupported / unknown
                ↓
        Evidence v0.2 / Projection
```

Control Plane 不会自动把“可观察 Runtime”变成“可治理 Runtime”。只有真实且经过审查的 pre-dispatch 边界存在时，才允许进入 `GOVERNED`。

### 桌面编程产品视角

```text
用户输入 → ContextEngine → MultiAgentRuntime → AgentRuntime → Provider SDK
               ↓                  ↓                   ↓
             Skills             Planner             流式输出
             Memory          Review/Refactor/           ↓
            元数据          Research/Testing        DiffEngine
             文件             专家代理              补丁提案
                                 ↓                      ↓
                             聚合报告              应用/拒绝
                                                      ↓
                                                  Git 检查点
```

---

## External Validation

当前 proof 是项目内部工程 proof，并基于保存下来的真实 source 做过独立审查；KerniQ **还没有**声称 external validation 或 adoption。

**最小本地 external validator CLI** 已经存在（使用说明见
[pilot README](docs/development/kerniq_langchain_external_validator_v0_6_3.md)）：

- 只支持一个冻结的 `OBSERVED` LangChain profile：`langchain-create-agent-tool-run-jsonl-v0.1`；
- 输入是**已有的兼容 archive**（EXISTING_ARCHIVE_ONLY），不提供 automatic capture path；
- 完全本地、只读、离线运行：严格 source qualification、Evidence v0.2 投影，以及对结果 artifact 的 replay 校验。

**内部 usability 现状**：首次 fresh-clone 内部 10 分钟 usability 因 README 的 Python 可执行文件说明 friction 如实 FAIL；文档修正后 fresh rerun 已 PASS——首次 validate 即得到 PASS artifact，首次 verify 返回 VERIFIED，约 61 秒到达 verified artifact，约 89 秒完成语义理解。这是使用 synthetic sample 的 internal usability proof，**不是** external validation、真实外部用户证明或 adoption 证明。

下一条 Evidence 主线仍是 **External Validation Pilot**：由项目外部开发者或 Agent Runtime 维护者，对其自己的真实 source / run 完成一次受限验证，并返回机器可复核的结果 artifact。目标是验证，不要求对方承诺集成。在 Pilot 成功之前，以下边界不变：不是通用 LangChain 支持；没有 LangChain governance、physical execution 或物理副作用证明；没有 model ToolCall → tool run 的 Level B 关联证明；external validation 与 adoption 均未证明。

如果愿意作为早期 validation partner，可以在
[GitHub Issues](https://github.com/MkaliezZ/qodex/issues) 留言。

---

## 快速开始

```bash
# 环境要求：Node.js 18+, pnpm 9+
pnpm install
cd apps/desktop && pnpm dev
```

打开 http://localhost:1420。

完整指南：[QUICK_START.md](docs/QUICK_START.md)

---

## 功能特性

### Control / Trust / Evidence

| 特性 | 说明 |
|:--|:--|
| **Control Plane** | 统一处理 Agent / Runtime 生命周期、编排和结果汇总，同时不假设每个 Runtime 都有相同控制能力。 |
| **Capability Classification** | 显式区分 `GOVERNED`、`OBSERVED`、`OPAQUE`。 |
| **Action Runtime** | 在支持的路径上维护 proposal / approval / decision / outcome 与 durable pre-dispatch evidence。 |
| **Session Runtime** | Append-only 本地会话历史、确定性投影以及 approval-safe restart recovery。 |
| **AgentFuse Integration** | 仅在经过审查的 execution-before seam 上做 policy evaluation；allow 不等于 execution success。 |
| **Evidence v0.2** | 将 request、authorization / decision、argument binding、execution lifecycle、outcome 明确分离。 |
| **Runtime Projection** | 从批准的 source profile 离线投影到 canonical Evidence，同时保留 unknown 与 source 限制。 |

### AI 编程产品能力

| 特性 | 说明 |
|:--|:--|
| **Provider SDK** | OpenAI、DeepSeek、OpenRouter 与兼容端点的统一接口。 |
| **Context Engine** | 规则 → 记忆 → 技能 → 元数据 → 文件 → 任务的结构化上下文组装。 |
| **Agent Runtime** | 任务生命周期、流式输出、取消与事件总线。 |
| **Managed Python** | 为经过固定与审查的 bridge / proof 路径提供用户安装的私有 CPython。 |
| **Diff Engine** | 用户批准的补丁、stale-content 检查、写入回读验证与 session rollback。 |
| **Git Runtime** | Checkpoint、commit、branch、restore。 |
| **Skill Runtime** | Markdown 技能与关键字解析。 |
| **MCP Runtime** | 外部工具发现与权限控制。 |
| **Multi-Agent Runtime** | 面向 Review / Refactor / Research / Testing 等工作流的协调与专家 Agent。 |
| **Project Runtime** | 打开本地项目、构建文件树、读取和选择文件。 |

---

## 仓库结构

主要组件选列（不是完整 package 清单）：

```text
qodex/                      ← 历史仓库名称
├── apps/desktop/           ← Tauri + React 桌面 UI
├── packages/               ← 产品 Runtime 与 adapter，包括
│   ├── control-plane / action / session runtimes
│   ├── agentfuse-adapter · dsh-control-plane-observer
│   ├── codewhale-engine-adapter（governed-engine spike）
│   ├── coding-pack-runtime / -store / -agentfuse
│   └── provider / agent / multi-agent / project / skill / MCP / Git runtimes …
├── python/
│   ├── kerniq_agentfuse_bridge/        ← canonical AgentFuse loader / bridge
│   ├── kerniq_evidence_conformance/    ← Evidence v0.2 conformance
│   ├── kerniq_evidence_projection/     ← 经过审查的离线 source projection
│   ├── kerniq_external_validation/     ← 最小本地 external validator / pilot
│   └── kerniq_microsoft_agent_framework/ ← bounded MAF governed backend proof
├── docs/                   ← 规范、proof、指南与开发日志
└── qodex-config/           ← AI Agent 工作空间（rules / memory / ADR / skills）
```

> **兼容性说明：** 为避免破坏现有集成和本地数据，`@qodex/*` 包名、
> `qodex-config/` 以及相关持久化标识暂时保持不变。

---

## Validation & Tests

核心 workspace 测试：

```bash
pnpm -r test
```

README 顶部的 GitHub CI badge 表示当前核心 workflow 状态。这里不再维护容易过期的静态“总测试数” badge。

Evidence Projection v0.5.2 freeze 在 CPython 3.11 和 3.13 上独立执行了：

| Suite | 数量 |
|:--|--:|
| LangChain limited projection | 32 passed |
| DSH projection | 21 passed |
| Evidence v0.2 conformance | 46 passed |
| **总计** | **99 passed** |

当前 GitHub CI workflow **尚未执行**这三组新增的离线 Evidence suites；上面的 99 项结果属于 freeze 时的独立验证，不是远端 Evidence CI coverage。精确命令与 claim boundary 见
[v0.5.2 freeze record](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md)。

---

## 开发轨道说明

KerniQ 存在多条开发轨道，milestone 编号都是**轨道内局部编号**——它们是有边界的开发 / proof 标签，并不都是语义化版本的产品 release：

- **Product / Desktop milestones**：桌面产品、原生执行、Coding Pack、安装（如 v0.4 agent loop、v0.6 managed Python、v0.7 Coding Pack、v0.8 安装器工作）。
- **Control-plane / runtime integration proofs**：真实 runtime 治理与协调 evidence（如 v0.2 DSH governance proof、v0.3 多 Agent wiring、v0.8 Microsoft Agent Framework proof）。
- **Evidence / Protocol proof milestones**：Evidence contract、source qualification、projection 与 proof boundary（如 Evidence v0.2、v0.5.2 projection freeze、v0.6.x LangChain profile 与 validator）。

同一个数字可能出现在不同轨道（产品 v0.3 Real Patch Loop 与 control-plane v0.3 Governed Multi-Agent Wiring；产品 v0.8、CodeWhale v0.8.0 spike 与 MAF governance proof v0.8）。**Evidence Projection v0.5.2 不代表整个 KerniQ 产品版本“退回”到产品 v0.5.2**，proof milestone 编号也不是产品 release 版本。历史 milestone 不重新编号。

---

## 文档

| 文档 | 说明 |
|:--|:--|
| [Quick Start](docs/QUICK_START.md) | 快速启动 |
| [Installation](docs/INSTALLATION.md) | macOS / Windows / Linux 安装 |
| [Architecture](docs/ARCHITECTURE.md) | 产品架构 |
| [Evidence Projection v0.5.2 Freeze](docs/development/kerniq_evidence_projection_v0_5_2_freeze.md) | Evidence v0.2 / DSH / limited LangChain projection 的冻结 claim 与 non-claim |
| [DSH + AgentFuse Governance Proof v0.2](docs/development/kerniq_dsh_agentfuse_governance_v0_2.md) | 真实 DeepSeek Harness pre-dispatch 治理：BLOCK 不执行、ALLOW 到达执行 |
| [Microsoft Agent Framework Governance Proof v0.8](docs/development/kerniq_microsoft_agent_framework_governance_proof_v0_8.md) | 一个 pinned 本地 async FunctionTool 边界的真实 single-agent 与官方 `Agent.as_tool` 委派治理 proof |
| [External Validator Pilot README](docs/development/kerniq_langchain_external_validator_v0_6_3.md) | 一个冻结 OBSERVED LangChain profile 的最小本地 external validator 使用说明 |
| [Dev Log](docs/development/DEVLOG.md) | 开发历史 |
| [Product Roadmap](docs/development/PRODUCT_ROADMAP.md) | 产品与分发里程碑 |
| [ADR Records](qodex-config/adr/) | 架构决策记录 |

更完整的历史产品里程碑与安全边界以英文 README、Roadmap 和 `docs/development/` 中的冻结文档为准；本中文首页重点保持当前定位、proof status、capability model 和 claim boundary 与英文版一致。

---

## 贡献

- Setup：`pnpm install && cd apps/desktop && pnpm dev`
- Tests：`pnpm -r test`
- ADR：`qodex-config/adr/`
- 完整说明：[CONTRIBUTING.md](CONTRIBUTING.md)

---

## License

MIT — 见 [LICENSE](LICENSE)。
