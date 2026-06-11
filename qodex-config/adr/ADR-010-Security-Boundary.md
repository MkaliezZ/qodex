# ADR-010

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex has multiple subsystems that could be misused: the Diff Engine can modify files, the MCP Runtime can execute commands, the Provider SDK sends prompts to external APIs. Without a consistent security model, a compromised or misconfigured subsystem could lead to data loss, code injection, or credential leakage.

## Decision

Establish a layered security boundary that every subsystem must respect:

```
Layer 1: Permission Engine (MCP Runtime)
    - Every external tool call requires permission
    - 4 modes: ask (default), allow_once, allow_session, deny
    - No autonomous tool execution

Layer 2: Diff-First Editing (Diff Engine)
    - Model never writes files directly
    - All modifications go through PatchProposal
    - Apply requires explicit user action
    - Reject discards the proposal without side effects
    - Rollback restores previous file state

Layer 3: Provider Security (Provider SDK)
    - API keys stored in memory only
    - Keys never included in error output or logs
    - Provider-agnostic — no vendor-specific credential handling

Layer 4: Skill Safety (Skill Runtime)
    - Skills are text-only markdown (no executable code)
    - No exec, eval, Function, or require methods on SkillRuntime
    - Keyword-based resolution (no LLM-based skill selection)

Layer 5: Git Safety (Git Runtime)
    - No remote operations (push, pull, fetch, remote, PR)
    - No reset --hard or clean without explicit restore workflow
    - No merge, rebase, or cherry-pick
```

Enforcement rules:
1. **No silent writes**: All file modifications must go through the Diff Engine's apply workflow.
2. **No automatic execution**: All external tools require explicit permission via the Permission Engine.
3. **No code execution from skills**: Skills are markdown content only — no JavaScript, no plugins.
4. **No remote operations**: Git Runtime is local-only — no GitHub integration in scope.
5. **No API key leakage**: Provider credentials are in-memory only and excluded from logs.

## Consequences

**Positive:**
- Defense in depth — multiple layers must fail for a security breach
- Clear boundaries — each subsystem has explicit security rules
- Auditability — every modification goes through the apply workflow
- User consent — no autonomous operations

**Negative:**
- Additional user interaction required for every dangerous operation (permission fatigue)
- Some security rules are enforced by convention (no API key in logs) rather than by the type system
- In-memory credentials are lost on application restart

## Alternatives Considered

1. **Single permission gate**: Rejected — a single gate creates a bottleneck and doesn't account for different risk profiles (reading a file vs. executing a command).
2. **No security layer (trust-the-model)**: Rejected — obviously unsafe. Models can hallucinate dangerous commands.
3. **Filesystem-level sandboxing (containers)**: Rejected — over-engineering for the current use case. Can be added later for enterprise deployments.
