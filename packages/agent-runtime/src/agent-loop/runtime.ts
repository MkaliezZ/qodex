import type { ModelToolCall } from "@qodex/provider-sdk";
import { AgentToolRegistry, type AgentToolResult } from "./tools.js";
import type {
  AgentLoopLimits,
  AgentLoopListener,
  AgentLoopRuntimeOptions,
  AgentLoopStatus,
  AgentLoopTask,
  AgentTimelineEntry,
  PendingCommandApproval,
  ProjectCommandResult,
} from "./types.js";

const DEFAULT_LIMITS: AgentLoopLimits = {
  maxModelTurns: 10,
  maxTotalToolCalls: 20,
  maxSearchCalls: 8,
  maxReadCalls: 12,
  maxCommandCalls: 4,
  maxPatchProposals: 4,
  maxTaskDurationMs: 15 * 60 * 1000,
};

const SYSTEM_PROMPT = `You are KerniQ Agent Mode. Inspect the opened project with the provided read-only tools before proposing changes. Source modifications must be returned only as one KERNIQ_PATCH_V1 envelope and will pause for explicit user approval. To validate work, list the trusted project commands and request run_project_command by commandId; every command pauses for separate approval. Never invent tool results, absolute paths, raw shell commands, environment variables, new files, or file deletions. Finish only from observed tool and command results.`;

export class AgentLoopRuntime {
  private readonly tasks = new Map<string, AgentLoopTask>();
  private readonly listeners = new Set<AgentLoopListener>();
  private readonly tools: AgentToolRegistry;
  private readonly limits: AgentLoopLimits;
  private readonly queuedCalls = new Map<string, ModelToolCall[]>();
  private readonly activeCommandRuns = new Map<string, string>();
  private runningTasks = new Set<string>();

  constructor(private readonly options: AgentLoopRuntimeOptions) {
    this.tools = new AgentToolRegistry(options.project);
    this.limits = normalizeLimits(options.limits);
  }

  isSupported(): boolean {
    return this.options.provider.capabilities?.toolAgentLoop === true
      && (this.options.provider.supportsAgentTools?.(this.options.modelId) ?? true);
  }

