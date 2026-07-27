import { describe, expect, it, vi } from "vitest";
import type {
  ModelChunk,
  ModelProvider,
  ModelRequest,
} from "@qodex/provider-sdk";
import {
  AgentLoopRuntime,
  type AgentPatchAdapter,
  type AgentSideEffectLifecycle,
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

const NOW = new Date("2026-07-27T00:00:00.000Z");
const PROJECT_POLICY_DIGEST =
  "sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad";
const COMMAND_EVENTS = new Set<SessionEventType>([
  "COMMAND_PROPOSED",
  "COMMAND_APPROVED",
  "ACTION_DECIDED",
  "COMMAND_DENIED",
  "COMMAND_STARTED",
  "COMMAND_COMPLETED",
]);

class FaultInjectingStore extends InMemorySessionStore {
  private readonly remaining: Partial<Record<SessionEventType, number>>;

  constructor(failures: Partial<Record<SessionEventType, number>> = {}) {
    super();
    this.remaining = { ...failures };
  }

  override async appendEntry(
    entry: SessionEntry,
    mutation: SessionMutation,
  ): Promise<void> {
    const remaining = this.remaining[entry.type] ?? 0;
    if (remaining > 0) {
      this.remaining[entry.type] = remaining - 1;
      throw new Error(`Injected ${entry.type} persistence failure.`);
    }
    await super.appendEntry(entry, mutation);
  }
}

describe("live Project Command decision and dispatch gate", () => {
  it.each([
    ["allow", ["COMMAND_PROPOSED", "COMMAND_APPROVED", "ACTION_DECIDED", "COMMAND_STARTED", "COMMAND_COMPLETED"], 1],
    ["block", ["COMMAND_PROPOSED", "COMMAND_APPROVED", "ACTION_DECIDED"], 0],
    ["bridge-error", ["COMMAND_PROPOSED", "COMMAND_APPROVED", "ACTION_DECIDED"], 0],
  ] as const)(
    "persists the authoritative %s lifecycle before native dispatch",
    async (outcome, expectedEvents, expectedRuns) => {
      const prepared = await prepare(outcome);
      const completed = await prepared.loop.approveCommand(prepared.waiting.id);
      await prepared.recorder.flush();

      expect(completed.error).toBeNull();
      expect(completed.status).toBe("Done");
      expect(commandEvents(await prepared.entries())).toEqual(expectedEvents);
      expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
      expect(prepared.run).toHaveBeenCalledTimes(expectedRuns);
      expect((await prepared.entries()).filter((entry) => (
        entry.type === "COMMAND_APPROVED"
      ))).toHaveLength(1);
      if (outcome !== "allow") {
        expect((await prepared.entries()).some((entry) => (
          entry.type === "COMMAND_DENIED"
        ))).toBe(false);
      }
    },
  );

  it("blocks before AgentFuse when COMMAND_APPROVED cannot persist", async () => {
    const prepared = await prepare("allow", {
      failures: { COMMAND_APPROVED: 1 },
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
    ]);
  });

  it("blocks native dispatch when ACTION_DECIDED cannot persist", async () => {
    const prepared = await prepare("allow", {
      failures: { ACTION_DECIDED: 1 },
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
    ]);
  });

  it("blocks native dispatch when COMMAND_STARTED cannot persist", async () => {
    const prepared = await prepare("allow", {
      failures: { COMMAND_STARTED: 1 },
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
    ]);
  });

  it("blocks native dispatch when the pending command becomes stale after allow", async () => {
    const prepared = await prepare("allow", {
      invalidateBeforeCommandStart: true,
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
    ]);
  });

  it("discards allow when approval expires during AgentFuse", async () => {
    let now = NOW;
    const prepared = await prepare("allow", {
      clock: () => now,
      beforeBridgeReturn: () => {
        now = new Date(NOW.getTime() + 5 * 60 * 1000);
      },
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
    ]);
  });

  it("coalesces two concurrent approvals into one durable decision and run", async () => {
    const prepared = await prepare("allow");

    const [first, duplicate] = await Promise.all([
      prepared.loop.approveCommand(prepared.waiting.id),
      prepared.loop.approveCommand(prepared.waiting.id),
    ]);
    await prepared.recorder.flush();

    expect(first.status).toBe("Done");
    expect(["WaitingForCommandApproval", "Done"]).toContain(duplicate.status);
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
      "COMMAND_STARTED",
      "COMMAND_COMPLETED",
    ]);
  });

  it("records human denial without an AgentFuse request or native run", async () => {
    const prepared = await prepare("allow");

    const completed = await prepared.loop.denyCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(completed.status).toBe("Done");
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_DENIED",
    ]);
  });

  it("cancels during AgentFuse without persisting a decision or starting native work", async () => {
    const prepared = await prepare("delayed");
    const approval = prepared.loop.approveCommand(prepared.waiting.id);
    await vi.waitFor(() => {
      expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    });

    await prepared.loop.cancel(prepared.waiting.id);
    const cancelled = await approval;
    await prepared.recorder.flush();

    expect(cancelled.status).toBe("Cancelled");
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
    ]);
  });

  it("cancels after durable allow but before COMMAND_STARTED with zero dispatch", async () => {
    const startEntered = deferred();
    const releaseStart = deferred();
    const prepared = await prepare("allow", {
      beforeCommandStart: async () => {
        startEntered.resolve();
        await releaseStart.promise;
      },
    });
    const approval = prepared.loop.approveCommand(prepared.waiting.id);
    await startEntered.promise;
    const cancellation = prepared.loop.cancel(prepared.waiting.id);
    releaseStart.resolve();

    await cancellation;
    const cancelled = await approval;
    await prepared.recorder.flush();

    expect(cancelled.status).toBe("Cancelled");
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
    ]);
  });
});

