import { describe, expect, it } from "vitest";
import type { AgentLoopTask, ProjectCommandResult } from "@qodex/agent-runtime";
import { InMemorySessionStore, SessionRuntime } from "@qodex/session-runtime";
import { AgentSessionLedgerRecorder } from "./agentSessionRecorder";

function task(overrides: Partial<AgentLoopTask> = {}): AgentLoopTask {
  return {
    id: "task-1",
    prompt: "assembled private context",
    status: "WaitingForCommandApproval",
    output: "",
    error: null,
    limitReason: null,
    conversation: [],
    timeline: [
      {
        id: "timeline-tool",
        kind: "tool_request",
        title: "run_project_command",
        status: "pending",
        summary: "catalog request",
        toolCallId: "provider-call-77",
        actionId: "provider-call-77",
        timestamp: "2026-01-01T00:00:01Z",
      },
    ],
    pendingPatch: null,
    pendingCommand: {
      toolCall: { id: "provider-call-77", name: "run_project_command", arguments: { commandId: "package-script:test" } },
      command: {
        id: "package-script:test",
        label: "pnpm test",
        executable: "pnpm",
        args: ["run", "test"],
        cwd: ".",
        source: "package.json",
        category: "test",
        catalogDigest: "sha256:fixture",
      },
    },
    patchHistory: [],
    modelTurns: 1,
    totalToolCalls: 1,
    searchCalls: 0,
    readCalls: 0,
    commandCalls: 1,
    patchProposals: 0,
    startedAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe("AgentSessionLedgerRecorder", () => {
  it("records exact provider call IDs and deduplicates repeated snapshots", async () => {
    const runtime = new SessionRuntime(new InMemorySessionStore());
    await runtime.createSession({ id: "task-1", title: "Task" });
    const recorder = new AgentSessionLedgerRecorder({ runtime, sessionId: "task-1" });
    recorder.recordUserMessage("Run tests");
    recorder.recordTask(task());
    recorder.recordTask(task());
    await recorder.flush();
    const entries = await runtime.loadActivePath("task-1");
    const tool = entries.find((entry) => entry.type === "TOOL_REQUESTED");
    const command = entries.find((entry) => entry.type === "COMMAND_PROPOSED");
    expect(tool?.safeMetadata.toolCallId).toBe("provider-call-77");
    expect(command?.safeMetadata.toolCallId).toBe("provider-call-77");
    expect(entries.filter((entry) => entry.type === "COMMAND_PROPOSED")).toHaveLength(1);
  });

  it("records a terminal command result without stdout, headers, environment, or private paths", async () => {
    const sensitiveOutput = `github_pat_${"A1".repeat(15)}`;
    const runtime = new SessionRuntime(new InMemorySessionStore());
    await runtime.createSession({ id: "task-1", title: "Task" });
    const recorder = new AgentSessionLedgerRecorder({ runtime, sessionId: "task-1" });
    const waiting = task();
    const pending = waiting.pendingCommand!;
    recorder.recordTask(waiting);
    await recorder.beforeCommandStart({
      taskId: waiting.id,
      pending,
      approvalId: "approval-command-1",
      executionReceiptId: "receipt-command-1",
    });
    const result: ProjectCommandResult = {
      commandId: pending.command.id,
      approved: true,
      started: true,
      exitCode: 0,
      stdout: `private command output ${sensitiveOutput}`,
      stderr: "",
      timedOut: false,
      cancelled: false,
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 5,
    };
    await recorder.afterCommandComplete({
      taskId: waiting.id,
      pending,
      approvalId: "approval-command-1",
      executionReceiptId: "receipt-command-1",
      result,
    });
    recorder.recordTask(task({
      status: "Done",
      pendingCommand: null,
      timeline: [
        ...task().timeline,
        {
          id: "timeline-result",
          kind: "command_output",
          title: "pnpm test",
          status: "success",
          summary: "Exit code 0 in 5 ms.",
          detail: `private command output ${sensitiveOutput}`,
          durationMs: 5,
          toolCallId: "provider-call-77",
          actionId: "provider-call-77",
          timestamp: "2026-01-01T00:00:02Z",
        },
        {
          id: "timeline-final",
          kind: "final",
          title: "Final response",
          status: "success",
          summary: "Tests passed",
          timestamp: "2026-01-01T00:00:03Z",
        },
      ],
    }));
    await recorder.flush();
    const serialized = JSON.stringify(await runtime.loadActivePath("task-1"));
    expect(serialized).toContain("provider-call-77");
    expect(serialized).not.toContain("private command output");
    expect(serialized).not.toContain(sensitiveOutput);
    expect(serialized).not.toContain("environment");
    expect((await runtime.projectCurrentState("task-1")).status).toBe("Completed");
  });

  it("marks a patch containing recognised sensitive text as unrecoverable before persistence", async () => {
    const sensitiveValue = `github_pat_${"A1".repeat(15)}`;
    const runtime = new SessionRuntime(new InMemorySessionStore());
    await runtime.createSession({ id: "task-1", title: "Privacy task" });
    const recorder = new AgentSessionLedgerRecorder({ runtime, sessionId: "task-1" });
    recorder.recordUserMessage(`Inspect /Users/example/Private/project using ${sensitiveValue}`);
    recorder.recordTask(task({
      status: "WaitingForPatchApproval",
      pendingCommand: null,
      pendingPatch: {
        id: "patch-private",
        taskId: "task-1",
        summary: "Update config",
        files: [{
          path: "src/config.ts",
          oldContent: "export const value = 'safe';",
          newContent: `export const credential = '${sensitiveValue}';`,
        }],
        createdAt: "2026-01-01T00:00:04Z",
      },
      timeline: [{
        id: "timeline-patch",
        kind: "patch_proposal",
        title: "Patch proposed",
        status: "pending",
        summary: "Update config",
        actionId: "patch-private",
        timestamp: "2026-01-01T00:00:04Z",
      }],
    }));
    await recorder.flush();

    const entries = await runtime.loadActivePath("task-1");
    const patch = entries.find((entry) => entry.type === "PATCH_PROPOSED");
    const serialized = JSON.stringify(entries);
    expect(patch?.safeMetadata.recoverable).toBe(false);
    expect(patch?.safeMetadata.sensitiveContentRedacted).toBe(true);
    expect(serialized).not.toContain(sensitiveValue);
    expect(serialized).not.toContain("/Users/example/Private/project");
    expect(serialized).not.toContain("newContent");
  });
});
