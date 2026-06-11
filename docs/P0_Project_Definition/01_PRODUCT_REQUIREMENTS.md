# Qodex Product Requirements

## Vision

Qodex provides a Codex-like desktop coding agent experience without vendor lock-in.

## Positioning

Qodex is not:

- An IDE replacement
- A chatbot wrapper
- A pure CLI tool

Qodex is:

- A desktop AI coding agent
- A multi-model agent runtime
- A skill-enabled development cockpit
- A local-first project assistant

## Target Users

Primary users:

- Heavy Codex users who hit usage limits
- Developers who want to use DeepSeek, Claude, Gemini, Qwen, GLM, MiniMax, MiMo, Kimi, Grok and local models
- AI-first developers managing multiple model subscriptions

Secondary users:

- Open-source maintainers
- Solo founders
- AI agent framework builders

## MVP Functional Requirements

### Project Workspace

- Open a local folder
- Detect Git repository
- Display project tree
- Search files
- Select files as context

### Agent Chat

- Streaming model response
- Tool call cards
- File reference cards
- Markdown rendering
- Code blocks
- Task status timeline

### Model System

- One-click model switcher
- Provider settings
- API key storage
- Connection testing
- Custom provider support

### Provider Support

MVP:

- OpenAI
- DeepSeek
- OpenRouter
- Custom OpenAI-compatible

Post-MVP:

- Anthropic
- Gemini
- Qwen
- GLM
- MiniMax
- Xiaomi MiMo
- Moonshot Kimi
- Grok
- Ollama
- LM Studio

### Skill System

- Load `.qodex/skills`
- Parse `SKILL.md`
- Manual activation with `$skill-name`
- Skill permissions
- Skill resources

### Diff Workflow

- Agent proposes patch
- User reviews diff
- User applies or rejects
- All applied patches logged

### Permissions

Default mode: Review Mode.

- File read: allowed inside opened project
- File write: requires diff approval
- Shell: requires explicit approval
- Network: requires explicit approval
- Git commit: requires approval

## Non-Goals for MVP

- Marketplace
- Cloud sync
- Team collaboration
- Remote agent runtime
- Full browser automation
- Full IDE feature parity
