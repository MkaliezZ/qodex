# ADR-018

**Status:** Accepted
**Date:** 2026-07-22

## Context

KerniQ's v0.3 patch loop could apply and roll back one approved model proposal,
but it could not inspect a project through model tools, return test evidence to
the model, or continue after a failed test. The Provider SDK also lacked stable
tool-call identity and correct fragmented OpenAI-compatible stream aggregation.

## Decision

Add a separate bounded `AgentLoopRuntime` rather than expanding the legacy
single-turn runtime into an implicit loop. Canonical messages preserve assistant
tool calls and tool results by exact call ID. Verified OpenAI-compatible
providers aggregate names and arguments before emitting completed calls.

The v0.4 registry contains four tools:

- `search_files` and `read_file` are project-relative, bounded, and read-only.
- `list_project_commands` discovers a restricted catalog from `package.json`
  and root `Cargo.toml` metadata.
- `run_project_command` accepts only a catalog ID and always pauses for a
  separate one-time approval.

Source changes remain outside the tool registry and continue through
`KERNIQ_PATCH_V1`, DiffEngine validation, explicit approval, verified writes,
and safe rollback. Tauri resolves command IDs again on the native side and
accepts only roots selected and authorized in the current application session.
It invokes a structured child process without a shell command string, with a
fixed environment allowlist, timeout, output limits, and cancellation.

## Consequences

KerniQ can perform a genuine inspect, patch, test, diagnose, correct, and retest
loop while preserving distinct approval boundaries and hard execution limits.
OpenAI-compatible providers can support Agent Mode without leaking their wire
schema into Agent Runtime.

Cataloged project scripts remain capable of side effects and are not an OS
sandbox. Browser mode cannot execute native commands. Agent tasks and patch
history remain in memory, and v0.4 does not add arbitrary terminal access, new
files, deletes, automatic Git commits, MCP, or persistent authorization.
