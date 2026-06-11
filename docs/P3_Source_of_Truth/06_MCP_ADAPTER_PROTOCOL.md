# Qodex MCP Adapter Protocol

## Purpose

This document defines how Qodex integrates Model Context Protocol servers.

---

# MCP Config

Qodex stores MCP servers in DB and may also read:

```text
.qodex/mcp.json
```

Example:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "enabled": true,
      "permissions": {
        "tools": true,
        "resources": true,
        "prompts": false
      }
    }
  ]
}
```

---

# Adapter Interface

```ts
export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
  permissions: MCPPermissions;
}

export interface MCPPermissions {
  tools: boolean;
  resources: boolean;
  prompts: boolean;
  network?: boolean;
  fileRead?: boolean;
  fileWrite?: boolean;
}

export interface MCPToolInfo {
  serverId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
}

export interface MCPAdapter {
  connect(config: MCPServerConfig): Promise<void>;
  disconnect(serverId: string): Promise<void>;
  listTools(serverId: string): Promise<MCPToolInfo[]>;
  callTool(serverId: string, toolName: string, input: unknown): Promise<unknown>;
}
```

---

# Runtime Flow

```text
Load MCP configs
↓
Validate config
↓
Start server
↓
Initialize protocol
↓
Discover tools
↓
Map tools into Tool Runtime
↓
Apply permission policy
↓
Expose approved tools to Agent Runtime
```

---

# Tool Risk Mapping

Low:

- read metadata
- list available resources
- query non-sensitive information

Medium:

- read project file
- search local resources
- run deterministic analysis

High:

- write file
- delete file
- execute command
- network operation
- credential access

---

# Approval Rules

1. New MCP server requires user approval.
2. Remote MCP requires explicit trust.
3. High-risk MCP tools require approval every time unless project policy overrides.
4. MCP tool descriptions must be visible in UI.
5. MCP tool calls must be logged.

---

# UI Requirements

MCP Manager page:

- list servers
- add server
- enable/disable
- show tools
- show permissions
- test connection
- delete server

Tool card must show:

- server name
- tool name
- risk level
- input preview
- approval status

---

# Failure Handling

If server fails:

- mark server as disconnected
- show error
- do not crash agent
- allow retry
