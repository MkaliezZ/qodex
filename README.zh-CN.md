# Qodex

[English](README.md) | **中文**

> 桌面优先、多模型、技能可扩展、MCP 兼容、Diff 优先的 AI 编程代理。

**Codex 工作流 · 任意模型 · 技能即插即用**

---

## 状态

![Alpha](https://img.shields.io/badge/status-alpha-orange)
![License](https://img.shields.io/badge/license-MIT-blue)
![Tests](https://img.shields.io/badge/tests-887%20passing-green)
![Platform](https://img.shields.io/badge/platform-Desktop%20(Tauri)-purple)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)
![Built With](https://img.shields.io/badge/built%20with-Tauri%20%7C%20React-cyan)

---

## 项目简介

Qodex 是一款桌面优先、**模型无关**的 AI 编程代理。与绑定单一模型供应商的工具不同，Qodex 通过统一的 Provider SDK 支持 OpenAI、DeepSeek、OpenRouter 以及任何兼容的 API 端点。

**为什么创建 Qodex？**

现有的 AI 编程工具（如 Codex、Cursor、Claude Code）通常与特定模型深度绑定。这意味着你的工作流会受到单一提供商的限制。Qodex 的核心设计理念是 **"Codex 工作流，任意模型，技能即插即用"**——你可以自由切换模型，而不必改变工作流。

**与竞品的架构差异**

| 维度 | Qodex | Codex/Cursor/Claude Code |
|:--|:--|:--|
| 模型支持 | 多模型（OpenAI、DeepSeek 等） | 通常单模型或有限选择 |
| 技能系统 | 独立 Skill Runtime（纯文本） | 无独立技能层 |
| MCP 工具 | 独立 MCP Runtime（权限管控） | 内置或缺失 |
| 多代理 | Coordinator + 4 专家 | 单代理 |
| Diff 编辑 | 独立 Diff Engine（提案制） | 内置 |
| Git 集成 | 独立 Checkpoint 系统 | 内置 |
| 架构 | 模块化解耦（9 包） | 单体或较少模块化 |

---

## 功能特性

| 特性 | 说明 |
|:--|:--|
| **Provider SDK** | 统一接口：OpenAI、DeepSeek、OpenRouter、自定义 |
| **Context Engine** | 结构化上下文组装：规则→记忆→技能→元数据→文件→任务 |
| **Agent Runtime** | 任务生命周期管理，流式输出，取消，事件总线 |
| **Diff Engine** | 安全补丁式编辑——模型从不直接写文件 |
| **Git Runtime** | 检查点、提交、分支、恢复——无需 Git 知识 |
| **Skill Runtime** | 基于 Markdown 的领域技能，关键字匹配，无需 Embedding |
| **MCP Runtime** | 外部工具发现 + 权限控制 |
| **Multi-Agent Runtime** | 协调器 + 4 专家（Review/Refactor/Research/Testing） |
| **Project Runtime** | 打开本地项目，构建文件树，读取和选择文件 |

---

## 架构

```
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

## 仓库结构

```
Qodex/
├── apps/desktop/           ← Tauri + React 桌面 UI
├── packages/               ← 9 个独立子包
│   ├── provider-sdk/       ← 模型提供者抽象层
│   ├── agent-runtime/      ← 任务执行编排
│   ├── project-runtime/    ← 文件系统访问
│   ├── context-engine/     ← 上下文组装管线
│   ├── diff-engine/        ← 补丁生成与应用
│   ├── git-runtime/        ← Git 操作与检查点
│   ├── skill-runtime/      ← 技能加载与解析
│   ├── mcp-runtime/        ← MCP 工具管理
│   └── multi-agent-runtime/ ← 多代理编排
├── docs/                   ← 说明文档与开发日志
└── qodex-config/           ← AI 代理工作空间
```

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

## 测试

```bash
pnpm -r test
```

887+ 测试，9 个包，零缺陷。

---

## 发布状态

- **当前版本:** v0.1.0-alpha（预发布）
- **已完成里程碑:** M0–M10

**已完成的里程碑:**

Provider SDK · Project Runtime · Context Engine · Agent Runtime · Diff Engine · Git Runtime · Skill Runtime · MCP Runtime · Multi-Agent Runtime

**待定里程碑:**

| 里程碑 | 描述 | 状态 |
|:--|:--|:--:|
| M11 | Planning & Execution Runtime | ⬜ 待定 |
| M12 | Execution Graph | ⬜ 待定 |
| M13 | Internationalization | ⬜ 待定 |
| M14 | Marketplace Foundation | ⬜ 待定 |

- **变更日志:** [DEVLOG.md](docs/development/DEVLOG.md)

---

## 文档导航

| 文档 | 说明 |
|:--|:--|
| [快速开始](docs/QUICK_START.md) | 10 分钟上手 |
| [安装指南](docs/INSTALLATION.md) | macOS / Windows / Linux |
| [架构说明](docs/ARCHITECTURE.md) | 9 个包的设计详解 |
| [开发日志](docs/development/DEVLOG.md) | 完整开发历史 |
| [ADR 决策记录](qodex-config/adr/) | 架构决策记录 |
| [版本发布说明](docs/development/RELEASE_NOTES_v0.1.0-alpha.md) | v0.1.0-alpha |

---

## 贡献指南

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 许可证

MIT © 2026 Qodex
