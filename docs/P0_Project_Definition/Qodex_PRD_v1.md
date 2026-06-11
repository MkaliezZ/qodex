# Qodex PRD v1.0

## Product Name
Qodex

## Slogan
**Codex Workflow, Any Model.**

## Vision
Build a desktop-first coding agent platform that combines:
- Codex-like workflow
- Multi-model support
- Skills ecosystem
- Open architecture

Users can freely switch between GPT, DeepSeek, Claude, Gemini, Qwen, GLM, MiniMax, MiMo and future models without losing the agent experience.

---

## Problem Statement

### Codex
**Pros**
- Excellent workflow
- Strong project understanding
- Skills support

**Cons**
- OpenAI model lock-in
- Usage limits

### Codex++
**Pros**
- Multi-model

**Cons**
- Weak Skills support

### OpenClaw
**Pros**
- Open source
- Flexible

**Cons**
- Complex user experience

---

## Product Goals

Qodex should provide:
1. Desktop-first experience
2. Multi-model support
3. Skills support
4. Agent workflow
5. Local-first architecture
6. Git-native workflow

---

## Target Users

### Primary
Heavy Codex users who frequently exhaust Codex quotas.

### Secondary
- Claude Code users
- OpenClaw users
- Professional software engineers
- AI-first startups

---

## Core Features

### Project Workspace
Open local repositories.
Support:
- Git
- Monorepos
- Multiple workspaces

### Agent Chat
Chat with project context.
Examples:
- Analyze project
- Fix bug
- Refactor module
- Add feature

### Model Switcher
One-click switching.

Supported:
- OpenAI
- Anthropic
- DeepSeek
- Gemini
- Qwen
- GLM
- MiniMax
- MiMo
- Grok
- OpenRouter
- Ollama
- Custom Provider

### Skills
Folder structure:
`.qodex/skills/`

Each skill contains:
- SKILL.md
- Resources
- Optional scripts

Examples:
- SEO
- Freight Forwarding
- Code Review
- DevOps
- Documentation

### Diff Approval
Default workflow:
1. Analyze
2. Generate diff
3. User review
4. Apply

### Git Integration
- Branches
- Commit
- Diff
- Pull Request preparation

### Tool Runtime
- File Read
- File Write
- Shell
- Git
- Browser
- Search
- MCP

---

## Architecture

Qodex Desktop
- React Frontend
- Agent Runtime
- Skill Engine
- Context Manager
- Tool Runtime
- Model Router
- Security Layer

---

## MVP Scope (v0.1)

Features:
- Open project
- Chat
- OpenAI provider
- DeepSeek provider
- Skills
- Diff generation
- Apply changes
- Git integration

Not included:
- Cloud sync
- Marketplace
- Team collaboration

---

## Future Versions

### v0.5
- Claude
- Gemini
- Qwen
- GLM
- MiniMax
- MiMo
- OpenRouter
- Ollama

### v1.0
- Skill Marketplace
- Cloud Sync
- Team Collaboration
- Hosted Agent Runtime
- Remote Execution

---

## Competitive Advantage

Qodex is not another AI IDE.

Qodex is a model-agnostic coding agent platform.

Users own:
- Their models
- Their skills
- Their workflows

No vendor lock-in.
