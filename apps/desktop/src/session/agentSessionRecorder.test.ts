import { describe, expect, it } from "vitest";
import {
  createTrustedProjectCommandDefinition,
  SETTLEMENT_PERSISTENCE_ERROR_MESSAGE,
  SettlementPersistenceError,
  type AgentLoopTask,
  type PendingCommandApproval,
  type ProjectCommandResult,
} from "@qodex/agent-runtime";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
} from "@qodex/agentfuse-adapter";
import {
  InMemorySessionStore,
  SessionRuntime,
  type SessionEntry,
  type SessionEventType,
  type SessionMutation,
} from "@qodex/session-runtime";
import {
  AGENTFUSE_COMMIT,
  AGENTFUSE_POLICY,
  AGENTFUSE_SCHEMA,
} from "../platform/agentFuseIdentity";
import { AgentSessionLedgerRecorder } from "./agentSessionRecorder";
import { createProjectCommandAgentFuseAdapter } from "./projectCommandDecisionCoordinator";

const NOW = new Date("2026-01-01T00:00:01.000Z");
const PROJECT_POLICY_DIGEST =
  "sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad";

class FaultInjectingSessionStore extends InMemorySessionStore {
  private readonly remainingFailures: Partial<Record<SessionEventType, number>>;

  constructor(failures: Partial<Record<SessionEventType, number>>) {
    super();
    this.remainingFailures = { ...failures };
  }

  override async appendEntry(entry: SessionEntry, mutation: SessionMutation): Promise<void> {
    const remaining = this.remainingFailures[entry.type] ?? 0;
    if (remaining > 0) {
      this.remainingFailures[entry.type] = remaining - 1;
      throw new Error(`Injected ${entry.type} persistence failure.`);
    }
    await super.appendEntry(entry, mutation);
  }
}

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
      command: createTrustedProjectCommandDefinition({
        id: "package-script:test",
        label: "pnpm test",
        executable: "pnpm",
        args: ["run", "test"],
        cwd: ".",
        source: "package.json",
        category: "test",
        catalogDigest: `sha256:${"a".repeat(64)}`,
      }),
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

function patchTask(): AgentLoopTask {
  return task({
    status: "WaitingForPatchApproval",
    pendingCommand: null,
    pendingPatch: {
      id: "patch-settlement",
      taskId: "task-1",
      summary: "Update config",
      files: [{
        path: "src/config.ts",
        oldContent: "export const value = 1;",
        newContent: "export const value = 2;",
      }],
      createdAt: "2026-01-01T00:00:04Z",
    },
    timeline: [{
      id: "timeline-patch-settlement",
      kind: "patch_proposal",
      title: "Patch proposed",
      status: "pending",
      summary: "Update config",
      actionId: "patch-settlement",
      timestamp: "2026-01-01T00:00:04Z",
    }],
  });
}

async function liveRecorder(runtime: SessionRuntime) {
  const bridge: AgentFuseBridgeClient = {
    requestDecision: async (request: AgentFuseDecisionRequest) => ({
      protocolVersion: request.protocolVersion,
      messageId: request.messageId,
      messageType: "decision_result",
      payload: {
        decisionId: "decision-command-1",
        actionId: request.payload.proposal.actionId,
        decision: "allow",
        reasonCode: "allowed",
        summary: "Allowed.",
        policyVersion: AGENTFUSE_POLICY,
        schemaVersion: AGENTFUSE_SCHEMA,
        agentFuseCommit: AGENTFUSE_COMMIT,
        policyProfileId: "kerniq-project-command-v1",
        policyDigest: PROJECT_POLICY_DIGEST,
        evidence: { fixture: "recorder-test" },
        decidedAt: NOW.toISOString(),
      },
    }),
  };
  return new AgentSessionLedgerRecorder({
    runtime,
    sessionId: "task-1",
    commandDecisionAdapter: await createProjectCommandAgentFuseAdapter(bridge, {
      clock: () => NOW,
      messageIdFactory: () => "message-recorder-test",
    }),
    projectBindingId: "project-1",
    projectFingerprint: `sha256:${"b".repeat(64)}`,
    clock: () => NOW,
  });
}

