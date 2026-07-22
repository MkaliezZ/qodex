import { describe, expect, it } from "vitest";
import type { ModelChunk, ModelProvider, ModelRequest } from "@qodex/provider-sdk";
import { AgentLoopRuntime } from "../src/agent-loop/runtime.js";
import type {
  AgentPatchAdapter,
  AgentPatchProposal,
  AgentProjectAccess,
  ProjectCommandResult,
  ProjectCommandRunner,
} from "../src/agent-loop/types.js";

const project: AgentProjectAccess = {
  listFiles: () => [
    { path: "src/a.ts", size: 10 },
    { path: "package.json", size: 40 },
  ],
  readFile: async (path) => {
    if (path === "src/a.ts") return "const a = 1;";
    if (path === "package.json") return JSON.stringify({ scripts: { test: "node test.js" } });
    throw new Error("not found");
  },
  commandExecutionAvailable: true,
};

const noPatchAdapter: AgentPatchAdapter = {
  prepare: async (response) => ({
    assistantText: response,
    proposal: null,
    error: { code: "patch_not_present", message: "No patch." },
  }),
  apply: async () => [],
  reject: () => undefined,
  rollback: async () => [],
};

function provider(
  stream: (request: ModelRequest, turn: number) => AsyncIterable<ModelChunk>,
): ModelProvider & { turns: number } {
  return {
    id: "sequence",
    name: "Sequence",
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

describe("AgentLoopRuntime boundaries", () => {
  it("returns unknown and invalid tool errors to the exact calls", async () => {
    const sequence = provider((request, turn) => turn === 1
      ? chunks(
          { type: "tool_call", id: "unknown-1", name: "write_file", arguments: {} },
          { type: "tool_call", id: "invalid-1", name: "read_file", arguments: { path: "../secret" } },
        )
      : chunks({
          type: "text",
          text: request.messages.some((message) => message.role === "tool"
            && message.toolCallId === "unknown-1" && message.content.includes("unknown_tool"))
            && request.messages.some((message) => message.role === "tool"
              && message.toolCallId === "invalid-1" && message.content.includes("unsafe_path"))
            ? "Both tool errors observed."
            : "Missing tool errors.",
        }));
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: noPatchAdapter,
    });
    const task = await runtime.start("errors", "Try invalid tools.");
    expect(task.status).toBe("Done");
    expect(task.output).toBe("Both tool errors observed.");
  });

  it("fails honestly when the provider errors after a successful read tool", async () => {
    const sequence = provider((_request, turn) => turn === 1
      ? chunks({ type: "tool_call", id: "read", name: "read_file", arguments: { path: "src/a.ts" } })
      : chunks({ type: "error", message: "upstream unavailable" }));
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: noPatchAdapter,
    });
    const task = await runtime.start("provider-failure", "Read then fail.");
    expect(task.status).toBe("Failed");
    expect(task.error).toBe("upstream unavailable");
    expect(task.conversation.some((message) => message.role === "tool" && message.toolCallId === "read")).toBe(true);
  });

  it("resumes after patch rejection without applying files", async () => {
    let applyCalls = 0;
    let rejections = 0;
    const proposal: AgentPatchProposal = {
      id: "proposal-1",
      taskId: "patch-reject",
      summary: "Unsafe first idea",
      files: [{ path: "src/a.ts", oldContent: "const a = 1;", newContent: "const a = 2;" }],
      createdAt: new Date().toISOString(),
    };
    const patchAdapter: AgentPatchAdapter = {
      ...noPatchAdapter,
      prepare: async (response) => response === "PATCH"
        ? { assistantText: "proposal", proposal, error: null }
        : { assistantText: response, proposal: null, error: { code: "patch_not_present", message: "No patch." } },
      apply: async () => { applyCalls += 1; return []; },
      reject: () => { rejections += 1; },
    };
    const sequence = provider((request, turn) => turn === 1
      ? chunks({ type: "text", text: "PATCH" })
      : chunks({
          type: "text",
          text: request.messages.some((message) => message.role === "user" && message.content.includes('"approved":false'))
            ? "Rejection observed; finishing without a write."
            : "Missing rejection.",
        }));
    const runtime = new AgentLoopRuntime({ provider: sequence, modelId: "model", project, patchAdapter });
    let task = await runtime.start("patch-reject", "Propose a patch.");
    expect(task.status).toBe("WaitingForPatchApproval");
    task = await runtime.rejectPatch(task.id);
    expect(task.status).toBe("Done");
    expect(applyCalls).toBe(0);
    expect(rejections).toBe(1);
  });

  it("returns timeout evidence to the model after explicit approval", async () => {
    const sequence = provider((request, turn) => turn === 1
      ? chunks(
          { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} },
          { type: "tool_call", id: "timeout", name: "run_project_command", arguments: { commandId: "package-script:test" } },
        )
      : chunks({
          type: "text",
          text: request.messages.some((message) => message.role === "tool"
            && message.toolCallId === "timeout" && message.content.includes('"timedOut":true'))
            ? "Timeout observed."
            : "Missing timeout.",
        }));
    const runner: ProjectCommandRunner = {
      run: async (command): Promise<ProjectCommandResult> => ({
        commandId: command.id, approved: true, started: true, exitCode: null,
        stdout: "", stderr: "timed out", timedOut: true, cancelled: false,
        stdoutTruncated: false, stderrTruncated: false, durationMs: 120000,
      }),
    };
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: noPatchAdapter, commandRunner: runner,
    });
    let task = await runtime.start("timeout", "Run tests.");
    expect(task.status).toBe("WaitingForCommandApproval");
    task = await runtime.approveCommand(task.id);
    expect(task.status).toBe("Done");
    expect(task.output).toBe("Timeout observed.");
  });

  it("cancels a running command and prevents a later provider turn", async () => {
    let resolveRun: ((result: ProjectCommandResult) => void) | undefined;
    let cancelled = false;
    const sequence = provider((_request, turn) => turn === 1
      ? chunks(
          { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} },
          { type: "tool_call", id: "run", name: "run_project_command", arguments: { commandId: "package-script:test" } },
        )
      : chunks({ type: "text", text: "Must not run." }));
    const runner: ProjectCommandRunner = {
      run: (command) => new Promise((resolve) => { resolveRun = resolve; }),
      cancel: () => {
        cancelled = true;
        resolveRun?.({
          commandId: "package-script:test", approved: true, started: true, exitCode: null,
          stdout: "", stderr: "", timedOut: false, cancelled: true,
          stdoutTruncated: false, stderrTruncated: false, durationMs: 1,
        });
      },
    };
    const runtime = new AgentLoopRuntime({
      provider: sequence, modelId: "model", project, patchAdapter: noPatchAdapter, commandRunner: runner,
    });
    const waiting = await runtime.start("cancel-command", "Run tests.");
    const approval = runtime.approveCommand(waiting.id);
    await Promise.resolve();
    await runtime.cancel(waiting.id);
    const task = await approval;
    expect(cancelled).toBe(true);
    expect(task.status).toBe("Cancelled");
    expect(sequence.turns).toBe(1);
  });

  it("enforces total tool and command limits before another execution", async () => {
    let starts = 0;
    const toolProvider = provider((_request, turn) => chunks({
      type: "tool_call", id: `read-${turn}`, name: "read_file", arguments: { path: "src/a.ts" },
    }));
    const toolRuntime = new AgentLoopRuntime({
      provider: toolProvider,
      modelId: "model",
      project,
      patchAdapter: noPatchAdapter,
      limits: { maxTotalToolCalls: 2 },
    });
    const toolTask = await toolRuntime.start("tool-limit", "Keep reading.");
    expect(toolTask.status).toBe("LimitReached");
    expect(toolTask.totalToolCalls).toBe(2);

    const commandProvider = provider((_request, turn) => turn === 1
      ? chunks(
          { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} },
          { type: "tool_call", id: "run-1", name: "run_project_command", arguments: { commandId: "package-script:test" } },
        )
      : chunks({ type: "tool_call", id: "run-2", name: "run_project_command", arguments: { commandId: "package-script:test" } }));
    const commandRuntime = new AgentLoopRuntime({
      provider: commandProvider,
      modelId: "model",
      project,
      patchAdapter: noPatchAdapter,
      commandRunner: {
        run: async (command) => {
          starts += 1;
          return {
            commandId: command.id, approved: true, started: true, exitCode: 0,
            stdout: "pass", stderr: "", timedOut: false, cancelled: false,
            stdoutTruncated: false, stderrTruncated: false, durationMs: 1,
          };
        },
      },
      limits: { maxCommandCalls: 1 },
    });
    let commandTask = await commandRuntime.start("command-limit", "Run repeatedly.");
    commandTask = await commandRuntime.approveCommand(commandTask.id);
    expect(commandTask.status).toBe("LimitReached");
    expect(starts).toBe(1);
  });

  it("clamps caller-provided limits to the runtime hard ceilings", async () => {
    const sequence = provider((_request, turn) => chunks({
      type: "tool_call", id: `read-${turn}`, name: "read_file", arguments: { path: "src/a.ts" },
    }));
    const runtime = new AgentLoopRuntime({
      provider: sequence,
      modelId: "model",
      project,
      patchAdapter: noPatchAdapter,
      limits: { maxModelTurns: Number.MAX_SAFE_INTEGER },
    });
    const task = await runtime.start("hard-model-limit", "Keep reading.");
    expect(task.status).toBe("LimitReached");
    expect(task.modelTurns).toBe(10);
    expect(sequence.turns).toBe(10);
  });
});
