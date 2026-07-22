import { describe, expect, it, vi } from "vitest";
import type { ModelChunk, ModelProvider, ModelRequest } from "@qodex/provider-sdk";
import { AgentLoopRuntime } from "../src/agent-loop/runtime.js";
import type {
  AgentPatchAdapter,
  AgentPatchProposal,
  AgentProjectAccess,
  AgentSideEffectLifecycle,
  ProjectCommandResult,
  ProjectCommandRunner,
} from "../src/agent-loop/types.js";

const original = "export const value = 1;\n";
const changed = "export const value = 2;\n";

const project: AgentProjectAccess = {
  listFiles: () => [
    { path: "src/value.ts", size: original.length },
    { path: "package.json", size: 40 },
  ],
  readFile: async (path) => {
    if (path === "src/value.ts") return original;
    if (path === "package.json") return JSON.stringify({ scripts: { test: "node test.mjs" } });
    throw new Error("not found");
  },
  commandExecutionAvailable: true,
};

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function provider(
  stream: (request: ModelRequest, turn: number) => AsyncIterable<ModelChunk>,
): ModelProvider & { turns: number } {
  return {
    id: "state-safety",
    name: "State Safety",
    protocol: "openai-chat",
    capabilities: { toolAgentLoop: true },
    turns: 0,
    listModels: async () => [],
    testConnection: async () => true,
    async *stream(request) {
      this.turns += 1;
      yield* stream(request, this.turns);
    },
  };
}

async function* chunks(...values: ModelChunk[]): AsyncIterable<ModelChunk> {
  for (const value of values) yield value;
}

function patchProposal(taskId: string, oldContent = original, newContent = changed): AgentPatchProposal {
  return {
    id: `proposal-${taskId}-${newContent.length}`,
    taskId,
    summary: "Update value",
    files: [{ path: "src/value.ts", oldContent, newContent }],
    createdAt: new Date(0).toISOString(),
  };
}

function patchAdapter(options: {
  applyGate?: Promise<void>;
  rollbackGate?: Promise<void>;
} = {}) {
  let content = original;
  const apply = vi.fn(async (proposal: AgentPatchProposal) => {
    await options.applyGate;
    content = proposal.files[0].newContent;
    return proposal.files.map((file) => ({ success: true, path: file.path, readbackVerified: true }));
  });
  const reject = vi.fn();
  const rollback = vi.fn(async (proposal: AgentPatchProposal) => {
    await options.rollbackGate;
    content = proposal.files[0].oldContent;
    return proposal.files.map((file) => ({ success: true, path: file.path, readbackVerified: true }));
  });
  const adapter: AgentPatchAdapter = {
    prepare: async (response, taskId) => response === "PATCH"
      ? { assistantText: "proposal", proposal: patchProposal(taskId), error: null }
      : { assistantText: response, proposal: null, error: { code: "patch_not_present", message: "No patch." } },
    apply,
    reject,
    rollback,
  };
  return { adapter, apply, reject, rollback, getContent: () => content };
}

function patchThenDoneProvider() {
  return provider((_request, turn) => chunks({ type: "text", text: turn === 1 ? "PATCH" : "Done safely." }));
}

function commandThenDoneProvider() {
  return provider((_request, turn) => turn === 1
    ? chunks(
        { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} },
        { type: "tool_call", id: "run", name: "run_project_command", arguments: { commandId: "package-script:test" } },
      )
    : chunks({ type: "text", text: "Command result observed." }));
}

function passingResult(commandId = "package-script:test"): ProjectCommandResult {
  return {
    commandId,
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
  };
}