async function recordCommandStart(
  recorder: AgentSessionLedgerRecorder,
  taskId: string,
  pending: PendingCommandApproval,
  approvalId: string,
  executionReceiptId: string,
) {
  const signal = new AbortController().signal;
  const decision = await recorder.beforeCommandDecision({
    taskId,
    pending,
    approvalId,
    executionReceiptId,
    signal,
  });
  await recorder.beforeCommandStart({
    taskId,
    pending,
    approvalId,
    executionReceiptId,
    decision,
    signal,
  });
  return decision;
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
    const recorder = await liveRecorder(runtime);
    const waiting = task();
    const pending = waiting.pendingCommand!;
    recorder.recordTask(waiting);
    const decision = await recordCommandStart(
      recorder,
      waiting.id,
      pending,
      "approval-command-1",
      "receipt-command-1",
    );
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
      decision,
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

  it("records Interrupted instead of ordinary Failed when Patch settlement persistence fails", async () => {
    const store = new FaultInjectingSessionStore({ PATCH_APPLIED: 1 });
    const runtime = new SessionRuntime(store);
    await runtime.createSession({ id: "task-1", title: "Patch settlement" });
    const recorder = new AgentSessionLedgerRecorder({ runtime, sessionId: "task-1" });
    const waiting = patchTask();
    const proposal = waiting.pendingPatch!;
    recorder.recordTask(waiting);
    await recorder.flush();
    await recorder.beforePatchApply({
      taskId: waiting.id,
      proposal,
      approvalId: "approval-patch-settlement",
      executionReceiptId: "receipt-patch-settlement",
    });

    await expect(recorder.afterPatchApply({
      taskId: waiting.id,
      proposal,
      approvalId: "approval-patch-settlement",
      executionReceiptId: "receipt-patch-settlement",
      results: [{ path: "src/config.ts", success: true, readbackVerified: true }],
    })).rejects.toBeInstanceOf(SettlementPersistenceError);
    recorder.recordTask(task({
      status: "Failed",
      error: SETTLEMENT_PERSISTENCE_ERROR_MESSAGE,
      pendingCommand: null,
      timeline: [{
        id: "timeline-patch-uncertain",
        kind: "failure",
        title: "Agent failed",
        status: "error",
        summary: SETTLEMENT_PERSISTENCE_ERROR_MESSAGE,
        timestamp: "2026-01-01T00:00:05Z",
      }],
    }));
    await recorder.flush();

    const entries = await runtime.loadActivePath("task-1");
    expect(entries.some((entry) => entry.type === "PATCH_STARTED")).toBe(true);
    expect(entries.some((entry) => entry.type === "PATCH_APPLIED")).toBe(false);
    expect(entries.some((entry) => entry.type === "SESSION_INTERRUPTED")).toBe(true);
    expect(entries.some((entry) => entry.type === "SESSION_FAILED")).toBe(false);
    const recovered = await runtime.recoverSession("task-1");
    expect(recovered.status).toBe("Interrupted");
    expect(recovered.pendingAction?.started).toBe(true);
    expect(recovered.pendingAction?.approved).toBe(false);
  });

  it("records Interrupted instead of ordinary Failed when Command settlement persistence fails", async () => {
    const store = new FaultInjectingSessionStore({ COMMAND_COMPLETED: 1 });
    const runtime = new SessionRuntime(store);
    await runtime.createSession({ id: "task-1", title: "Command settlement" });
    const recorder = await liveRecorder(runtime);
    const waiting = task();
    const pending = waiting.pendingCommand!;
    recorder.recordTask(waiting);
    await recorder.flush();
    const decision = await recordCommandStart(
      recorder,
      waiting.id,
      pending,
      "approval-command-settlement",
      "receipt-command-settlement",
    );

    await expect(recorder.afterCommandComplete({
      taskId: waiting.id,
      pending,
      approvalId: "approval-command-settlement",
      executionReceiptId: "receipt-command-settlement",
      decision,
      result: {
        commandId: pending.command.id,
        approved: true,
        started: true,
        exitCode: 0,
        stdout: "pass",
        stderr: "",
        timedOut: false,
        cancelled: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: 5,
      },
    })).rejects.toBeInstanceOf(SettlementPersistenceError);
    recorder.recordTask(task({
      status: "Failed",
      error: SETTLEMENT_PERSISTENCE_ERROR_MESSAGE,
      pendingCommand: null,
      timeline: [{
        id: "timeline-command-uncertain",
        kind: "failure",
        title: "Agent failed",
        status: "error",
        summary: SETTLEMENT_PERSISTENCE_ERROR_MESSAGE,
        timestamp: "2026-01-01T00:00:05Z",
      }],
    }));
    await recorder.flush();

    const entries = await runtime.loadActivePath("task-1");
    expect(entries.some((entry) => entry.type === "COMMAND_STARTED")).toBe(true);
    expect(entries.some((entry) => entry.type === "COMMAND_COMPLETED")).toBe(false);
    expect(entries.some((entry) => entry.type === "SESSION_INTERRUPTED")).toBe(true);
    expect(entries.some((entry) => entry.type === "SESSION_FAILED")).toBe(false);
    expect((await runtime.recoverSession("task-1")).status).toBe("Interrupted");
  });

  it("recovers from unmatched Started when both settlement and immediate Interrupted persistence fail", async () => {
    const store = new FaultInjectingSessionStore({ PATCH_APPLIED: 1, SESSION_INTERRUPTED: 1 });
    const runtime = new SessionRuntime(store);
    await runtime.createSession({ id: "task-1", title: "Persistent settlement failure" });
    const recorder = new AgentSessionLedgerRecorder({ runtime, sessionId: "task-1" });
    const waiting = patchTask();
    const proposal = waiting.pendingPatch!;
    recorder.recordTask(waiting);
    await recorder.flush();
    await recorder.beforePatchApply({
      taskId: waiting.id,
      proposal,
      approvalId: "approval-fallback",
      executionReceiptId: "receipt-fallback",
    });

    await expect(recorder.afterPatchApply({
      taskId: waiting.id,
      proposal,
      approvalId: "approval-fallback",
      executionReceiptId: "receipt-fallback",
      results: [{ path: "src/config.ts", success: true, readbackVerified: true }],
    })).rejects.toBeInstanceOf(SettlementPersistenceError);
    expect((await runtime.loadActivePath("task-1")).at(-1)?.type).toBe("PATCH_STARTED");

    const recovered = await runtime.recoverSession("task-1");
    expect(recovered.status).toBe("Interrupted");
    expect(recovered.pendingAction?.started).toBe(true);
    expect(recovered.pendingAction?.approved).toBe(false);
  });
});
