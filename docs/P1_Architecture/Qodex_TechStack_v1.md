# Qodex Technical Stack v1.0

## Core Principles

- Desktop-first
- Local-first
- Multi-model
- Skill-driven
- Vendor-neutral

---

## Frontend

### Framework
- React
- TypeScript
- Vite

### UI
- Tailwind CSS
- shadcn/ui

### State Management
- Zustand

---

## Desktop Runtime

### Recommended
- Tauri
- Rust

Reasons:
- Lightweight
- Fast startup
- Native desktop experience
- Smaller memory footprint than Electron

---

## Agent Core

### Language
- TypeScript

### Orchestration
- LangGraph

### Agent Modules
- Planner
- Context Manager
- Tool Runtime
- Skill Engine
- Model Router

---

## Skill System

Directory:

```text
.qodex/
└── skills/
    ├── seo/
    ├── freight/
    ├── review/
    └── devops/
```

Each skill:
- SKILL.md
- Resources
- Scripts (optional)

---

## Tool Runtime

Built-in tools:
- File Read
- File Write
- Shell
- Git
- Browser
- Search
- MCP

Security:
- Permission prompts
- Command approval
- Diff approval

---

## Database

### Local Storage
- SQLite

### ORM
- Drizzle ORM

Stores:
- Projects
- Sessions
- Settings
- Skills
- Model configs

---

## Git Integration

Libraries:
- simple-git
- libgit2

Features:
- Commit
- Branch
- Diff
- Patch apply
- PR preparation

---

## Code Editor

- Monaco Editor

Features:
- Syntax highlighting
- Diff view
- Patch review

---

## Supported Model Providers

### Native Providers
- OpenAI
- Anthropic
- DeepSeek
- Gemini
- Qwen
- GLM
- MiniMax
- MiMo
- Grok

### Aggregators
- OpenRouter
- SiliconFlow
- OneAPI-compatible gateways

### Local Models
- Ollama
- LM Studio

### Custom Providers
User-defined:
- Base URL
- API Key
- Model Name
- Protocol

---

## Distribution

Platforms:
- macOS
- Windows
- Linux

Packaging:
- Tauri Bundler
- Auto-update support

---

## MVP Development Roadmap

### Phase 1
- Desktop shell
- Project loading
- Chat interface
- OpenAI support
- DeepSeek support

### Phase 2
- Skills
- Git integration
- Diff approval
- Context manager

### Phase 3
- Multi-provider support
- MCP integration
- Plugin ecosystem

### Phase 4
- Marketplace
- Team collaboration
- Cloud sync
