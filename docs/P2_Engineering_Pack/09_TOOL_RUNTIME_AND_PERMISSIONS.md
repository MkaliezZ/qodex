# Tool Runtime and Permission Model

## Built-in Tools

- file.read
- file.search
- file.write_patch
- shell.run
- git.status
- git.diff
- git.branch
- git.commit
- mcp.call

## Risk Levels

Low:

- read file
- git status
- list directory

Medium:

- search repository
- run test command
- inspect package scripts

High:

- write files
- run shell
- delete files
- network access
- git commit

## Default Permission Mode

Review Mode.

```text
Reads allowed
Writes require approval
Shell requires approval
Network requires approval
```

## Tool Interface

```ts
export interface Tool {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  execute(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}
```

## Security Rules

1. Never execute shell silently.
2. Never write outside project root.
3. Never expose API keys to model.
4. Log every tool call.
5. Block `.env` reads by default unless user approves.
