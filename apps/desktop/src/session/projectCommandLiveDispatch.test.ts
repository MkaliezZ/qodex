import { describe, expect, it, vi } from "vitest";
import type {
  ModelChunk,
  ModelProvider,
  ModelRequest,
} from "@qodex/provider-sdk";
import {
  AgentLoopRuntime,
  createTrustedProjectCommandDefinition,
  type AgentCommandStartLifecycleInput,
  type AgentPatchAdapter,
  type AgentSideEffectLifecycle,
  type PendingCommandApproval,
  type ProjectCommandDefinition,
  type ProjectCommandRunner,
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
type BridgeOutcome =
  | "allow"
  | "block"
  | "bridge-error"
  | "bridge-timeout"
  | "malformed"
  | "wrong-source"
  | "wrong-schema"
  | "wrong-policy"
  | "delayed";

class FaultInjectingStore extends InMemorySessionStore {
  private readonly remaining: Partial<Record<SessionEventType, number>>;

  constructor(
    failures: Partial<Record<SessionEventType, number>> = {},
    private readonly beforeAppend?: (entry: SessionEntry) => Promise<void>,
    private readonly afterAppend?: (entry: SessionEntry) => Promise<void>,
  ) {
    super();
    this.remaining = { ...failures };
  }

  override async appendEntry(
    entry: SessionEntry,
    mutation: SessionMutation,
  ): Promise<void> {
    await this.beforeAppend?.(entry);
    const remaining = this.remaining[entry.type] ?? 0;
    if (remaining > 0) {
      this.remaining[entry.type] = remaining - 1;
      throw new Error(`Injected ${entry.type} persistence failure.`);
    }
    await super.appendEntry(entry, mutation);
    await this.afterAppend?.(entry);
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
        await prepared.loop.approveCommand(prepared.waiting.id);
        expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
        expect(prepared.run).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    "bridge-error",
    "bridge-timeout",
    "malformed",
    "wrong-source",
    "wrong-schema",
    "wrong-policy",
  ] as const)(
    "persists fail-closed evidence and never dispatches for %s",
    async (outcome) => {
      const prepared = await prepare(outcome);
      await prepared.loop.approveCommand(prepared.waiting.id);
      await prepared.recorder.flush();

      expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
      expect(prepared.run).not.toHaveBeenCalled();
      expect(commandEvents(await prepared.entries())).toEqual([
        "COMMAND_PROPOSED",
        "COMMAND_APPROVED",
        "ACTION_DECIDED",
      ]);
      expect((await prepared.entries()).at(-1)?.safeMetadata.decision)
        .not.toBe("allow");
      expectNoLiveCommandCache(prepared.recorder);
    },
  );

  it("fails closed after COMMAND_PROPOSED persistence failure without retrying AgentFuse", async () => {
    const prepared = await prepare("allow", {
      failures: { COMMAND_PROPOSED: 1 },
      expectProposalPersistenceFailure: true,
    });

    const completed = await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(completed.status).toBe("Done");
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([]);
    expectNoLiveCommandCache(prepared.recorder);
  });

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
    expectNoLiveCommandCache(prepared.recorder);
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
    expectNoLiveCommandCache(prepared.recorder);
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
    expectNoLiveCommandCache(prepared.recorder);
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

  it.each([
    ["command ID", (pending: PendingCommandApproval) => {
      pending.command = createTrustedProjectCommandDefinition({
        ...pending.command,
        id: "package-script:build",
      });
    }],
    ["catalog digest", (pending: PendingCommandApproval) => {
      pending.command = createTrustedProjectCommandDefinition({
        ...pending.command,
        catalogDigest: `sha256:${"c".repeat(64)}`,
      });
    }],
    ["category", (pending: PendingCommandApproval) => {
      pending.command = createTrustedProjectCommandDefinition({
        ...pending.command,
        category: "build",
      });
    }],
    ["script source", (pending: PendingCommandApproval) => {
      pending.command = createTrustedProjectCommandDefinition({
        ...pending.command,
        source: "cargo",
      });
    }],
  ] as const)(
    "blocks dispatch when the approved %s identity is replaced before start",
    async (_field, replacePending) => {
      const prepared = await prepare("allow", {
        mutateBeforeCommandStart: ({ pending }) => replacePending(pending),
      });

      await prepared.loop.approveCommand(prepared.waiting.id);
      await prepared.recorder.flush();

      expect(prepared.run).not.toHaveBeenCalled();
      expect(commandEvents(await prepared.entries())).toEqual([
        "COMMAND_PROPOSED",
        "COMMAND_APPROVED",
        "ACTION_DECIDED",
      ]);
    },
  );

  it("blocks transfer of approval to another valid trusted catalog command", async () => {
    const buildDigest = await digest("package.json\0build\0vite build");
    const prepared = await prepare("allow", {
      mutateBeforeCommandStart: ({ pending }) => {
        pending.command = createTrustedProjectCommandDefinition({
          id: "package-script:build",
          label: "pnpm build",
          executable: "pnpm",
          args: ["run", "build"],
          cwd: ".",
          source: "package.json",
          category: "build",
          catalogDigest: buildDigest,
        });
      },
    });

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.run).not.toHaveBeenCalled();
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
    ]);
  });

  it.each(["projectBindingId", "projectFingerprint"] as const)(
    "blocks dispatch when the configured %s drifts after decision",
    async (field) => {
      const prepared = await prepare("allow", {
        mutateBeforeCommandStart: (_input, recorder) => {
          const gate = (
            recorder as unknown as {
              commandDecisionGate: {
                options: {
                  projectBindingId: string;
                  projectFingerprint: string;
                };
              };
            }
          ).commandDecisionGate;
          gate.options[field] = field === "projectBindingId"
            ? "project-drifted"
            : `sha256:${"d".repeat(64)}`;
        },
      });

      await prepared.loop.approveCommand(prepared.waiting.id);
      await prepared.recorder.flush();

      expect(prepared.run).not.toHaveBeenCalled();
      expect(commandEvents(await prepared.entries())).toEqual([
        "COMMAND_PROPOSED",
        "COMMAND_APPROVED",
        "ACTION_DECIDED",
      ]);
    },
  );

  it("dispatches the exact approved immutable command snapshot", async () => {
    const prepared = await prepare("allow");
    const approvedCommand = prepared.waiting.pendingCommand!.command;

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(Object.isFrozen(approvedCommand)).toBe(true);
    expect(Object.isFrozen(approvedCommand.args)).toBe(true);
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(prepared.run.mock.calls[0][0]).toBe(approvedCommand);
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("dispatches the validated receipt command even if the pending reference changes after start persistence", async () => {
    const prepared = await prepare("allow", {
      mutateAfterCommandStart: ({ pending }) => {
        pending.command = createTrustedProjectCommandDefinition({
          ...pending.command,
          id: "package-script:replacement-after-start",
          catalogDigest: `sha256:${"e".repeat(64)}`,
        });
      },
    });
    const approvedCommand = prepared.waiting.pendingCommand!.command;

    await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();

    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(prepared.run.mock.calls[0][0]).toBe(approvedCommand);
    expect(prepared.run.mock.calls[0][0].id).toBe("package-script:test");
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
    await prepared.loop.approveCommand(prepared.waiting.id);
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expectNoLiveCommandCache(prepared.recorder);
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
    await prepared.loop.denyCommand(prepared.waiting.id);
    await prepared.loop.approveCommand(prepared.waiting.id);
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expectNoLiveCommandCache(prepared.recorder);
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
    expectNoLiveCommandCache(prepared.recorder);
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
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("cancels before COMMAND_PROPOSED durability without decision or dispatch", async () => {
    const proposalEntered = deferred();
    const releaseProposal = deferred();
    const prepared = await prepare("allow", {
      deferInitialFlush: true,
      beforePersist: async (entry) => {
        if (entry.type !== "COMMAND_PROPOSED") return;
        proposalEntered.resolve();
        await releaseProposal.promise;
      },
    });
    await proposalEntered.promise;

    await prepared.loop.cancel(prepared.waiting.id);
    releaseProposal.resolve();
    await prepared.initialFlush;
    await prepared.recorder.flush();

    expect(prepared.loop.getTask(prepared.waiting.id)?.status).toBe("Cancelled");
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expect(prepared.cancel).not.toHaveBeenCalled();
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("cancels after durable approval before the bridge request", async () => {
    const approvalPersisted = deferred();
    const releaseApproval = deferred();
    const prepared = await prepare("allow", {
      afterPersist: async (entry) => {
        if (entry.type !== "COMMAND_APPROVED") return;
        approvalPersisted.resolve();
        await releaseApproval.promise;
      },
    });
    const approval = prepared.loop.approveCommand(prepared.waiting.id);
    await approvalPersisted.promise;
    const cancellation = prepared.loop.cancel(prepared.waiting.id);
    releaseApproval.resolve();

    await Promise.all([approval, cancellation]);
    await prepared.recorder.flush();

    expect(prepared.loop.getTask(prepared.waiting.id)?.status).toBe("Cancelled");
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.run).not.toHaveBeenCalled();
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("attempts one bounded cancellation after durable start and invokes native once", async () => {
    const startPersisted = deferred();
    const releaseStart = deferred();
    const runResult = deferred<ProjectCommandResult>();
    const prepared = await prepare("allow", {
      mutateAfterCommandStart: async () => {
        startPersisted.resolve();
        await releaseStart.promise;
      },
      run: async () => runResult.promise,
      cancel: async () => {
        runResult.resolve(cancelledResult());
      },
    });
    const approval = prepared.loop.approveCommand(prepared.waiting.id);
    await startPersisted.promise;
    const cancellation = prepared.loop.cancel(prepared.waiting.id);
    releaseStart.resolve();

    await Promise.all([approval, cancellation]);
    await prepared.recorder.flush();

    expect(prepared.loop.getTask(prepared.waiting.id)?.status).toBe("Cancelled");
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(prepared.cancel).toHaveBeenCalledTimes(1);
    expect(commandEvents(await prepared.entries())).toEqual([
      "COMMAND_PROPOSED",
      "COMMAND_APPROVED",
      "ACTION_DECIDED",
      "COMMAND_STARTED",
      "COMMAND_COMPLETED",
    ]);
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("does not replay when cancelled after physical settlement but before durable settlement", async () => {
    const settlementEntered = deferred();
    const releaseSettlement = deferred();
    const prepared = await prepare("allow", {
      beforePersist: async (entry) => {
        if (entry.type !== "COMMAND_COMPLETED") return;
        settlementEntered.resolve();
        await releaseSettlement.promise;
      },
    });
    const approval = prepared.loop.approveCommand(prepared.waiting.id);
    await settlementEntered.promise;
    const cancellation = prepared.loop.cancel(prepared.waiting.id);
    releaseSettlement.resolve();

    await Promise.all([approval, cancellation]);
    await prepared.recorder.flush();

    expect(prepared.loop.getTask(prepared.waiting.id)?.status).toBe("Cancelled");
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(prepared.cancel).not.toHaveBeenCalled();
    expect((await prepared.entries()).filter((entry) => (
      entry.type === "COMMAND_COMPLETED"
    ))).toHaveLength(1);
    expectNoLiveCommandCache(prepared.recorder);
  });

  it("records interruption and releases live state when settlement persistence fails", async () => {
    const prepared = await prepare("allow", {
      failures: { COMMAND_COMPLETED: 1 },
    });

    const failed = await prepared.loop.approveCommand(prepared.waiting.id);
    await prepared.recorder.flush();
    const entries = await prepared.entries();

    expect(failed.status).toBe("Failed");
    expect(prepared.run).toHaveBeenCalledTimes(1);
    expect(entries.some((entry) => entry.type === "SESSION_INTERRUPTED")).toBe(true);
    expect(entries.some((entry) => entry.type === "SESSION_COMPLETED")).toBe(false);
    expect((await prepared.runtime.recoverSession("task-1")).status).toBe("Interrupted");
    expectNoLiveCommandCache(prepared.recorder);
  });

  it.each([
    ["runner rejection", async () => {
      throw new Error("private failure at /Users/private/project");
    }, {
      commandId: "package-script:test",
      approved: true,
      started: true,
      exitCode: null,
      stdout: "",
      stderr: "Native command execution failed.",
      timedOut: false,
      cancelled: false,
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 0,
    }],
    ["runner timeout", async () => timeoutResult(), timeoutResult()],
  ] as const)(
    "records one truthful bounded completion for %s",
    async (_name, run, expected) => {
      const prepared = await prepare("allow", { run });
      const completed = await prepared.loop.approveCommand(prepared.waiting.id);
      await prepared.recorder.flush();

      expect(completed.status).toBe("Done");
      expect(prepared.run).toHaveBeenCalledTimes(1);
      expect((await prepared.entries()).filter((entry) => (
        entry.type === "COMMAND_COMPLETED"
      ))).toHaveLength(1);
      const toolResult = [...completed.conversation]
        .reverse()
        .find((entry) => entry.role === "tool");
      expect(toolResult?.content).toContain(JSON.stringify(expected).slice(1, -1));
      expect(toolResult?.content).not.toContain("/Users/private");
      expectNoLiveCommandCache(prepared.recorder);
    },
  );
});

interface PrepareOptions {
  failures?: Partial<Record<SessionEventType, number>>;
  beforePersist?: (entry: SessionEntry) => Promise<void>;
  afterPersist?: (entry: SessionEntry) => Promise<void>;
  clock?: () => Date;
  beforeBridgeReturn?: () => void;
  beforeCommandStart?: () => Promise<void>;
  mutateBeforeCommandStart?: (
    input: AgentCommandStartLifecycleInput,
    recorder: AgentSessionLedgerRecorder,
  ) => void | Promise<void>;
  mutateAfterCommandStart?: (
    input: AgentCommandStartLifecycleInput,
  ) => void | Promise<void>;
  invalidateBeforeCommandStart?: boolean;
  expectProposalPersistenceFailure?: boolean;
  deferInitialFlush?: boolean;
  run?: ProjectCommandRunner["run"];
  cancel?: NonNullable<ProjectCommandRunner["cancel"]>;
}

async function prepare(
  outcome: BridgeOutcome,
  options: PrepareOptions = {},
) {
  const clock = options.clock ?? (() => NOW);
  const runtime = new SessionRuntime(
    new FaultInjectingStore(
      options.failures,
      options.beforePersist,
      options.afterPersist,
    ),
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
  const run = vi.fn(options.run ?? (async (
    _command: ProjectCommandDefinition,
  ): Promise<ProjectCommandResult> => ({
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
  })));
  const cancel = vi.fn(options.cancel ?? (async () => {}));
  const lifecycle: AgentSideEffectLifecycle = options.beforeCommandStart
    || options.mutateBeforeCommandStart
    || options.mutateAfterCommandStart
    || options.invalidateBeforeCommandStart
    ? {
      beforePatchApply: recorder.beforePatchApply.bind(recorder),
      afterPatchApply: recorder.afterPatchApply.bind(recorder),
      beforeCommandDecision: recorder.beforeCommandDecision.bind(recorder),
      beforeCommandStart: async (input) => {
        await options.beforeCommandStart?.();
        await options.mutateBeforeCommandStart?.(input, recorder);
        if (options.invalidateBeforeCommandStart) {
          await runtime.appendEntry("task-1", {
            type: "RECOVERY_REQUIRED",
            payload: { reason: "command_reapproval" },
            safeMetadata: { approvalGeneration: 1 },
          });
        }
        const receipt = await recorder.beforeCommandStart(input);
        await options.mutateAfterCommandStart?.(input);
        return receipt;
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
    commandRunner: { run, cancel },
    sideEffectLifecycle: lifecycle,
    requireCommandDecision: true,
    now: () => clock().getTime(),
  });
  loop.subscribe((task) => recorder.recordTask(task));
  const waiting = await loop.start("task-1", "Run tests.");
  const initialFlush = recorder.flush();
  if (options.expectProposalPersistenceFailure) {
    await expect(initialFlush).rejects.toBeDefined();
  } else if (!options.deferInitialFlush) {
    await initialFlush;
  }
  expect(waiting.status).toBe("WaitingForCommandApproval");
  return {
    runtime,
    recorder,
    bridge,
    run,
    cancel,
    loop,
    waiting,
    initialFlush,
    entries: () => runtime.loadActivePath("task-1"),
  };
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return `sha256:${[...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function bridgeFor(
  outcome: BridgeOutcome,
  beforeReturn: () => void = () => {},
): AgentFuseBridgeClient & { requestDecision: ReturnType<typeof vi.fn> } {
  return {
    requestDecision: vi.fn(async (
      request: AgentFuseDecisionRequest,
      signal: AbortSignal,
    ) => {
      if (outcome === "bridge-error") throw new Error("bridge process exited");
      if (outcome === "bridge-timeout") throw new Error("request timeout");
      if (outcome === "malformed") return "not-a-decision-response";
      if (outcome === "delayed") {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Decision cancelled.", "AbortError"));
          }, { once: true });
        });
      }
      beforeReturn();
      const response = {
        protocolVersion: request.protocolVersion,
        messageId: request.messageId,
        messageType: "decision_result",
        payload: {
          decisionId: `decision-${outcome}`,
          actionId: request.payload.proposal.actionId,
          decision: outcome === "block" ? "block" : "allow",
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
      if (outcome === "wrong-source") {
        response.payload.agentFuseCommit = "0".repeat(40);
      } else if (outcome === "wrong-schema") {
        response.payload.schemaVersion = "future-schema";
      } else if (outcome === "wrong-policy") {
        response.payload.policyVersion = "future-policy";
      }
      return response;
    }),
  };
}

function expectNoLiveCommandCache(recorder: AgentSessionLedgerRecorder): void {
  const internal = recorder as unknown as {
    liveProposalOperations: Map<string, unknown>;
    failedProposalActions: Set<string>;
    liveDecisions: Map<string, unknown>;
  };
  expect(internal.liveProposalOperations.size).toBe(0);
  expect(internal.failedProposalActions.size).toBe(0);
  expect(internal.liveDecisions.size).toBe(0);
}

function timeoutResult(): ProjectCommandResult {
  return {
    commandId: "package-script:test",
    approved: true,
    started: true,
    exitCode: null,
    stdout: "bounded stdout",
    stderr: "bounded stderr",
    timedOut: true,
    cancelled: false,
    stdoutTruncated: true,
    stderrTruncated: true,
    durationMs: 120_000,
  };
}

function cancelledResult(): ProjectCommandResult {
  return {
    commandId: "package-script:test",
    approved: true,
    started: true,
    exitCode: null,
    stdout: "",
    stderr: "",
    timedOut: false,
    cancelled: true,
    stdoutTruncated: false,
    stderrTruncated: false,
    durationMs: 1,
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

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
