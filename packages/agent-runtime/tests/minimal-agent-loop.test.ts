import { describe, expect, it } from "vitest";
import type { ModelChunk, ModelProvider, ModelRequest } from "@qodex/provider-sdk";
import { DiffEngine, parseModelPatchResponse } from "@qodex/diff-engine";
import { AgentLoopRuntime } from "../src/agent-loop/runtime.js";
import type {
  AgentPatchAdapter,
  AgentPatchProposal,
  AgentProjectAccess,
  ProjectCommandDefinition,
  ProjectCommandResult,
  ProjectCommandRunner,
} from "../src/agent-loop/types.js";

const originalMath = "export const divide = (a: number, b: number) => 0;\n";
const firstMath = "export const divide = (a: number, b: number) => a * b;\n";
const correctedMath = "export const divide = (a: number, b: number) => a / b;\n";

function patchResponse(summary: string, oldContent: string, newContent: string): string {
  return `${summary}\n<KERNIQ_PATCH_V1>\n${JSON.stringify({
    version: "1",
    summary,
    files: [{ path: "src/math.ts", oldContent, newContent }],
  })}\n</KERNIQ_PATCH_V1>`;
}

class DeterministicAgentProvider implements ModelProvider {
  readonly id = "deterministic-agent";
  readonly name = "Deterministic Agent";
  readonly protocol = "openai-chat" as const;
  readonly capabilities = { toolAgentLoop: true } as const;
  readonly requests: ModelRequest[] = [];

  async listModels() { return [{ id: "agent-model", displayName: "Agent Model", supportsTools: true }]; }
  async testConnection() { return true; }

  async *stream(request: ModelRequest): AsyncIterable<ModelChunk> {
    this.requests.push(structuredClone(request));
    switch (this.requests.length) {
      case 1:
        yield { type: "tool_call", id: "call-search", name: "search_files", arguments: { query: "divide" } };
        return;
      case 2:
        yield { type: "tool_call", id: "call-read-math", name: "read_file", arguments: { path: "src/math.ts" } };
        return;
      case 3:
        yield { type: "text", text: patchResponse("First divide implementation", originalMath, firstMath) };
        return;
      case 4:
        yield { type: "tool_call", id: "call-list", name: "list_project_commands", arguments: {} };
        return;
      case 5:
        yield {
          type: "tool_call",
          id: "call-test-1",
          name: "run_project_command",
          arguments: { commandId: "package-script:test" },
        };
        return;
      case 6:
        yield { type: "tool_call", id: "call-read-test", name: "read_file", arguments: { path: "src/math.test.ts" } };
        return;
      case 7: {
        const failedResult = request.messages.find(
          (message) => message.role === "tool" && message.toolCallId === "call-test-1",
        );
        if (!failedResult?.content.includes('"exitCode":1')) throw new Error("Failed test was not returned to the model.");
        yield { type: "text", text: patchResponse("Correct divide after failed assertion", firstMath, correctedMath) };
        return;
      }
      case 8:
        yield {
          type: "tool_call",
          id: "call-test-2",
          name: "run_project_command",
          arguments: { commandId: "package-script:test" },
        };
        return;
      case 9: {
        const passingResult = request.messages.find(
          (message) => message.role === "tool" && message.toolCallId === "call-test-2",
        );
        yield {
          type: "text",
          text: passingResult?.content.includes('"exitCode":0')
            ? "Implemented divide and verified the cataloged test command passed with exit code 0."
            : "Missing passing evidence.",
        };
        return;
      }
      default:
        throw new Error("Unexpected extra model turn.");
    }
  }
}

function createHarness() {
  const files = new Map<string, string>([
    ["src/math.ts", originalMath],
    ["src/math.test.ts", "import { divide } from './math';\nexpect(divide(6, 2)).toBe(3);\n"],
    ["package.json", JSON.stringify({ scripts: { test: "node test.mjs", deploy: "curl example.test" } })],
  ]);
  let writes = 0;
  const fileTarget = {
    readFile: async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error("file not found");
      return content;
    },
    writeFile: async (path: string, content: string) => {
      if (!files.has(path)) throw new Error("file not found");
      writes += 1;
      files.set(path, content);
    },
  };
  const diff = new DiffEngine(fileTarget, fileTarget);
  const patchAdapter: AgentPatchAdapter = {
    prepare: async (response, taskId) => {
      const parsed = parseModelPatchResponse(response, taskId);
      if (!parsed.proposal) return parsed;
      const conflicts = await diff.validateProposal(parsed.proposal);
      return conflicts.length === 0
        ? parsed
        : { assistantText: parsed.assistantText, proposal: null, error: { code: conflicts[0].type, message: conflicts[0].detail } };
    },
    apply: (proposal) => diff.apply(proposal),
    reject: (proposal) => diff.reject(proposal),
    rollback: (proposal) => diff.rollback(proposal),
  };
  const project: AgentProjectAccess = {
    listFiles: () => [...files.entries()].map(([path, content]) => ({ path, size: content.length })),
    readFile: fileTarget.readFile,
    commandExecutionAvailable: true,
  };
  const commandResults: ProjectCommandResult[] = [];
  const runner: ProjectCommandRunner = {
    run: async (command: ProjectCommandDefinition) => {
      const passed = files.get("src/math.ts") === correctedMath;
      const result: ProjectCommandResult = {
        commandId: command.id,
        approved: true,
        started: true,
        exitCode: passed ? 0 : 1,
        stdout: passed ? "1 test passed" : "AssertionError: expected 12 to be 3",
        stderr: "",
        timedOut: false,
        cancelled: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: 5,
      };
      commandResults.push(result);
      return result;
    },
  };
  return { files, getWrites: () => writes, patchAdapter, project, runner, commandResults };
}

