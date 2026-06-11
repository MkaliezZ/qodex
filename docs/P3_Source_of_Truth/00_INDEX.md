# Qodex Source-of-Truth Spec Pack

This pack is intended to be handed directly to coding agents.

Use it as the authoritative implementation reference for Qodex.

## Files

1. `01_API_CONTRACT_OPENAPI_JSON_SCHEMA.md`
2. `02_SQL_SCHEMA_AND_MIGRATIONS.md`
3. `03_FIGMA_COMPONENT_STATE_DIAGRAM.md`
4. `04_PROVIDER_SDK_EXAMPLE_IMPLEMENTATION.md`
5. `05_SKILL_DSL_EBNF.md`
6. `06_MCP_ADAPTER_PROTOCOL.md`
7. `07_AGENT_RUNTIME_SEQUENCE_DIAGRAM.md`
8. `08_GITHUB_ISSUE_BREAKDOWN_180.md`
9. `09_DEFINITION_OF_DONE.md`

## Product Summary

Qodex is a desktop-first, multi-model, skill-enabled coding agent.

Core promise:

> Codex-like workflow, any model, skills included.

## MVP Must-Haves

- Tauri desktop app
- React UI
- SQLite local persistence
- Multi-provider model router
- OpenAI / DeepSeek / OpenRouter / Custom provider
- Local project open
- Agent chat
- Context selection
- Diff generation
- Diff approval
- Patch apply
- Skill loader
- Permission model
- Audit logs
