# Qodex Architecture v1.0

## 1. Product Positioning

Qodex is a desktop-first, model-agnostic coding agent platform.

Its goal is not to become another IDE, but to provide a Codex-like agent workflow with:

- Multi-model support
- Skills support
- Local-first project access
- Diff-based approval
- Secure tool execution
- Beautiful desktop UX

Core product sentence:

> Codex Workflow, Any Model, Skills Included.

---

## 2. High-Level Architecture

```text
Qodex Desktop
├── UI Layer
│   ├── Workspace Shell
│   ├── Chat / Agent Panel
│   ├── Model Switcher
│   ├── Skill Drawer
│   ├── Diff Viewer
│   └── Task Timeline
│
├── Agent Runtime
│   ├── Planner
│   ├── Context Manager
│   ├── Tool Orchestrator
│   ├── Memory Manager
│   ├── Patch Generator
│   └── Review Loop
│
├── Skill Engine
│   ├── Skill Loader
│   ├── Skill Resolver
│   ├── Skill Context Injector
│   ├── Skill Script Runner
│   └── Skill Permission Guard
│
├── Model Router
│   ├── OpenAI Provider
│   ├── DeepSeek Provider
│   ├── Anthropic Provider
│   ├── Gemini Provider
│   ├── Qwen Provider
│   ├── GLM Provider
│   ├── MiniMax Provider
│   ├── Xiaomi MiMo Provider
│   ├── OpenRouter Provider
│   ├── Ollama Provider
│   └── Custom Provider
│
├── Tool Runtime
│   ├── File System Tool
│   ├── Shell Tool
│   ├── Git Tool
│   ├── Search Tool
│   ├── Browser Tool
│   ├── Test Runner
│   └── MCP Bridge
│
├── Security Layer
│   ├── Permission Policy
│   ├── Secret Scanner
│   ├── Command Approval
│   ├── Diff Approval
│   └── Sandbox Boundary
│
└── Local Storage
    ├── SQLite
    ├── Project Index
    ├── Sessions
    ├── Settings
    ├── Provider Configs
    └── Skill Registry
```

---

## 3. Runtime Flow

### 3.1 Normal Coding Task

```text
User prompt
↓
Skill Resolver
↓
Context Manager
↓
Model Router
↓
Agent Planner
↓
Tool Runtime
↓
Patch Generator
↓
Diff Viewer
↓
User Approval
↓
File Write / Git Commit
```

### 3.2 Skill-Based Task

```text
User calls $seo
↓
Skill Loader reads .qodex/skills/seo/SKILL.md
↓
Skill context is injected
↓
Agent follows skill workflow
↓
Tools execute with permission checks
↓
Result is returned as diff/report
```

### 3.3 Multi-Model Workflow

Example:

```text
DeepSeek
↓
Generate implementation

GPT / Claude
↓
Review diff

User
↓
Approve patch
```

Qodex should support different model roles:

- Planning Model
- Coding Model
- Review Model
- Cheap Batch Model
- Local Model

---

## 4. Core Modules

## 4.1 UI Layer

Responsibilities:

- Project navigation
- Agent conversation
- Model switching
- Skill selection
- Diff review
- Tool approval
- Task status visibility

Recommended stack:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Monaco Editor

---

## 4.2 Agent Runtime

Responsibilities:

- Convert user intent into executable steps
- Decide what files to inspect
- Manage context budget
- Call tools
- Generate patches
- Ask for approval before risky actions

Key interfaces:

```ts
interface AgentTask {
  id: string
  projectId: string
  prompt: string
  selectedModel: string
  selectedSkills: string[]
  status: "idle" | "planning" | "running" | "reviewing" | "done" | "failed"
}
```

---

## 4.3 Model Router

The Model Router normalizes different model providers into a single interface.

