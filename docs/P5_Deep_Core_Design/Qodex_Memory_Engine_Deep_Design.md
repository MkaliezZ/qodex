# Qodex Memory Engine Deep Design

## 1. Purpose

The Memory Engine preserves long-term project consistency.

It answers:

- What architecture choices have already been made?
- What coding style does this project use?
- What should agents avoid changing?
- What previous decisions matter for this task?

The Memory Engine is critical because Qodex supports many models. Without shared memory, every model may reinterpret the project differently.

---

## 2. Memory Layers

```text
Session Memory
Project Memory
Architecture Memory
User Preference Memory
Skill Memory
Audit Memory
```

---

## 3. Session Memory

Short-term conversation memory.

Stores:

- current task
- recent messages
- active model
- selected files
- generated patch
- unresolved errors

TTL:

- attached to session
- never automatically injected into unrelated sessions

---

## 4. Project Memory

Long-term project-specific memory.

Examples:

```text
This project uses Tauri + React.
Provider SDK must remain model-agnostic.
All file writes must go through Diff Engine.
DeepSeek is allowed for coding but GPT/Claude should review architecture changes.
```

Stored in:

```text
.qodex/memory.md
```

and SQLite.

---

## 5. Architecture Memory

Architecture decisions should be stored as ADRs.

Directory:

```text
.qodex/adr/
```

Example:

```md
# ADR-001 Use Tauri

## Decision
Use Tauri instead of Electron.

## Reason
Lower memory usage and better native desktop packaging.

## Consequences
Rust sidecar required for native operations.
```

---

## 6. User Preference Memory

Only store project-related preferences.

Examples:

- User prefers simple implementation.
- User wants UI to feel fluid and glass-like.
- User wants broad support for Chinese model providers.
- User does not want CLI-first UX.

Do not store sensitive personal details unless explicitly requested.

---

## 7. Skill Memory

Skills can write memory only with permission.

Example:

SEO skill may remember:

```text
Default target site: speedycharms.com
```

But must ask before storing.

---

## 8. Audit Memory

Audit memory is not injected into model context by default.

Stores:

- file write approvals
- shell approvals
- denied actions
- risky MCP calls
- patch applications

Used for debugging and security review.

---

## 9. Memory Schema

```ts
interface MemoryItem {
  id: string;
  projectId?: string;
  scope: "session" | "project" | "architecture" | "user" | "skill" | "audit";
  key: string;
  value: string;
  importance: 1 | 2 | 3 | 4 | 5;
  source: "user" | "agent" | "system" | "skill";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
```

---

## 10. Memory Injection Rules

Inject memory in this order:

1. Critical project rules
2. Architecture decisions
3. User preferences relevant to task
4. Skill memory
5. Recent session memory

Do not inject:

- audit logs
- secrets
- irrelevant old messages
- denied tool inputs

---

## 11. Memory Importance

### Importance 5

Always inject.

Examples:

- Security rules
- Public API stability
- Database schema constraints

### Importance 4

Inject for most coding tasks.

Examples:

- Architecture decisions
- Framework choices

### Importance 3

Inject if relevant.

Examples:

- UI style preference
- model preference

### Importance 1-2

Retrieve only if asked.

---

## 12. Memory Update Flow

```text
Agent proposes memory
↓
Memory Engine classifies
↓
If high impact, ask user
↓
Persist memory
↓
Include in future context
```

Example prompt to user:

```text
Should Qodex remember that this project should not use Redux?
```

---

## 13. Anti-Corruption Rules

Agents must not silently rewrite memory.

If new memory conflicts with old memory:

```text
Show conflict
Ask user
Record resolution
```

Example:

Existing:

```text
Use Prisma.
```

New:

```text
Switch to Drizzle.
```

This requires explicit approval.

---

## 14. MVP Implementation

Phase 1:

- `.qodex/rules.md`
- `.qodex/memory.md`
- SQLite memory table

Phase 2:

- ADR support
- memory suggestions
- conflict detection

Phase 3:

- embeddings
- semantic memory retrieval
- multi-agent memory sharing

---

## 15. Acceptance Criteria

Memory Engine is acceptable when:

- Project rules persist across sessions.
- Agents receive architecture constraints.
- Memory conflicts require approval.
- Memory is scoped correctly.
- User can inspect and edit memory.
- Sensitive info is not stored silently.
