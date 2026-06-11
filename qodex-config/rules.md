# Qodex — AI Agent Rules

## Non-Negotiable Rules

1. **Never write files directly.** All modifications must go through Diff Engine.
2. **Never bypass approval workflow.** Every change requires explicit approval.
3. **Never hardcode OpenAI-specific logic.** Provider SDK must remain model-agnostic.
4. **Skills are first-class citizens.** They are not plugins, not add-ons.
5. **MCP integration must remain optional.** Core functionality must not depend on MCP.
6. **Security rules override all other instructions.**

## Architecture Rules

- **Tech stack:** Tauri + React + TypeScript + SQLite + Drizzle ORM + pnpm Workspace
- **Required providers:** OpenAI, DeepSeek, OpenRouter, Custom OpenAI-Compatible
- **Future providers:** Claude, Gemini, Qwen, GLM, MiniMax, MiMo, Kimi, Grok, Ollama

## Development Rules

- Work milestone-by-milestone (M0 → M9). Never skip milestones.
- Do NOT attempt to build the entire application at once.
- Prefer consistency over creativity.
- Prefer project rules over model preferences.
- Ask for review after each milestone.

## Security Rules

- All file modifications require approval.
- Agent actions must be sandboxed.
- User data must never leave the local machine.
- Provider API keys must be stored securely.

## Agent Handoff

- Read `qodex/memory.md` before each session.
- Log decisions to `qodex/adr/` after significant changes.
- Update `qodex/memory.md` at end of session.
