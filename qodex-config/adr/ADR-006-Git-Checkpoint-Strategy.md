# ADR-006

**Status:** Accepted
**Date:** 2026-06-12

## Context

After applying patches through the Diff Engine, users need a way to save and restore project state. Git is the standard tool, but raw Git commands are complex for many users. Qodex needs a user-friendly abstraction that provides safety without requiring Git knowledge.

## Decision

Create a **checkpoint layer** on top of Git, with the following separation:

```
CheckpointEngine (user-facing)
    ├── create("name")   → Save named restore point
    ├── restore("name")  → Revert to saved state
    └── list()           → Show all checkpoints
         ↓
    maps to
         ↓
CommitEngine (internal)
    ├── create(message)  → Git commit
    ├── list()           → Commit history
    └── getLatest()      → Most recent commit
```

Key design decisions:
- **GitAdapter interface**: Abstracts actual `git` commands behind an interface. `MockGitAdapter` for testing, `SimpleGitAdapter` (future) for real `git` CLI.
- **Local-only**: No remote operations (push, pull, fetch, remote) — explicit prohibition in M7.
- **No auto-commits**: Checkpoints require explicit user action. Applying a patch does not auto-create a checkpoint.
- **Events**: `checkpoint.created`, `checkpoint.restored`, `commit.created`, `branch.created`, `branch.switched` — all flow through the EventBus.

## Consequences

**Positive:**
- Users can revert changes without understanding Git commands
- Checkpoints are independent from commits — users think in terms of "save points"
- GitAdapter pattern allows testing without real Git
- Branch support enables experimental changes without affecting the main codebase

**Negative:**
- MockGitAdapter is the only implementation — no real `git` integration yet
- Checkpoint restore is simulated (in-memory) in the mock adapter
- No merge or rebase support

## Alternatives Considered

1. **Direct Git commands**: Rejected — too complex for the target comfort level.
2. **Database snapshots**: Rejected — Git is already available and standard for code projects.
3. **Auto-commits on every change**: Rejected — would create noisy commit history and violate the explicit-action principle.