function lifecycle(overrides: Partial<AgentSideEffectLifecycle> = {}): AgentSideEffectLifecycle {
  return {
    beforePatchApply: vi.fn(async () => {}),
    afterPatchApply: vi.fn(async () => {}),
    beforeCommandStart: vi.fn(async () => {}),
    afterCommandComplete: vi.fn(async () => {}),
    afterSideEffectFailure: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("AgentLoopRuntime v0.4.1 state safety", () => {
  it("blocks patch dispatch when durable started evidence cannot be persisted", async () => {
    const sequence = patchThenDoneProvider();
    const patch = patchAdapter();
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      sideEffectLifecycle: lifecycle({
        beforePatchApply: vi.fn(async () => { throw new Error("session persistence unavailable"); }),
      }),
    });
    const waiting = await runtime.start("patch-barrier-failure", "Propose a patch.");
    const failed = await runtime.approvePatch(waiting.id);
    expect(failed.status).toBe("Failed");
    expect(failed.error).toContain("session persistence unavailable");
    expect(patch.apply).not.toHaveBeenCalled();
    expect(patch.getContent()).toBe(original);
  });

  it("blocks command dispatch when durable started evidence cannot be persisted", async () => {
    const sequence = commandThenDoneProvider();
    const patch = patchAdapter();
    const run = vi.fn(async () => passingResult());
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      commandRunner: { run },
      sideEffectLifecycle: lifecycle({
        beforeCommandStart: vi.fn(async () => { throw new Error("session persistence unavailable"); }),
      }),
    });
    const waiting = await runtime.start("command-barrier-failure", "Run tests.");
    const failed = await runtime.approveCommand(waiting.id);
    expect(failed.status).toBe("Failed");
    expect(failed.error).toContain("session persistence unavailable");
    expect(run).not.toHaveBeenCalled();
  });

  it("commits lifecycle evidence before dispatch and settles it afterward", async () => {
    const patchSequence = patchThenDoneProvider();
    const patch = patchAdapter();
    const patchLifecycle = lifecycle();
    const patchRuntime = new AgentLoopRuntime({
      provider: patchSequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      sideEffectLifecycle: patchLifecycle,
    });
    const waitingPatch = await patchRuntime.start("patch-barrier-order", "Propose a patch.");
    await patchRuntime.approvePatch(waitingPatch.id);
    expect(patchLifecycle.beforePatchApply).toHaveBeenCalledOnce();
    expect(patchLifecycle.afterPatchApply).toHaveBeenCalledOnce();
    expect(vi.mocked(patchLifecycle.beforePatchApply).mock.invocationCallOrder[0])
      .toBeLessThan(patch.apply.mock.invocationCallOrder[0]);
    expect(patch.apply.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(patchLifecycle.afterPatchApply).mock.invocationCallOrder[0]);

    const commandSequence = commandThenDoneProvider();
    const run = vi.fn(async () => passingResult());
    const commandLifecycle = lifecycle();
    const commandRuntime = new AgentLoopRuntime({
      provider: commandSequence,
      modelId: "model",
      project,
      patchAdapter: patchAdapter().adapter,
      commandRunner: { run },
      sideEffectLifecycle: commandLifecycle,
    });
    const waitingCommand = await commandRuntime.start("command-barrier-order", "Run tests.");
    await commandRuntime.approveCommand(waitingCommand.id);
    expect(commandLifecycle.beforeCommandStart).toHaveBeenCalledOnce();
    expect(commandLifecycle.afterCommandComplete).toHaveBeenCalledOnce();
    expect(vi.mocked(commandLifecycle.beforeCommandStart).mock.invocationCallOrder[0])
      .toBeLessThan(run.mock.invocationCallOrder[0]);
    expect(run.mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(commandLifecycle.afterCommandComplete).mock.invocationCallOrder[0]);
  });

  it("disposes a pending patch on Stop and makes late approval actions inert", async () => {
    const sequence = patchThenDoneProvider();
    const patch = patchAdapter();
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: patch.adapter,
    });

    const waiting = await runtime.start("cancel-patch", "Propose a patch.");
    expect(waiting.status).toBe("WaitingForPatchApproval");
    await runtime.cancel(waiting.id);
    const cancelled = runtime.getTask(waiting.id)!;
    expect(cancelled.status).toBe("Cancelled");
    expect(cancelled.pendingPatch).toBeNull();
    expect(cancelled.timeline.some((entry) => entry.title === "Patch discarded after cancellation")).toBe(true);
    expect(patch.reject).toHaveBeenCalledTimes(1);

    await runtime.approvePatch(waiting.id);
    await runtime.rejectPatch(waiting.id);
    expect(patch.apply).not.toHaveBeenCalled();
    expect(patch.reject).toHaveBeenCalledTimes(1);
    expect(sequence.turns).toBe(1);
    expect(patch.getContent()).toBe(original);
  });

  it("disposes a pending command on Stop and makes late actions inert", async () => {
    const sequence = commandThenDoneProvider();
    const patch = patchAdapter();
    const run = vi.fn(async () => passingResult());
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      commandRunner: { run },
    });

    const waiting = await runtime.start("cancel-command", "Run tests.");
    expect(waiting.status).toBe("WaitingForCommandApproval");
    await runtime.cancel(waiting.id);
    expect(runtime.getTask(waiting.id)?.pendingCommand).toBeNull();
    expect(runtime.getTask(waiting.id)?.status).toBe("Cancelled");
    await runtime.approveCommand(waiting.id);
    await runtime.denyCommand(waiting.id);
    expect(run).not.toHaveBeenCalled();
    expect(sequence.turns).toBe(1);
  });

  it("expires patch approval and rejection before any write or provider continuation", async () => {
    let now = 1_000;
    const sequence = patchThenDoneProvider();
    const patch = patchAdapter();
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      limits: { maxTaskDurationMs: 10 },
      now: () => now,
    });
    const waiting = await runtime.start("expired-patch", "Propose a patch.");
    now += 11;
    const expired = await runtime.approvePatch(waiting.id);
    expect(expired.status).toBe("LimitReached");
    expect(expired.pendingPatch).toBeNull();
    expect(patch.apply).not.toHaveBeenCalled();
    expect(patch.reject).toHaveBeenCalledTimes(1);
    expect(sequence.turns).toBe(1);
    await runtime.rejectPatch(waiting.id);
    expect(sequence.turns).toBe(1);
  });

  it("expires a late patch rejection without resuming the provider", async () => {
    let now = 1_500;
    const sequence = patchThenDoneProvider();
    const patch = patchAdapter();
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      limits: { maxTaskDurationMs: 10 },
      now: () => now,
    });
    const waiting = await runtime.start("expired-reject", "Propose a patch.");
    now += 11;
    const expired = await runtime.rejectPatch(waiting.id);
    expect(expired.status).toBe("LimitReached");
    expect(patch.reject).toHaveBeenCalledTimes(1);
    expect(patch.apply).not.toHaveBeenCalled();
    expect(sequence.turns).toBe(1);
  });

  it("expires command approval and denial before any process or provider continuation", async () => {
    let now = 2_000;
    const sequence = commandThenDoneProvider();
    const patch = patchAdapter();
    const run = vi.fn(async () => passingResult());
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      commandRunner: { run },
      limits: { maxTaskDurationMs: 10 },
      now: () => now,
    });
    const waiting = await runtime.start("expired-command", "Run tests.");
    now += 11;
    const expired = await runtime.approveCommand(waiting.id);
    expect(expired.status).toBe("LimitReached");
    expect(expired.pendingCommand).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(sequence.turns).toBe(1);
    await runtime.denyCommand(waiting.id);
    expect(sequence.turns).toBe(1);
  });

  it("expires a late command denial without resuming the provider", async () => {
    let now = 2_500;
    const sequence = commandThenDoneProvider();
    const patch = patchAdapter();
    const run = vi.fn(async () => passingResult());
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      commandRunner: { run },
      limits: { maxTaskDurationMs: 10 },
      now: () => now,
    });
    const waiting = await runtime.start("expired-deny", "Run tests.");
    now += 11;
    const expired = await runtime.denyCommand(waiting.id);
    expect(expired.status).toBe("LimitReached");
    expect(run).not.toHaveBeenCalled();
    expect(sequence.turns).toBe(1);
  });

  it("coalesces duplicate patch approval into one apply and one history entry", async () => {
    const gate = deferred();
    const sequence = patchThenDoneProvider();
    const patch = patchAdapter({ applyGate: gate.promise });
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: patch.adapter,
    });
    const waiting = await runtime.start("duplicate-patch", "Patch once.");
    const first = runtime.approvePatch(waiting.id);
    const duplicate = await runtime.approvePatch(waiting.id);
    expect(duplicate.status).toBe("ApplyingPatch");
    expect(patch.apply).toHaveBeenCalledTimes(1);
    gate.resolve();
    const completed = await first;
    expect(completed.status).toBe("Done");
    expect(completed.patchHistory).toHaveLength(1);
    expect(patch.apply).toHaveBeenCalledTimes(1);
  });

  it("coalesces duplicate command approval into one process and one continuation", async () => {
    const gate = deferred<ProjectCommandResult>();
    const sequence = commandThenDoneProvider();
    const patch = patchAdapter();
    const run = vi.fn(() => gate.promise);
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: patch.adapter,
      commandRunner: { run },
    });
    const waiting = await runtime.start("duplicate-command", "Run once.");
    const first = runtime.approveCommand(waiting.id);
    const duplicate = await runtime.approveCommand(waiting.id);
    expect(duplicate.status).toBe("RunningCommand");
    expect(run).toHaveBeenCalledTimes(1);
    gate.resolve(passingResult());
    const completed = await first;
    expect(completed.status).toBe("Done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(sequence.turns).toBe(2);
  });

  it("blocks rollback during an active model continuation and allows it after Done", async () => {
    const modelGate = deferred();
    const sequence = provider((_request, turn) => turn === 1
      ? chunks({ type: "text", text: "PATCH" })
      : (async function* () {
          await modelGate.promise;
          yield { type: "text", text: "Done." } as ModelChunk;
        })());
    const patch = patchAdapter();
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: patch.adapter,
    });
    const waiting = await runtime.start("active-model", "Patch then wait.");
    const approval = runtime.approvePatch(waiting.id);
    await vi.waitFor(() => expect(runtime.getTask(waiting.id)?.status).toBe("Streaming"));
    expect(runtime.canRollback(waiting.id).allowed).toBe(false);
    expect(await runtime.rollbackLatest(waiting.id)).toBe(false);
    expect(patch.getContent()).toBe(changed);
    modelGate.resolve();
    expect((await approval).status).toBe("Done");
    expect(runtime.canRollback(waiting.id).allowed).toBe(true);
    expect(await runtime.rollbackLatest(waiting.id)).toBe(true);
    expect(patch.getContent()).toBe(original);
  });

  it("keeps rollback blocked while a cancelled command settles", async () => {
    const runGate = deferred<ProjectCommandResult>();
    const sequence = provider((_request, turn) => turn === 1
      ? chunks({ type: "text", text: "PATCH" })
      : turn === 2
        ? chunks(
            { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} },
            { type: "tool_call", id: "run", name: "run_project_command", arguments: { commandId: "package-script:test" } },
          )
        : chunks({ type: "text", text: "unused" }));
    const patch = patchAdapter();
    const runner: ProjectCommandRunner = {
      run: () => runGate.promise,
      cancel: () => runGate.resolve({ ...passingResult(), exitCode: null, cancelled: true }),
    };
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: patch.adapter, commandRunner: runner,
    });
    let task = await runtime.start("cancel-running", "Patch and test.");
    task = await runtime.approvePatch(task.id);
    const command = runtime.approveCommand(task.id);
    await vi.waitFor(() => expect(runtime.getTask(task.id)?.status).toBe("RunningCommand"));
    const cancellation = runtime.cancel(task.id);
    expect(runtime.getTask(task.id)?.status).toBe("Cancelling");
    expect(runtime.canRollback(task.id).allowed).toBe(false);
    expect(await runtime.rollbackLatest(task.id)).toBe(false);
    await Promise.all([command, cancellation]);
    expect(runtime.getTask(task.id)?.status).toBe("Cancelled");
    expect(runtime.canRollback(task.id).allowed).toBe(true);
    expect(await runtime.rollbackLatest(task.id)).toBe(true);
  });

  it.each(["Done", "Failed", "LimitReached"] as const)(
    "allows verified rollback after settled %s",
    async (terminalStatus) => {
      const sequence = provider((_request, turn) => turn === 1
        ? chunks({ type: "text", text: "PATCH" })
        : terminalStatus === "Failed"
          ? chunks({ type: "error", message: "provider failed" })
          : chunks({ type: "text", text: "Done." }));
      const patch = patchAdapter();
      const runtime = new AgentLoopRuntime({
        provider: sequence,
        modelId: "model",
        project,
        patchAdapter: patch.adapter,
        ...(terminalStatus === "LimitReached" ? { limits: { maxModelTurns: 1 } } : {}),
      });
      const waiting = await runtime.start(`rollback-${terminalStatus}`, "Patch safely.");
      const terminal = await runtime.approvePatch(waiting.id);
      expect(terminal.status).toBe(terminalStatus);
      expect(runtime.canRollback(waiting.id).allowed).toBe(true);
      expect(await runtime.rollbackLatest(waiting.id)).toBe(true);
      expect(patch.getContent()).toBe(original);
    },
  );

  it("serializes rollback-all so duplicate actions cannot corrupt history", async () => {
    const rollbackGate = deferred();
    let prepareCount = 0;
    const firstChanged = "export const value = 2;\n";
    const secondChanged = "export const value = 3;\n";
    const sequence = provider((_request, turn) => chunks({
      type: "text",
      text: turn <= 2 ? "PATCH" : "Done.",
    }));
    const base = patchAdapter({ rollbackGate: rollbackGate.promise });
    base.adapter.prepare = async (response, taskId) => {
      if (response !== "PATCH") {
        return { assistantText: response, proposal: null, error: { code: "patch_not_present", message: "No patch." } };
      }
      prepareCount += 1;
      return {
        assistantText: "proposal",
        proposal: patchProposal(taskId, prepareCount === 1 ? original : firstChanged, prepareCount === 1 ? firstChanged : secondChanged),
        error: null,
      };
    };
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: base.adapter,
    });
    let task = await runtime.start("rollback-all", "Apply two patches.");
    task = await runtime.approvePatch(task.id);
    task = await runtime.approvePatch(task.id);
    expect(task.status).toBe("Done");
    expect(task.patchHistory).toHaveLength(2);

    const first = runtime.rollbackAll(task.id);
    const duplicate = await runtime.rollbackAll(task.id);
    expect(duplicate).toBe(false);
    rollbackGate.resolve();
    expect(await first).toBe(true);
    expect(runtime.getTask(task.id)?.patchHistory).toHaveLength(0);
    expect(base.rollback).toHaveBeenCalledTimes(2);
  });
});