  subscribe(listener: AgentLoopListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTask(taskId: string): AgentLoopTask | undefined {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : undefined;
  }

  async start(taskId: string, prompt: string): Promise<AgentLoopTask> {
    if (this.tasks.has(taskId)) throw new Error(`Agent task already exists: ${taskId}`);
    const now = Date.now();
    const task: AgentLoopTask = {
      id: taskId,
      prompt,
      status: "Idle",
      output: "",
      error: null,
      limitReason: null,
      conversation: [
        { role: "system", content: this.options.systemPrompt ?? SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      timeline: [],
      pendingPatch: null,
      pendingCommand: null,
      patchHistory: [],
      modelTurns: 0,
      totalToolCalls: 0,
      searchCalls: 0,
      readCalls: 0,
      commandCalls: 0,
      patchProposals: 0,
      startedAt: now,
      updatedAt: now,
    };
    this.tasks.set(taskId, task);
    if (!this.isSupported()) {
      this.fail(task, "Agent Mode is unavailable for the selected provider. Normal single-turn mode remains available.");
      return cloneTask(task);
    }
    this.setStatus(task, "Planning");
    await this.continueLoop(task);
    return cloneTask(task);
  }

  async approvePatch(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const proposal = task.pendingPatch;
    if (task.status !== "WaitingForPatchApproval" || !proposal) {
      throw new Error("This task is not waiting for patch approval.");
    }
    this.setStatus(task, "ApplyingPatch");
    const approvalEntry = this.addTimeline(task, {
      kind: "patch_approval",
      title: "Patch approved",
      status: "running",
      summary: proposal.summary,
    });
    const results = await this.options.patchAdapter.apply(proposal);
    const success = results.length === proposal.files.length
      && results.every((result) => result.success && result.readbackVerified === true);
    approvalEntry.status = success ? "success" : "error";
    this.updateLatestTimeline(task, (entry) => entry.kind === "patch_proposal" && entry.status === "pending", success ? "success" : "error");
    task.pendingPatch = null;
    if (success) task.patchHistory.push(proposal);
    task.conversation.push({
      role: "user",
      content: `KerniQ patch approval result: ${JSON.stringify({
        approved: true,
        applied: success,
        proposalId: proposal.id,
        files: results.map((result) => ({
          path: result.path,
          success: result.success,
          readbackVerified: result.readbackVerified === true,
          ...(result.code ? { code: result.code } : {}),
        })),
      })}`,
    });
    this.addTimeline(task, {
      kind: "patch_approval",
      title: success ? "Patch applied and verified" : "Patch apply failed",
      status: success ? "success" : "error",
      summary: success
        ? `${results.length} file write${results.length === 1 ? "" : "s"} verified by readback.`
        : "No unverified write was accepted.",
      detail: JSON.stringify(results),
    });
    this.setStatus(task, "ReturningToolResult");
    await this.continueLoop(task);
    return cloneTask(task);
  }

  async rejectPatch(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const proposal = task.pendingPatch;
    if (task.status !== "WaitingForPatchApproval" || !proposal) {
      throw new Error("This task is not waiting for patch approval.");
    }
    this.options.patchAdapter.reject(proposal);
    this.updateLatestTimeline(task, (entry) => entry.kind === "patch_proposal" && entry.status === "pending", "denied");
    task.pendingPatch = null;
    task.conversation.push({
      role: "user",
      content: `KerniQ patch approval result: ${JSON.stringify({
        approved: false,
        applied: false,
        proposalId: proposal.id,
      })}`,
    });
    this.addTimeline(task, {
      kind: "patch_approval",
      title: "Patch rejected",
      status: "denied",
      summary: "No files were changed.",
    });
    this.setStatus(task, "ReturningToolResult");
    await this.continueLoop(task);
    return cloneTask(task);
  }

  async approveCommand(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const pending = task.pendingCommand;
    if (task.status !== "WaitingForCommandApproval" || !pending) {
      throw new Error("This task is not waiting for command approval.");
    }
    const runner = this.options.commandRunner;
    if (!runner) throw new Error("No native project command runner is configured.");
    const runId = crypto.randomUUID();
    task.pendingCommand = null;
    this.activeCommandRuns.set(task.id, runId);
    this.setStatus(task, "RunningCommand");
    this.addTimeline(task, {
      kind: "command_approval",
      title: "Command approved",
      status: "success",
      summary: formatCommand(pending),
    });
    let result: ProjectCommandResult;
    try {
      result = await runner.run(pending.command, runId);
    } catch (error) {
      result = {
        commandId: pending.command.id,
        approved: true,
        started: true,
        exitCode: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : "Native command execution failed.",
        timedOut: false,
        cancelled: false,
        stdoutTruncated: false,
        stderrTruncated: false,
        durationMs: 0,
      };
    } finally {
      this.activeCommandRuns.delete(task.id);
    }
    if (taskIsCancelled(task)) return cloneTask(task);
    this.appendCommandResult(task, pending, result);
    this.setStatus(task, "ReturningToolResult");
    if (await this.processQueuedCalls(task)) await this.continueLoop(task);
    return cloneTask(task);
  }

  async denyCommand(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const pending = task.pendingCommand;
    if (task.status !== "WaitingForCommandApproval" || !pending) {
      throw new Error("This task is not waiting for command approval.");
    }
    task.pendingCommand = null;
    const result: ProjectCommandResult = {
      commandId: pending.command.id,
      approved: false,
      started: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      cancelled: false,
      stdoutTruncated: false,
      stderrTruncated: false,
      durationMs: 0,
    };
    this.appendCommandResult(task, pending, result);
    this.addTimeline(task, {
      kind: "command_approval",
      title: "Command denied",
      status: "denied",
      summary: "No process was started.",
    });
    this.setStatus(task, "ReturningToolResult");
    if (await this.processQueuedCalls(task)) await this.continueLoop(task);
    return cloneTask(task);
  }

  async rollbackLatest(taskId: string): Promise<boolean> {
    const task = this.requireTask(taskId);
    const proposal = task.patchHistory.at(-1);
    if (!proposal) return false;
    const results = await this.options.patchAdapter.rollback(proposal);
    const success = results.length === proposal.files.length
      && results.every((result) => result.success && result.readbackVerified === true);
    if (success) task.patchHistory.pop();
    this.addTimeline(task, {
      kind: "patch_approval",
      title: success ? "Latest task patch rolled back" : "Task patch rollback blocked",
      status: success ? "success" : "error",
      summary: success ? "Original contents restored and verified." : "Newer file contents were preserved.",
      detail: JSON.stringify(results),
    });
    return success;
  }

  async rollbackAll(taskId: string): Promise<boolean> {
    const task = this.requireTask(taskId);
    while (task.patchHistory.length > 0) {
      if (!await this.rollbackLatest(taskId)) return false;
    }
    return true;
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || isTerminal(task.status)) return;
    this.setStatus(task, "Cancelled");
    const runId = this.activeCommandRuns.get(taskId);
    if (runId) await this.options.commandRunner?.cancel?.(runId);
  }

  private async continueLoop(task: AgentLoopTask): Promise<void> {
    if (this.runningTasks.has(task.id)) return;
    this.runningTasks.add(task.id);
    try {
      while (!isTerminal(task.status) && !isWaiting(task.status)) {
        if (!this.checkDuration(task)) return;
        if (task.modelTurns >= this.limits.maxModelTurns) {
          this.reachLimit(task, `Maximum model turns reached (${this.limits.maxModelTurns}).`);
          return;
        }
        this.setStatus(task, "CallingModel");
        task.modelTurns += 1;
        this.setStatus(task, "Streaming");
        const rawText: string[] = [];
        const calls: ModelToolCall[] = [];
        let streamFailure: string | null = null;
        const stream = this.options.provider.stream({
          model: this.options.modelId,
          messages: task.conversation,
          tools: this.tools.definitions(),
        });
        for await (const chunk of stream) {
          if (task.status === "Cancelled") return;
          if (chunk.type === "text") {
            rawText.push(chunk.text);
            task.output += chunk.text;
            this.touch(task);
          } else if (chunk.type === "tool_call") {
            calls.push(chunk);
          } else if (chunk.type === "tool_call_error") {
            streamFailure = `Malformed tool call ${chunk.id ?? chunk.index}: ${chunk.message}`;
          } else if (chunk.type === "error") {
            streamFailure = chunk.message;
          }
        }
        if (streamFailure) {
          this.fail(task, streamFailure);
          return;
        }

        const response = rawText.join("");
        task.conversation.push({ role: "assistant", content: response, ...(calls.length ? { toolCalls: calls } : {}) });
        this.addTimeline(task, {
          kind: "model",
          title: `Model turn ${task.modelTurns}`,
          status: "success",
          summary: visibleModelText(response) || `${calls.length} tool request${calls.length === 1 ? "" : "s"}`,
        });

        if (calls.length > 0) {
          this.queuedCalls.set(task.id, [...calls]);
          if (!await this.processQueuedCalls(task)) return;
          continue;
        }

        const parsed = await this.options.patchAdapter.prepare(response, task.id);
        if (parsed.proposal) {
          if (task.patchProposals >= this.limits.maxPatchProposals) {
            this.reachLimit(task, `Maximum patch proposals reached (${this.limits.maxPatchProposals}).`);
            return;
          }
          task.patchProposals += 1;
          task.pendingPatch = parsed.proposal;
          task.output = parsed.assistantText;
          this.addTimeline(task, {
            kind: "patch_proposal",
            title: "Patch proposal",
            status: "pending",
            summary: parsed.proposal.summary,
            detail: parsed.proposal.files.map((file) => file.path).join("\n"),
          });
          this.setStatus(task, "WaitingForPatchApproval");
          return;
        }
        if (parsed.error && parsed.error.code !== "patch_not_present") {
          this.fail(task, parsed.error.message);
          return;
        }
        task.output = parsed.assistantText || response;
        this.setStatus(task, "Done");
        this.addTimeline(task, {
          kind: "final",
          title: "Final response",
          status: "success",
          summary: task.output,
        });
        return;
      }
    } catch (error) {
      this.fail(task, error instanceof Error ? error.message : "Agent loop failed.");
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private async processQueuedCalls(task: AgentLoopTask): Promise<boolean> {
    const queue = this.queuedCalls.get(task.id) ?? [];
    while (queue.length > 0) {
      if (!this.consumeToolBudget(task, queue[0])) return false;
      const call = queue.shift()!;
      this.addTimeline(task, {
        kind: "tool_request",
        title: call.name,
        status: call.name === "run_project_command" ? "pending" : "running",
        summary: safeArguments(call.arguments),
      });
      if (call.name === "run_project_command") {
        const resolved = await this.tools.resolveCommand(call);
        if (resolved.result) {
          this.appendToolResult(task, call, resolved.result);
          continue;
        }
        task.pendingCommand = { toolCall: call, command: resolved.command! };
        this.queuedCalls.set(task.id, queue);
        this.setStatus(task, "WaitingForCommandApproval");
        return false;
      }
      this.setStatus(task, "ExecutingReadTool");
      const result = await this.tools.executeReadTool(call);
      this.appendToolResult(task, call, result);
      if (task.status === "Cancelled") return false;
      this.setStatus(task, "ReturningToolResult");
    }
    this.queuedCalls.delete(task.id);
    return true;
  }

  private consumeToolBudget(task: AgentLoopTask, call: ModelToolCall): boolean {
    if (task.totalToolCalls >= this.limits.maxTotalToolCalls) {
      this.reachLimit(task, `Maximum total tool calls reached (${this.limits.maxTotalToolCalls}).`);
      return false;
    }
    const counter = call.name === "search_files"
      ? ["searchCalls", this.limits.maxSearchCalls] as const
      : call.name === "read_file"
        ? ["readCalls", this.limits.maxReadCalls] as const
        : call.name === "run_project_command"
          ? ["commandCalls", this.limits.maxCommandCalls] as const
          : null;
    if (counter && task[counter[0]] >= counter[1]) {
      this.reachLimit(task, `Maximum ${call.name} calls reached (${counter[1]}).`);
      return false;
    }
    task.totalToolCalls += 1;
    if (counter) task[counter[0]] += 1;
    return true;
  }

  private appendToolResult(task: AgentLoopTask, call: ModelToolCall, result: AgentToolResult): void {
    this.updateLatestTimeline(
      task,
      (entry) => entry.kind === "tool_request" && entry.title === call.name && entry.status === "running",
      result.ok ? "success" : "error",
    );
    task.conversation.push({
      role: "tool",
      toolCallId: call.id,
      name: call.name,
      content: this.tools.serialize(result),
    });
    this.addTimeline(task, {
      kind: "tool_result",
      title: `${call.name} result`,
      status: result.ok ? "success" : "error",
      summary: summarizeToolResult(result),
      detail: this.tools.serialize(result),
      durationMs: result.metadata.durationMs,
    });
  }

  private appendCommandResult(
    task: AgentLoopTask,
    pending: PendingCommandApproval,
    result: ProjectCommandResult,
  ): void {
    this.updateLatestTimeline(
      task,
      (entry) => entry.kind === "tool_request" && entry.title === pending.toolCall.name && entry.status === "pending",
      !result.approved ? "denied" : result.exitCode === 0 ? "success" : "error",
    );
    task.conversation.push({
      role: "tool",
      toolCallId: pending.toolCall.id,
      name: pending.toolCall.name,
      content: JSON.stringify({ ok: result.approved && result.started && result.exitCode === 0, ...result }),
    });
    this.addTimeline(task, {
      kind: "command_output",
      title: pending.command.label,
      status: !result.approved ? "denied" : result.exitCode === 0 ? "success" : "error",
      summary: !result.approved
        ? "Denied; no process started."
        : `Exit code ${result.exitCode ?? "unavailable"} in ${result.durationMs} ms.`,
      detail: [result.stdout, result.stderr].filter(Boolean).join("\n"),
      durationMs: result.durationMs,
    });
  }

  private requireTask(taskId: string): AgentLoopTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Agent task not found: ${taskId}`);
    return task;
  }

  private checkDuration(task: AgentLoopTask): boolean {
    if (Date.now() - task.startedAt <= this.limits.maxTaskDurationMs) return true;
    this.reachLimit(task, "Maximum task duration reached.");
    return false;
  }

  private reachLimit(task: AgentLoopTask, reason: string): void {
    task.limitReason = reason;
    task.pendingCommand = null;
    this.setStatus(task, "LimitReached");
    this.addTimeline(task, { kind: "limit", title: "Agent limit reached", status: "error", summary: reason });
  }

  private fail(task: AgentLoopTask, message: string): void {
    task.error = message;
    task.pendingCommand = null;
    this.setStatus(task, "Failed");
    this.addTimeline(task, { kind: "failure", title: "Agent failed", status: "error", summary: message });
  }

  private setStatus(task: AgentLoopTask, status: AgentLoopStatus): void {
    task.status = status;
    this.touch(task);
  }

  private addTimeline(task: AgentLoopTask, entry: Omit<AgentTimelineEntry, "id" | "timestamp">): AgentTimelineEntry {
    const recorded = { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    task.timeline.push(recorded);
    this.touch(task);
    return recorded;
  }

  private updateLatestTimeline(
    task: AgentLoopTask,
    predicate: (entry: AgentTimelineEntry) => boolean,
    status: AgentTimelineEntry["status"],
  ): void {
    for (let index = task.timeline.length - 1; index >= 0; index -= 1) {
      if (!predicate(task.timeline[index])) continue;
      task.timeline[index].status = status;
      return;
    }
  }

  private touch(task: AgentLoopTask): void {
    task.updatedAt = Date.now();
    const snapshot = cloneTask(task);
    for (const listener of this.listeners) listener(snapshot);
  }
}

function isTerminal(status: AgentLoopStatus): boolean {
  return status === "Done" || status === "Failed" || status === "Cancelled" || status === "LimitReached";
}

function normalizeLimits(overrides: Partial<AgentLoopLimits> | undefined): AgentLoopLimits {
  return Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([key, hardLimit]) => {
    const requested = overrides?.[key as keyof AgentLoopLimits];
    return [key, typeof requested === "number" && Number.isFinite(requested)
      ? Math.max(1, Math.min(Math.floor(requested), hardLimit))
      : hardLimit];
  })) as unknown as AgentLoopLimits;
}

function taskIsCancelled(task: AgentLoopTask): boolean {
  return task.status === "Cancelled";
}

function isWaiting(status: AgentLoopStatus): boolean {
  return status === "WaitingForPatchApproval" || status === "WaitingForCommandApproval";
}

function cloneTask(task: AgentLoopTask): AgentLoopTask {
  return {
    ...task,
    conversation: [...task.conversation],
    timeline: task.timeline.map((entry) => ({ ...entry })),
    patchHistory: [...task.patchHistory],
    pendingPatch: task.pendingPatch ? { ...task.pendingPatch, files: [...task.pendingPatch.files] } : null,
    pendingCommand: task.pendingCommand
      ? { toolCall: { ...task.pendingCommand.toolCall }, command: { ...task.pendingCommand.command, args: [...task.pendingCommand.command.args] } }
      : null,
  };
}

function safeArguments(value: unknown): string {
  if (typeof value !== "object" || value === null) return "Invalid arguments";
  return JSON.stringify(value).slice(0, 1000);
}

function summarizeToolResult(result: AgentToolResult): string {
  if (!result.ok) return `${result.code ?? "tool_error"}: ${result.error ?? "Tool failed."}`;
  if (typeof result.data === "object" && result.data !== null) {
    if ("matches" in result.data && Array.isArray(result.data.matches)) return `${result.data.matches.length} matches`;
    if ("commands" in result.data && Array.isArray(result.data.commands)) return `${result.data.commands.length} cataloged commands`;
    if ("path" in result.data && typeof result.data.path === "string") return `Read ${result.data.path}`;
  }
  return "Completed";
}

function formatCommand(pending: PendingCommandApproval): string {
  return `${pending.command.executable} ${pending.command.args.join(" ")} (cwd: ${pending.command.cwd})`;
}

function visibleModelText(response: string): string {
  const patchStart = response.search(/<KERNIQ_PATCH_V/);
  return (patchStart === -1 ? response : response.slice(0, patchStart)).trim();
}
