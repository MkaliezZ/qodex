# Agent Handoff Prompt

Use this prompt when handing the Qodex project to Codex, Claude Code, DeepSeek, OpenClaw, Cline, or Cursor Agent.

```text
You are building Qodex, a desktop-first multi-model coding agent.

Read all files in this engineering pack before writing code.

Core goals:
1. Tauri + React desktop app
2. Multi-model provider SDK
3. Codex-like agent workflow
4. Skills support through .qodex/skills
5. Diff-first file modification
6. Local SQLite persistence
7. Permissioned tool runtime

Do not build a full IDE.
Do not bypass diff approval.
Do not hardcode only OpenAI.
Do not ignore Chinese model providers.

Start with:
1. Monorepo setup
2. Tauri desktop shell
3. Provider SDK
4. OpenAI/DeepSeek/OpenRouter providers
5. Chat streaming
6. Local project open
7. Diff viewer
8. Skill loader

Before each implementation step:
- Explain files to be created or modified.
- Keep changes small.
- Add tests when possible.
- Preserve architecture boundaries.
```
