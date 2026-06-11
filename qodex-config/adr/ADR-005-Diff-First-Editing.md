# ADR-005

**Status:** Accepted
**Date:** 2026-06-12

## Context

Direct file modification by AI models is dangerous. A model could:
- Overwrite source files with incorrect code
- Delete critical files
- Introduce security vulnerabilities
- Modify files without user awareness

Every edit must be reviewable, reversible, and explicitly approved by the user.

## Decision

Implement a **diff-first editing** architecture where the model never writes files directly:

```
Model Output → PatchProposal → DiffViewer → User Apply/Reject
```

Key components:
- **DiffGenerator**: Produces unified diff output from old/new file content (pure TypeScript, no external diff tool)
- **PatchValidator**: Validates patches before display/apply — checks file existence, content consistency, and rejects empty patches
- **ApplyEngine**: Manages apply, preview, reject, and rollback. Stores previous content for restore
- **Conflict detection**: Prevents apply if file content has changed since patch creation

**Patch lifecycle:**
```
createProposal() → validateProposal() → preview() → apply() / reject() → rollback()
```

## Consequences

**Positive:**
- All edits are reviewable in the DiffViewer
- Patches can be rejected without any file modification
- Rollback is built-in for every applied patch
- Conflict detection prevents overwriting user changes

**Negative:**
- Adds latency — patch generation and validation are separate steps
- In-memory rollback data is lost on page refresh (persistence planned for later)
- Side-by-side diff view not yet implemented (unified view only)

## Alternatives Considered

1. **Direct file writing**: Rejected — unsafe, unaccountable.
2. **Git auto-commit**: Rejected — adds Git dependency to the core editing workflow; rollback needs to work without Git.
3. **Model-provided diffs (model outputs diff format)**: Rejected — unreliable; the DiffEngine generates diffs deterministically from old/new content.
