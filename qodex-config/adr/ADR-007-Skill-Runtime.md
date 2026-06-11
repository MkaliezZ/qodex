# ADR-007

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex tasks benefit from domain-specific context: React components need different review criteria than TypeScript services, bug hunting needs different heuristics than performance optimization. Rather than expecting the model to possess all domain knowledge, Qodex should inject relevant guidelines into every prompt.

## Decision

Create a deterministic skill runtime where skills are **markdown content files** (not executable code):

```
SkillRuntime
    ├── SkillLoader      — Reads skill.json + SKILL.md
    ├── SkillRegistry    — Registered skills, searchable by id
    ├── SkillResolver    — Keyword matching (no embeddings, no LLM)
    └── buildSkillSection() → Markdown context block
```

Key decisions:
1. **Skills are content, not code**: A skill is a `skill.json` (metadata) and a `SKILL.md` (guidelines). No JavaScript execution, no API calls, no plugins.
2. **Deterministic resolution**: The resolver uses simple substring matching against name/description/tags. "Review React component" → `react-review`. No embeddings, no LLM calls.
3. **Disabled by default**: `bug-hunter` ships disabled. Users explicitly enable skills.
4. **Context injection**: Skill content is injected between Memory and Metadata in the ContextEngine pipeline.

## Consequences

**Positive:**
- No security concerns — skills are text content, not executable code
- Deterministic — same prompt always resolves the same skills
- Fast — substring matching is O(n) in the combined keyword length
- Provider-agnostic — skill content works with any model

**Negative:**
- Keyword matching is limited — "fix React component" would not match `react-review` (no direct keyword overlap)
- No skill dependencies or chaining
- No file-system skill loader yet (built-in skills only)

## Alternatives Considered

1. **Executable skills (plugins)**: Rejected — security concerns, complexity, MCP provides a better tool-extension mechanism.
2. **LLM-based skill selection**: Rejected — non-deterministic, adds cost, slow.
3. **Vector embedding search**: Rejected — over-engineering for the current skill count (3 built-in). Can be added later without breaking changes.
4. **Semantic tag matching**: Rejected — embeddings would introduce non-determinism and require an external service.