describe("KerniQ Minimal Agent Loop v0.4", () => {
  it("runs the deterministic failed-test-to-corrective-patch loop with both approvals", async () => {
    const provider = new DeterministicAgentProvider();
    const harness = createHarness();
    const runtime = new AgentLoopRuntime({
      provider,
      modelId: "agent-model",
      project: harness.project,
      patchAdapter: harness.patchAdapter,
      commandRunner: harness.runner,
    });

    let task = await runtime.start("task-1", "Implement divide and verify it.");
    expect(task.status).toBe("WaitingForPatchApproval");
    expect(task.timeline.some((entry) => entry.title === "search_files result")).toBe(true);
    expect(task.timeline.some((entry) => entry.title === "read_file result")).toBe(true);
    expect(harness.getWrites()).toBe(0);

    task = await runtime.approvePatch(task.id);
    expect(task.status).toBe("WaitingForCommandApproval");
    expect(harness.files.get("src/math.ts")).toBe(firstMath);
    expect(harness.commandResults).toHaveLength(0);

    task = await runtime.approveCommand(task.id);
    expect(harness.commandResults[0].exitCode).toBe(1);
    expect(task.status).toBe("WaitingForPatchApproval");
    expect(task.pendingPatch?.summary).toContain("failed assertion");

    task = await runtime.approvePatch(task.id);
    expect(task.status).toBe("WaitingForCommandApproval");
    expect(harness.files.get("src/math.ts")).toBe(correctedMath);

    task = await runtime.approveCommand(task.id);
    expect(harness.commandResults[1].exitCode).toBe(0);
    expect(task.status).toBe("Done");
    expect(task.output).toContain("verified the cataloged test command passed");
    expect(task.patchHistory).toHaveLength(2);
    expect(task.timeline.some((entry) => entry.status === "running" || entry.status === "pending")).toBe(false);
    expect(task.conversation.some(
      (message) => message.role === "tool" && message.toolCallId === "call-test-1" && message.content.includes('"exitCode":1'),
    )).toBe(true);
    expect(task.conversation.some(
      (message) => message.role === "tool" && message.toolCallId === "call-test-2" && message.content.includes('"exitCode":0'),
    )).toBe(true);
    expect(provider.requests.every((request) => request.tools?.length === 4)).toBe(true);

    expect(await runtime.rollbackLatest(task.id)).toBe(true);
    expect(harness.files.get("src/math.ts")).toBe(firstMath);
    expect(runtime.getTask(task.id)?.patchHistory).toHaveLength(1);
    expect(await runtime.rollbackAll(task.id)).toBe(true);
    expect(harness.files.get("src/math.ts")).toBe(originalMath);
    expect(runtime.getTask(task.id)?.patchHistory).toHaveLength(0);
  });

  it("returns command denial to the exact call ID without starting a process", async () => {
    const harness = createHarness();
    let starts = 0;
    const provider: ModelProvider = {
      id: "deny-sequence",
      name: "Deny Sequence",
      protocol: "openai-chat",
      capabilities: { toolAgentLoop: true },
      listModels: async () => [],
      testConnection: async () => true,
      async *stream(request) {
        const denial = request.messages.find((message) => message.role === "tool" && message.toolCallId === "deny-call");
        if (denial) {
          yield { type: "text", text: denial.content.includes('"started":false') ? "Command denial observed." : "Missing denial." };
        } else {
          yield { type: "tool_call", id: "list", name: "list_project_commands", arguments: {} };
          yield { type: "tool_call", id: "deny-call", name: "run_project_command", arguments: { commandId: "package-script:test" } };
        }
      },
    };
    const runtime = new AgentLoopRuntime({
      provider,
      modelId: "model",
      project: harness.project,
      patchAdapter: harness.patchAdapter,
      commandRunner: { run: async () => { starts += 1; throw new Error("must not run"); } },
    });
    let task = await runtime.start("deny-task", "Do not run without approval.");
    expect(task.status).toBe("WaitingForCommandApproval");
    expect(starts).toBe(0);
    task = await runtime.denyCommand(task.id);
    expect(starts).toBe(0);
    expect(task.status).toBe("Done");
    expect(task.output).toBe("Command denial observed.");
  });

  it("enforces the model-turn limit without another provider call", async () => {
    const harness = createHarness();
    let calls = 0;
    const provider: ModelProvider = {
      id: "limit", name: "Limit", protocol: "openai-chat", capabilities: { toolAgentLoop: true },
      listModels: async () => [], testConnection: async () => true,
      async *stream() {
        calls += 1;
        yield { type: "tool_call", id: `read-${calls}`, name: "read_file", arguments: { path: "src/math.ts" } };
      },
    };
    const runtime = new AgentLoopRuntime({
      provider,
      modelId: "model",
      project: harness.project,
      patchAdapter: harness.patchAdapter,
      limits: { maxModelTurns: 2 },
    });
    const task = await runtime.start("limit-task", "Loop forever.");
    expect(task.status).toBe("LimitReached");
    expect(task.limitReason).toContain("Maximum model turns");
    expect(calls).toBe(2);
  });

  it("keeps unsupported providers in honest single-turn-only mode", async () => {
    const harness = createHarness();
    const provider: ModelProvider = {
      id: "unsupported", name: "Unsupported", protocol: "anthropic", capabilities: { toolAgentLoop: false },
      listModels: async () => [], testConnection: async () => true, async *stream() { yield { type: "text", text: "unused" }; },
    };
    const runtime = new AgentLoopRuntime({
      provider, modelId: "model", project: harness.project, patchAdapter: harness.patchAdapter,
    });
    const task = await runtime.start("unsupported-task", "Try agent mode.");
    expect(task.status).toBe("Failed");
    expect(task.error).toContain("unavailable for the selected provider");
  });
});
