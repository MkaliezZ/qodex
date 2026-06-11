# ADR-004

**Status:** Accepted
**Date:** 2026-06-12

## Context

Before M5, the agent prompt was constructed by naive string concatenation in the UI hook:
```
prompt + "\n\n--- Files ---\n" + fileContents
```
This approach had no structure: rules were mixed with files, memory was absent, and there was no token budget awareness. As more sources were added (skills in M8, metadata), a formal assembly pipeline became necessary.

## Decision

Create a `ContextEngine` that assembles context from multiple isolated sources in a fixed order:

```
ContextEngine.buildContext(ContextRequest)
    ↓
RulesLoader       → "=== Project Rules ==="
MemoryLoader      → "=== Session Memory ==="
SkillRuntime      → "=== Skills ==="           (added M8)
ProjectMetadata   → "=== Project Metadata ==="
FileContextBuilder → "=== Selected Files ==="
Original Prompt   → "=== Task ==="
    ↓
TokenEstimator.estimate()
    ↓
ContextBundle → AgentRuntime
```

Key properties:
- **Fixed order**: Rules first (highest priority), task last (always closest to model output)
- **Isolated sources**: Each source has its own loader with independent caching
- **Token estimation**: Lightweight estimator (~4 chars/token ASCII, ~2 chars/token CJK)
- **Provider-agnostic**: The ContextBundle is plain text — any model can consume it

## Consequences

**Positive:**
- Predictable context structure across all models
- No direct file concatenation in UI code
- Easy to add new sources (just add a loader and position in the pipeline)
- Token budget visible in the UI

**Negative:**
- Fixed order means some context may exceed token limits (no compression yet)
- No ranking or prioritization within file sources
- Token estimation is approximate (±20%)

## Alternatives Considered

1. **Dynamic ordering by relevance**: Rejected — would introduce non-determinism and complicate debugging.
2. **LLM-based context selection**: Rejected — defeats the purpose of a predictable pipeline, adds cost.
3. **Template-based assembly (Handlebars/Mustache)**: Rejected — simple string concatenation with section headers is sufficient and more debuggable.
