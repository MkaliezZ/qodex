# ADR-008

**Status:** Accepted
**Date:** 2026-06-12

## Context

Qodex needs external capabilities: reading/writing files, running Git operations, executing terminal commands. These capabilities must be available to the agent but must never execute without user permission. MCP (Model Context Protocol) provides a standard interface for tool discovery and execution.

## Decision

Implement a local-only MCP runtime with mandatory permission gating:

```
MCPRuntime
    ├── MCPRegistry        — Server & tool registration
    ├── PermissionEngine   — 4 modes: ask, allow_once, allow_session, deny
    ├── MockTransport      — Mock handlers for development
    └── MCPEventBus        — Connection, discovery, execution events
```

Key decisions:
1. **Permission-first**: Every tool call goes through `PermissionEngine.request()`. Default mode is `ask` — the safest default.
2. **Local-only**: No WebSocket, no HTTP, no remote transport. Only `stdio` transport (placeholder). No marketplace.
3. **Mock servers for development**: `mock-filesystem` (3 tools), `mock-git` (3 tools), `mock-terminal` (1 tool). All return mock data — no real execution.
4. **Non-autonomous**: The Agent Runtime can list tools and request execution, but the Permission Engine always gates the actual call. No automatic tool execution.

## Consequences

**Positive:**
- Safe by default — no tool executes without permission
- Standardized tool discovery — agents enumerate tools from the registry
- Event-driven — UI can react to permission requests and execution results
- Easy to add real transports later without changing the architecture

**Negative:**
- Mock transport only — no real tool execution yet
- `StdioTransport` throws in browser dev mode (subprocess not available)
- No input validation beyond what the transport handler provides

## Alternatives Considered

1. **Direct tool execution (no permission layer)**: Rejected — unsafe, violates Qodex's safety principle.
2. **Remote MCP servers**: Rejected — adds attack surface, complicates the security model. Local-first is the correct starting point.
3. **Embedded tool execution (Node.js child_process)**: Rejected — not available in browser dev mode, deferred to Tauri production path.
