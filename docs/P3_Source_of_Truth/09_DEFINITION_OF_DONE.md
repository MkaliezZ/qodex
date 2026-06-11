# Qodex Definition of Done

## Global DoD

A task is done only when:

1. Code compiles.
2. TypeScript strict mode passes.
3. No `any` unless explicitly justified.
4. Feature respects architecture boundaries.
5. UI state is handled.
6. Errors are handled.
7. User-facing copy is clear.
8. Security rules are respected.
9. Audit logs are written for risky actions.
10. Documentation is updated when needed.

---

# Feature DoD

## Provider

A provider is done when:

- It implements `ModelProvider`.
- It supports streaming.
- It normalizes errors.
- It has connection test.
- It never logs API keys.
- It has at least one manual test.

## Skill Engine

Done when:

- Loads skill directory.
- Validates `skill.json`.
- Reads `SKILL.md`.
- Supports `$skill-name`.
- Checks permissions.
- Logs skill run.

## Diff Engine

Done when:

- Parses unified diff.
- Validates project root.
- Shows file list.
- Shows side-by-side diff.
- Applies patch after approval.
- Rejects patch safely.
- Logs patch status.

## Agent Runtime

Done when:

- Creates task.
- Streams model output.
- Selects context.
- Handles errors.
- Creates patch.
- Updates task status.
- Persists messages.

## UI Component

Done when:

- Has loading state.
- Has empty state.
- Has error state.
- Is keyboard accessible.
- Works in dark mode.
- Matches design tokens.

## Database Migration

Done when:

- Migration is numbered.
- Migration is reversible if possible.
- Foreign keys are respected.
- Indexes are added for common queries.
- Drizzle schema updated.

## Permission Feature

Done when:

- Risk level is defined.
- Approval modal appears when required.
- Denied action is logged.
- User can understand what is being requested.

---

# MVP Done

MVP is done when:

- User can install app.
- User can open local project.
- User can configure OpenAI, DeepSeek, OpenRouter, or custom provider.
- User can send prompt.
- Agent can read selected files.
- Agent can generate patch.
- User can review diff.
- User can apply patch.
- Skill loading works.
- Audit logs exist.
- App does not silently write files.
