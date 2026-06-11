# MCP Runtime

## Purpose

MCP lets Qodex connect to external tools and servers.

## MVP Scope

MCP is not required for v0.1, but architecture must allow it.

## MCP Server Config

```json
{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "enabled": true,
  "permissions": {
    "read": true,
    "write": false
  }
}
```

## Runtime Flow

```text
Load MCP config
↓
Start server
↓
Discover tools
↓
Register tools
↓
Expose to Agent Runtime
↓
Require permissions for risky calls
```

## Security

- MCP tools inherit permission mode.
- Remote MCP requires explicit trust.
- Tool descriptions must be shown to user.
- MCP output should be logged.
