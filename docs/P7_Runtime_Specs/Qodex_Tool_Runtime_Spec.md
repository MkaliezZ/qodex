
# Tool Runtime Spec

## Tool Contract

ToolInput
ToolResult

Result:
{
 success:boolean,
 output:any,
 error?:string
}

## Timeouts

Low Risk:
30s

Medium Risk:
60s

High Risk:
120s

## Retry Policy

Network:
3 retries

File:
No retry

Shell:
Manual retry only

## Built-in Tools

file.read
file.search
file.write_patch
git.status
git.diff
git.commit
shell.run
mcp.call