interface PrepareOptions {
  failures?: Partial<Record<SessionEventType, number>>;
  clock?: () => Date;
  beforeBridgeReturn?: () => void;
  beforeCommandStart?: () => Promise<void>;
  invalidateBeforeCommandStart?: boolean;
}

async function prepare(
  outcome: "allow" | "block" | "bridge-error" | "delayed",
  options: PrepareOptions = {},
) {
  const clock = options.clock ?? (() => NOW);
  const runtime = new SessionRuntime(
    new FaultInjectingStore(options.failures),
    clock,
    sequenceIds("ledger"),
  );
  await runtime.createSession({
    id: "task-1",
    title: "Live Project Command",
    projectBindingId: "project-1",
    createdAt: NOW.toISOString(),
  });
  const bridge = bridgeFor(outcome, options.beforeBridgeReturn);
  const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
    messageIdFactory: sequenceIds("message"),
    clock,
  });
  const recorder = new AgentSessionLedgerRecorder({
    runtime,
    sessionId: "task-1",
    commandDecisionAdapter: adapter,
    projectBindingId: "project-1",
    projectFingerprint: `sha256:${"b".repeat(64)}`,
    clock,
  });
  const run = vi.fn(async (): Promise<ProjectCommandResult> => ({
    commandId: "package-script:test",
    approved: true,
    started: true,
    exitCode: 0,
    stdout: "pass",
    stderr: "",
    timedOut: false,
    cancelled: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    durationMs: 1,
  }));
  const lifecycle: AgentSideEffectLifecycle = options.beforeCommandStart
    || options.invalidateBeforeCommandStart
    ? {
      beforePatchApply: recorder.beforePatchApply.bind(recorder),
      afterPatchApply: recorder.afterPatchApply.bind(recorder),
      beforeCommandDecision: recorder.beforeCommandDecision.bind(recorder),
      beforeCommandStart: async (input) => {
        await options.beforeCommandStart?.();
        if (options.invalidateBeforeCommandStart) {
          await runtime.appendEntry("task-1", {
            type: "RECOVERY_REQUIRED",
            payload: { reason: "command_reapproval" },
            safeMetadata: { approvalGeneration: 1 },
          });
        }
        await recorder.beforeCommandStart(input);
      },
      afterCommandComplete: recorder.afterCommandComplete.bind(recorder),
      afterSideEffectFailure: recorder.afterSideEffectFailure.bind(recorder),
    }
    : recorder;
  const loop = new AgentLoopRuntime({
    provider: commandThenDoneProvider(),
    modelId: "model",
    project: {
      listFiles: () => [{ path: "package.json", size: 50 }],
      readFile: async () => JSON.stringify({
        scripts: { test: "vitest run" },
      }),
      commandExecutionAvailable: true,
    },
    patchAdapter: inertPatchAdapter(),
    commandRunner: { run },
    sideEffectLifecycle: lifecycle,
    requireCommandDecision: true,
    now: () => clock().getTime(),
  });
  loop.subscribe((task) => recorder.recordTask(task));
  const waiting = await loop.start("task-1", "Run tests.");
  await recorder.flush();
  expect(waiting.status).toBe("WaitingForCommandApproval");
  return {
    runtime,
    recorder,
    bridge,
    run,
    loop,
    waiting,
    entries: () => runtime.loadActivePath("task-1"),
  };
}

