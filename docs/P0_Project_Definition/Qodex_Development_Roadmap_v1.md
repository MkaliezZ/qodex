# Qodex Development Roadmap v1.0

## Development Assumption

Team:

- 1 founder / product owner
- Codex as primary coding assistant
- DeepSeek / Claude / GPT as supporting agents

Target:

- Desktop-first
- Multi-model
- Skills-supported
- Local-first

---

## Estimated Timeline

| Stage | Goal | Estimated Time |
|---|---|---|
| Prototype | UI shell + mock agent flow | 1-2 weeks |
| MVP v0.1 | Real project + real model + diff flow | 4-6 weeks |
| Alpha v0.3 | Skills + provider system + git | 2-3 months |
| Beta v0.5 | More models + MCP + stable UX | 4-6 months |
| Public v1.0 | Installer + marketplace foundation | 6-9 months |

---

## Phase 0: Product Foundation

Duration: 3-5 days

Deliverables:

- PRD
- Tech Stack
- Architecture
- UI Design Spec
- Roadmap
- GitHub repo
- Initial issue board

Key decisions:

- Tauri or Electron
- Provider abstraction
- Skill format
- Permission model
- MVP scope

Recommended choice:

```text
Tauri + React + TypeScript + Rust
```

---

## Phase 1: UI Prototype

Duration: 1-2 weeks

Goal:

Build the Qodex desktop shell with beautiful fluid UI.

Features:

- Welcome screen
- Project open screen
- Workspace layout
- Chat panel
- Right context panel
- Model switcher mock
- Skill drawer mock
- Diff viewer mock

No real agent needed yet.

Success criteria:

- The app feels visually premium.
- The model switcher is prominent.
- The Skill system is visible.
- The layout feels better than a normal chatbot.

---

## Phase 2: Real Model Connection

Duration: 1-2 weeks

Features:

- Provider settings page
- OpenAI provider
- DeepSeek provider
- OpenRouter provider
- Custom OpenAI-compatible provider
- Streaming responses
- Model switcher works for real

Success criteria:

- User can switch model without editing config files.
- User can chat with at least OpenAI and DeepSeek.
- OpenRouter can expose many third-party models.

---

## Phase 3: Local Project Runtime

Duration: 1-2 weeks

Features:

- Open local repository
- Read file tree
- Search files
- Select context files
- Read files with user approval
- Generate code suggestions

Success criteria:

- Agent can understand selected project files.
- Agent does not scan the whole repo unnecessarily.
- User can control project context.

---

## Phase 4: Diff Approval

Duration: 1-2 weeks

Features:

- Generate patch
- Show diff
- Apply changes
- Reject changes
- File-by-file review
- Git status display

Success criteria:

- Agent never silently modifies files.
- User can see exactly what will change.
- Patch apply is reliable.

---

## Phase 5: Skill Engine

Duration: 2-3 weeks

Features:

- `.qodex/skills/` loader
- `SKILL.md` parser
- `$skill-name` command
- Skill activation from UI
- Skill permission display
- Skill context injection

Success criteria:

- DeepSeek, OpenAI, Claude, and other models can all use the same Skill format.
- Qodex can do what Codex++ cannot: multi-model + Skills.

---

## Phase 6: Git + Shell Runtime

Duration: 2-3 weeks

Features:

- Git diff
- Git branch
- Commit preparation
- Shell command proposal
- Shell approval modal
- Test command runner

Success criteria:

- Qodex can safely run project tests.
- User approves risky shell commands.
- Git workflow is visible in UI.

---

## Phase 7: Provider Expansion

Duration: 3-5 weeks

Add native providers:

- Anthropic
- Gemini
- Qwen
- GLM
- MiniMax
- Xiaomi MiMo
- Moonshot / Kimi
- Grok
- Ollama
- LM Studio
- SiliconFlow

Success criteria:

- Qodex becomes model-agnostic.
- Chinese model support becomes a major differentiator.

---

## Phase 8: MCP + Advanced Agent

Duration: 3-5 weeks

Features:

- MCP server integration
- Browser tool
- Review model
- Multi-model workflow
- Agent memory
- Rules file

Example workflow:

```text
DeepSeek writes code
GPT reviews code
User approves diff
Qodex applies patch
```

---

## Phase 9: Public Beta

Duration: 1-2 months

Features:

- macOS installer
- Windows installer
- Auto update
- Crash logging
- Documentation
- Example skills
- Provider setup guides

Initial skills:

- code-review
- refactor
- seo
- freight-forwarding
- docs
- devops

---

## Phase 10: v1.0

Target:

- Stable desktop app
- Beautiful UI
- Multi-model support
- Skill ecosystem
- Local-first coding workflow

Possible v1.0 features:

- Skill marketplace foundation
- Team-shared skill packs
- Cloud sync
- Hosted runtime
- Remote agents

---

## MVP Cut Line

Do not include in v0.1:

- Marketplace
- Team features
- Cloud sync
- Remote sandbox
- Auto PR creation
- Full IDE replacement
- Browser automation

Must include in v0.1:

- Desktop UI
- Model switcher
- OpenAI
- DeepSeek
- OpenRouter
- Custom provider
- Local project
- Diff approval
- Basic Skills

---

## Main Risk

Scope explosion.

Qodex should not try to beat:

- Cursor
- Codex
- Claude Code
- OpenClaw
- VS Code

at the same time.

The first version should only prove one thing:

> Codex-like workflow can work with any model and Skills.
