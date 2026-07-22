import type { ModelToolCall } from "@qodex/provider-sdk";
import { AgentToolRegistry, type AgentToolResult } from "./tools.js";
import type {
  AgentLoopLimits,
  AgentLoopListener,
  AgentLoopRuntimeOptions,
  AgentLoopStatus,
  AgentLoopTask,
  AgentTimelineEntry,
  AgentRollbackAvailability,
  PendingCommandApproval,
  PendingPatchDisposition,
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
  private readonly now: () => number;
  private readonly queuedCalls = new Map<string, ModelToolCall[]>();
  private readonly activeCommandRuns = new Map<string, string>();
  private readonly activeApprovalActions = new Set<string>();
  private readonly activePatchApplies = new Set<string>();
  private readonly activeRollbacks = new Set<string>();
  private readonly cancellationRequests = new Set<string>();
  private readonly operationSettlements = new Map<string, Promise<void>>();
  private readonly operationResolvers = new Map<string, () => void>();
  private readonly runningTasks = new Set<string>();

  constructor(private readonly options: AgentLoopRuntimeOptions) {
    this.tools = new AgentToolRegistry(options.project);
    this.limits = normalizeLimits(options.limits);
    this.now = options.now ?? Date.now;
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
    const now = this.now();
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
    if (!proposal || !this.claimApproval(task, "WaitingForPatchApproval")) return cloneTask(task);

    this.activeApprovalActions.add(task.id);
    task.pendingPatch = null;
    this.setStatus(task, "ApplyingPatch");
    this.beginOperation(task.id);
    let shouldContinue = false;
    try {
      if (!this.guardTaskAction(task, "ApplyingPatch")) return cloneTask(task);
      const approvalEntry = this.addTimeline(task, {
        kind: "patch_approval",
        title: "Patch approved",
        status: "running",
        summary: proposal.summary,
        actionId: proposal.id,
      });
      this.activePatchApplies.add(task.id);
      let results;
      try {
        results = await this.options.patchAdapter.apply(proposal);
      } finally {
        this.activePatchApplies.delete(task.id);
      }
      const success = results.length === proposal.files.length
        && results.every((result) => result.success && result.readbackVerified === true);
      approvalEntry.status = success ? "success" : "error";
      this.updateLatestTimeline(
        task,
        (entry) => entry.kind === "patch_proposal" && entry.status === "pending",
        success ? "success" : "error",
      );
      if (success) task.patchHistory.push(proposal);
      this.addTimeline(task, {
        kind: "patch_approval",
        title: success ? "Patch applied and verified" : "Patch apply failed",
        status: success ? "success" : "error",
        summary: success
          ? `${results.length} file write${results.length === 1 ? "" : "s"} verified by readback.`
          : "No unverified write was accepted.",
        detail: JSON.stringify(results),
        actionId: proposal.id,
      });
      if (this.cancellationRequests.has(task.id) || task.status === "Cancelling" || isTerminal(task.status)) {
        if (!isTerminal(task.status)) {
          this.terminateTask(task, "Cancelled", "Agent task cancelled after patch application settled.", "task_cancelled");
        }
        return cloneTask(task);
      }
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
      this.setStatus(task, "ReturningToolResult");
      shouldContinue = true;
    } catch (error) {
      if (!this.cancellationRequests.has(task.id)) {
        this.fail(task, error instanceof Error ? error.message : "Patch application failed.");
      }
    } finally {
      this.activePatchApplies.delete(task.id);
      this.activeApprovalActions.delete(task.id);
      this.endOperation(task.id);
    }
    if (shouldContinue) await this.continueLoop(task);
    return cloneTask(task);
  }

  async rejectPatch(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const proposal = task.pendingPatch;
    if (!proposal || !this.claimApproval(task, "WaitingForPatchApproval")) return cloneTask(task);

    this.activeApprovalActions.add(task.id);
    try {
      task.pendingPatch = null;
      this.options.patchAdapter.reject(proposal);
      this.updateLatestTimeline(task, (entry) => entry.kind === "patch_proposal" && entry.status === "pending", "denied");
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
        actionId: proposal.id,
      });
      this.setStatus(task, "ReturningToolResult");
    } finally {
      this.activeApprovalActions.delete(task.id);
    }
    await this.continueLoop(task);
    return cloneTask(task);
  }

  async approveCommand(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const pending = task.pendingCommand;
    if (!pending || !this.claimApproval(task, "WaitingForCommandApproval")) return cloneTask(task);
    const runner = this.options.commandRunner;
    if (!runner) throw new Error("No native project command runner is configured.");

    this.activeApprovalActions.add(task.id);
    const runId = crypto.randomUUID();
    task.pendingCommand = null;
    this.setStatus(task, "RunningCommand");
    this.beginOperation(task.id);
    this.addTimeline(task, {
      kind: "command_approval",
      title: "Command approved",
      status: "success",
      summary: formatCommand(pending),
      toolCallId: pending.toolCall.id,
      actionId: pending.toolCall.id,
    });
    let result: ProjectCommandResult;
    try {
      if (!this.guardTaskAction(task, "RunningCommand")) return cloneTask(task);
      this.activeCommandRuns.set(task.id, runId);
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
      if (this.cancellationRequests.has(task.id) || task.status === "Cancelling" || isTerminal(task.status)) {
        if (!isTerminal(task.status)) {
          this.terminateTask(task, "Cancelled", "Agent task cancelled after command execution settled.", "task_cancelled");
        }
        return cloneTask(task);
      }
      this.appendCommandResult(task, pending, result);
      this.setStatus(task, "ReturningToolResult");
    } finally {
      this.activeCommandRuns.delete(task.id);
      this.activeApprovalActions.delete(task.id);
      this.endOperation(task.id);
    }
    if (await this.processQueuedCalls(task)) await this.continueLoop(task);
    return cloneTask(task);
  }

  async denyCommand(taskId: string): Promise<AgentLoopTask> {
    const task = this.requireTask(taskId);
    const pending = task.pendingCommand;
    if (!pending || !this.claimApproval(task, "WaitingForCommandApproval")) return cloneTask(task);

    this.activeApprovalActions.add(task.id);
    try {
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
        toolCallId: pending.toolCall.id,
        actionId: pending.toolCall.id,
      });
      this.setStatus(task, "ReturningToolResult");
    } finally {
      this.activeApprovalActions.delete(task.id);
    }
    if (await this.processQueuedCalls(task)) await this.continueLoop(task);
    return cloneTask(task);
  }

  async rollbackLatest(taskId: string): Promise<boolean> {
    const task = this.requireTask(taskId);
    if (!this.canRollback(taskId).allowed || task.patchHistory.length === 0) return false;
    this.activeRollbacks.add(task.id);
    try {
      return await this.rollbackOne(task);
    } finally {
      this.activeRollbacks.delete(task.id);
      this.touch(task);
    }
  }

  async rollbackAll(taskId: string): Promise<boolean> {
    const task = this.requireTask(taskId);
    if (!this.canRollback(taskId).allowed || task.patchHistory.length === 0) return false;
    this.activeRollbacks.add(task.id);
    try {
      while (task.patchHistory.length > 0) {
        if (!await this.rollbackOne(task)) return false;
      }
      return true;
    } finally {
      this.activeRollbacks.delete(task.id);
      this.touch(task);
    }
  }

  canRollback(taskId: string): AgentRollbackAvailability {
    const task = this.tasks.get(taskId);
    if (!task) return { allowed: false, reason: "Agent task not found." };
    if (!isTerminal(task.status)) {
      return { allowed: false, reason: "Rollback becomes available after the Agent stops or finishes." };
    }
    if (this.runningTasks.has(taskId)
      || this.activeApprovalActions.has(taskId)
      || this.activePatchApplies.has(taskId)
      || this.activeCommandRuns.has(taskId)
      || this.operationSettlements.has(taskId)
      || this.activeRollbacks.has(taskId)
      || this.cancellationRequests.has(taskId)
      || (this.queuedCalls.get(taskId)?.length ?? 0) > 0) {
      return { allowed: false, reason: "Rollback is blocked until active Agent work has settled." };
    }
    return { allowed: true };
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || isTerminal(task.status)) return;
    if (this.cancellationRequests.has(taskId)) {
      await this.operationSettlements.get(taskId);
      return;
    }

    this.cancellationRequests.add(taskId);
    try {
      const settlement = this.operationSettlements.get(taskId);
      if (!settlement) {
        this.terminateTask(task, "Cancelled", "Agent task cancelled.", "task_cancelled");
        return;
      }

      this.disposePendingState(task, "task_cancelled");
      this.setStatus(task, "Cancelling");
      const runId = this.activeCommandRuns.get(taskId);
      if (runId) {
        try {
          await this.options.commandRunner?.cancel?.(runId);
        } catch {
          // The command future remains the source of truth for settlement.
        }
      }
      await settlement;
      if (!isTerminal(task.status)) {
        this.terminateTask(task, "Cancelled", "Agent task cancelled after active work settled.", "task_cancelled");
      }
    } finally {
      this.cancellationRequests.delete(taskId);
      if (isTerminal(task.status)) this.touch(task);
    }
  }

  private async continueLoop(task: AgentLoopTask): Promise<void> {
    if (this.runningTasks.has(task.id)) return;
    this.runningTasks.add(task.id);
    try {
      while (!isTerminal(task.status) && !isWaiting(task.status)) {
        if (!this.guardTaskAction(task, ["Planning", "ReturningToolResult"])) return;
        if (task.modelTurns >= this.limits.maxModelTurns) {
          this.reachLimit(task, `Maximum model turns reached (${this.limits.maxModelTurns}).`);
          return;
        }
        this.setStatus(task, "CallingModel");
        if (!this.guardTaskAction(task, "CallingModel")) return;
        task.modelTurns += 1;
        this.setStatus(task, "Streaming");
        const rawText: string[] = [];
        const calls: ModelToolCall[] = [];
        let streamFailure: string | null = null;
        if (!this.guardTaskAction(task, "Streaming")) return;
        const stream = this.options.provider.stream({
          model: this.options.modelId,
          messages: task.conversation,
          tools: this.tools.definitions(),
        });
        for await (const chunk of stream) {
          if (isTerminal(task.status) || task.status === "Cancelling" || this.cancellationRequests.has(task.id)) return;
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
        if (!this.guardTaskAction(task, "Streaming")) return;
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
        if (!this.guardTaskAction(task, "Streaming")) return;
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
            actionId: parsed.proposal.id,
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
      if (!this.cancellationRequests.has(task.id) && task.status !== "Cancelling" && !isTerminal(task.status)) {
        this.fail(task, error instanceof Error ? error.message : "Agent loop failed.");
      }
    } finally {
      this.runningTasks.delete(task.id);
      if (isTerminal(task.status)) this.touch(task);
    }
  }

  private async processQueuedCalls(task: AgentLoopTask): Promise<boolean> {
    const queue = this.queuedCalls.get(task.id) ?? [];
    while (queue.length > 0) {
      if (!this.guardTaskAction(task, ["Streaming", "ReturningToolResult"])) return false;
      if (!this.consumeToolBudget(task, queue[0])) return false;
      const call = queue.shift()!;
      this.addTimeline(task, {
        kind: "tool_request",
        title: call.name,
        status: call.name === "run_project_command" ? "pending" : "running",
        summary: safeArguments(call.arguments),
        toolCallId: call.id,
        actionId: call.name === "run_project_command" ? call.id : undefined,
      });
      if (call.name === "run_project_command") {
        const resolved = await this.tools.resolveCommand(call);
        if (!this.guardTaskAction(task, ["Streaming", "ReturningToolResult"])) return false;
        if (resolved.result) {
          this.appendToolResult(task, call, resolved.result);
          this.setStatus(task, "ReturningToolResult");
          continue;
        }
        task.pendingCommand = { toolCall: call, command: resolved.command! };
        this.queuedCalls.set(task.id, queue);
        this.setStatus(task, "WaitingForCommandApproval");
        return false;
      }
      this.setStatus(task, "ExecutingReadTool");
      const result = await this.tools.executeReadTool(call);
      if (!this.guardTaskAction(task, "ExecutingReadTool")) return false;
      this.appendToolResult(task, call, result);
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
      toolCallId: call.id,
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
      toolCallId: pending.toolCall.id,
      actionId: pending.toolCall.id,
    });
  }

  private requireTask(taskId: string): AgentLoopTask {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Agent task not found: ${taskId}`);
    return task;
  }

  private claimApproval(task: AgentLoopTask, expectedStatus: AgentLoopStatus): boolean {
    return !this.activeApprovalActions.has(task.id)
      && !this.activeRollbacks.has(task.id)
      && this.guardTaskAction(task, expectedStatus);
  }

  private guardTaskAction(
    task: AgentLoopTask,
    expectedStatus: AgentLoopStatus | AgentLoopStatus[],
  ): boolean {
    if (isTerminal(task.status) || task.status === "Cancelling" || this.cancellationRequests.has(task.id)) {
      return false;
    }
    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!expected.includes(task.status) || this.activeRollbacks.has(task.id)) return false;
    return this.checkDuration(task);
  }

  private checkDuration(task: AgentLoopTask): boolean {
    if (this.now() - task.startedAt <= this.limits.maxTaskDurationMs) return true;
    this.reachLimit(task, "Maximum task duration reached.");
    return false;
  }

  private reachLimit(task: AgentLoopTask, reason: string): void {
    task.limitReason = reason;
    this.terminateTask(task, "LimitReached", reason, "task_expired");
  }

  private fail(task: AgentLoopTask, message: string): void {
    task.error = message;
    this.terminateTask(task, "Failed", message, "task_failed");
  }

  private terminateTask(
    task: AgentLoopTask,
    status: "Cancelled" | "LimitReached" | "Failed",
    reason: string,
    disposition: Exclude<PendingPatchDisposition, "user_rejected">,
  ): void {
    if (isTerminal(task.status)) return;
    this.disposePendingState(task, disposition);
    this.setStatus(task, status);
    this.addTimeline(task, status === "LimitReached"
      ? { kind: "limit", title: "Agent limit reached", status: "error", summary: reason }
      : status === "Failed"
        ? { kind: "failure", title: "Agent failed", status: "error", summary: reason }
        : { kind: "failure", title: "Agent cancelled", status: "cancelled", summary: reason });
  }

  private disposePendingState(
    task: AgentLoopTask,
    disposition: Exclude<PendingPatchDisposition, "user_rejected">,
  ): void {
    const pendingPatch = task.pendingPatch;
    task.pendingPatch = null;
    if (pendingPatch) {
      try {
        this.options.patchAdapter.reject(pendingPatch);
      } catch {
        // Disposal remains final even if an adapter cannot update its transient view state.
      }
      const status = disposition === "task_cancelled" ? "cancelled" : disposition === "task_expired" ? "expired" : "error";
      this.updateLatestTimeline(task, (entry) => entry.kind === "patch_proposal" && entry.status === "pending", status);
      this.addTimeline(task, {
        kind: "patch_approval",
        title: disposition === "task_cancelled"
          ? "Patch discarded after cancellation"
          : disposition === "task_expired"
            ? "Patch expired before approval"
            : "Patch discarded after task failure",
        status,
        summary: "No files were changed.",
        actionId: pendingPatch.id,
      });
    }

    const pendingCommand = task.pendingCommand;
    task.pendingCommand = null;
    if (pendingCommand) {
      const status = disposition === "task_cancelled" ? "cancelled" : disposition === "task_expired" ? "expired" : "error";
      this.updateLatestTimeline(
        task,
        (entry) => entry.kind === "tool_request"
          && entry.title === pendingCommand.toolCall.name
          && entry.status === "pending",
        status,
      );
      this.addTimeline(task, {
        kind: "command_approval",
        title: disposition === "task_cancelled"
          ? "Command discarded after cancellation"
          : disposition === "task_expired"
            ? "Command expired before approval"
            : "Command discarded after task failure",
        status,
        summary: "No process was started.",
        toolCallId: pendingCommand.toolCall.id,
        actionId: pendingCommand.toolCall.id,
      });
    }
    this.queuedCalls.delete(task.id);
  }

  private beginOperation(taskId: string): void {
    let resolve: () => void = () => {};
    const settlement = new Promise<void>((settle) => {
      resolve = settle;
    });
    this.operationSettlements.set(taskId, settlement);
    this.operationResolvers.set(taskId, resolve);
  }

  private endOperation(taskId: string): void {
    this.operationResolvers.get(taskId)?.();
    this.operationResolvers.delete(taskId);
    this.operationSettlements.delete(taskId);
    const task = this.tasks.get(taskId);
    if (task && isTerminal(task.status)) this.touch(task);
  }

  private async rollbackOne(task: AgentLoopTask): Promise<boolean> {
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

  private setStatus(task: AgentLoopTask, status: AgentLoopStatus): void {
    task.status = status;
    this.touch(task);
  }

  private addTimeline(task: AgentLoopTask, entry: Omit<AgentTimelineEntry, "id" | "timestamp">): AgentTimelineEntry {
    const recorded = { ...entry, id: crypto.randomUUID(), timestamp: new Date(this.now()).toISOString() };
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
    task.updatedAt = this.now();
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