function bridgeFor(
  outcome: "allow" | "block" | "bridge-error" | "delayed",
  beforeReturn: () => void = () => {},
): AgentFuseBridgeClient & { requestDecision: ReturnType<typeof vi.fn> } {
  return {
    requestDecision: vi.fn(async (
      request: AgentFuseDecisionRequest,
      signal: AbortSignal,
    ) => {
      if (outcome === "bridge-error") throw new Error("bridge process exited");
      if (outcome === "delayed") {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Decision cancelled.", "AbortError"));
          }, { once: true });
        });
      }
      beforeReturn();
      return {
        protocolVersion: request.protocolVersion,
        messageId: request.messageId,
        messageType: "decision_result",
        payload: {
          decisionId: `decision-${outcome}`,
          actionId: request.payload.proposal.actionId,
          decision: outcome,
          reasonCode: outcome === "allow" ? "allowed" : "policy_denied",
          summary: `Canonical AgentFuse returned ${outcome}.`,
          policyVersion: AGENTFUSE_POLICY,
          schemaVersion: AGENTFUSE_SCHEMA,
          agentFuseCommit: AGENTFUSE_COMMIT,
          policyProfileId: "kerniq-project-command-v1",
          policyDigest: PROJECT_POLICY_DIGEST,
          evidence: { fixture: `decision-${outcome}` },
          decidedAt: NOW.toISOString(),
        },
      };
    }),
  };
}

function commandThenDoneProvider(): ModelProvider {
  let turns = 0;
  return {
    id: "live-command",
    name: "Live command",
    protocol: "openai-chat",
    capabilities: { toolAgentLoop: true },
    listModels: async () => [],
    testConnection: async () => true,
    async *stream(_request: ModelRequest): AsyncIterable<ModelChunk> {
      turns += 1;
      if (turns === 1) {
        yield {
          type: "tool_call",
          id: "list",
          name: "list_project_commands",
          arguments: {},
        };
        yield {
          type: "tool_call",
          id: "run",
          name: "run_project_command",
          arguments: { commandId: "package-script:test" },
        };
        return;
      }
      yield { type: "text", text: "Command policy result observed." };
    },
  };
}

function inertPatchAdapter(): AgentPatchAdapter {
  return {
    prepare: async (response) => ({
      assistantText: response,
      proposal: null,
      error: { code: "patch_not_present", message: "No patch." },
    }),
    apply: async () => [],
    reject: () => {},
    rollback: async () => [],
  };
}

function commandEvents(entries: SessionEntry[]): SessionEventType[] {
  return entries
    .map((entry) => entry.type)
    .filter((type) => COMMAND_EVENTS.has(type));
}

function sequenceIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