```ts
interface ModelProvider {
  id: string
  name: string
  protocol: "openai-chat" | "openai-responses" | "anthropic" | "gemini" | "custom"
  chat(input: ModelInput): AsyncIterable<ModelChunk>
  supportsToolUse: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  contextWindow?: number
}
```

Provider groups:

### International Providers

- OpenAI
- Anthropic
- Google Gemini
- xAI Grok
- Mistral

### China Providers

- DeepSeek
- Qwen / Alibaba
- GLM / Zhipu / Z.AI
- MiniMax
- Xiaomi MiMo
- Moonshot / Kimi
- Baichuan
- Tencent Hunyuan
- StepFun
- SiliconFlow

### Aggregators

- OpenRouter
- SiliconFlow
- OneAPI
- New API
- LiteLLM Proxy
- 302.AI

### Local Providers

- Ollama
- LM Studio
- llama.cpp server
- vLLM server

---

## 4.4 Skill Engine

Skill directory:

```text
.qodex/
└── skills/
    ├── code-review/
    │   ├── SKILL.md
    │   ├── resources/
    │   └── scripts/
    ├── seo/
    ├── freight-forwarding/
    └── devops/
```

Skill metadata format:

```yaml
name: code-review
description: Review code changes for safety, consistency, and maintainability.
permissions:
  file_read: true
  file_write: false
  shell: false
  network: false
```

Skill activation methods:

- Manual: `$code-review`
- Auto: based on user intent
- Project default: configured in `.qodex/config.toml`

---

## 4.5 Tool Runtime

Tools must be permissioned.

Default policy:

```text
Read files: allowed after project is opened
Write files: requires diff approval
Shell command: requires approval
Network access: requires approval
Secret access: blocked by default
Git commit: requires approval
```

Tool interface:

```ts
interface Tool {
  name: string
  description: string
  riskLevel: "low" | "medium" | "high"
  execute(input: unknown): Promise<ToolResult>
}
```

---

## 4.6 Context Manager

Responsibilities:

- Select relevant files
- Summarize project structure
- Track edited files
- Avoid unnecessary full-repo scans
- Preserve coding consistency

Context sources:

- User prompt
- Open files
- Git diff
- Project index
- Skill instructions
- Prior session memory
- `.qodex/rules.md`

Important rule:

> Qodex should prefer targeted context over full repository loading.

---

## 4.7 Storage

Use SQLite.

Tables:

```text
projects
sessions
messages
provider_configs
skills
skill_runs
tool_calls
patches
settings
```

---

## 5. Security Model

Qodex must assume third-party skills may be unsafe.

Security rules:

1. Never run skill scripts without explicit permission.
2. Never send `.env`, private keys, or secrets to models.
3. Never write files without user approval.
4. Always show diff before applying changes.
5. Always log tool calls.
6. Allow project-level trust settings.

---

## 6. MVP Architecture

v0.1 should include:

- Tauri desktop app
- React UI
- Open local project
- Chat with agent
- OpenAI provider
- DeepSeek provider
- OpenRouter provider
- Custom provider
- Basic Skill Engine
- File read
- Patch generation
- Diff approval
- File write after approval
- Git diff view

v0.1 should not include:

- Cloud sync
- Team collaboration
- Marketplace
- Remote runtime
- Auto PR creation

---

## 7. Development Priority

### P0

- Desktop shell
- Project open
- Provider config
- Model switcher
- Agent chat
- File read
- Diff generation
- Diff approval
- Apply patch

### P1

- Skills
- Git integration
- Shell approval
- Multiple providers
- Session storage

### P2

- MCP
- Browser tool
- Review model
- Project memory
- Auto skill detection

### P3

- Marketplace
- Team workspace
- Cloud runtime
- Hosted skills

---

## 8. Key Product Principles

1. The user must always know what the agent is doing.
2. The model must be easy to switch.
3. Skills must be first-class.
4. Diff approval is mandatory by default.
5. Third-party models should feel native.
6. Beautiful UI is part of the product, not decoration.
