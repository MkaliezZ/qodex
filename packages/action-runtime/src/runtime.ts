import { ActionRuntimeError } from "./errors.js";
import { ActionHandlerRegistry } from "./registry.js";
import { transitionActionState } from "./state-machine.js";
import type {
  ActionApproval,
  ActionDecision,
  ActionDecisionProvider,
  ActionOutcome,
  ActionProposal,
  ActionRuntimeOptions,
  ActionSnapshot,
  ActionStarted,
} from "./types.js";
import { validateActionProposal } from "./validation.js";

interface ActionRecord {
  snapshot: ActionSnapshot;
  expectedGeneration: number;
  abortController: AbortController;
  executionPromise: Promise<ActionSnapshot> | null;
}

export class ActionRuntime {
  private readonly records = new Map<string, ActionRecord>();
  private readonly terminalOutcomes = new Map<string, ActionOutcome>();
  private readonly executionReceipts = new Set<string>();
  private readonly hooks;
  private readonly clock;
  private readonly idFactory;
  readonly registry = new ActionHandlerRegistry();

  constructor(options: ActionRuntimeOptions = {}) {
    this.hooks = options.hooks ?? {};
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory
      ?? (() => `receipt-${globalThis.crypto.randomUUID()}`);
  }

  async propose(proposal: ActionProposal): Promise<ActionSnapshot> {
    await validateActionProposal(proposal);
    if (this.records.has(proposal.actionId)) {
      throw new ActionRuntimeError("duplicate_action", "Action ID has already been proposed.");
    }
    const snapshot: ActionSnapshot = {
      proposal,
      state: "Proposed",
      approval: null,
      decision: null,
      started: null,
      outcome: null,
    };
    snapshot.state = transitionActionState(snapshot.state, "AwaitingApproval");
    this.records.set(proposal.actionId, {
      snapshot,
      expectedGeneration: 1,
      abortController: new AbortController(),
      executionPromise: null,
    });
    return clone(snapshot);
  }

  async approve(approval: ActionApproval): Promise<ActionSnapshot> {
    const record = this.requireRecord(approval.actionId);
    const { proposal } = record.snapshot;
    if (record.snapshot.state !== "AwaitingApproval") {
      throw new ActionRuntimeError("invalid_transition", "Action is not awaiting approval.");
    }
    if (
      approval.taskId !== proposal.taskId
      || approval.proposalDigest !== proposal.proposalDigest
    ) {
      throw new ActionRuntimeError("approval_mismatch", "Approval does not bind the exact action proposal.");
    }
    if (approval.generation !== record.expectedGeneration) {
      throw new ActionRuntimeError(
        "approval_generation_mismatch",
        "Approval generation is stale or unexpected.",
      );
    }
    this.assertApprovalNotExpired(approval);
    await this.hooks.beforeApprovalAccepted?.(clone(record.snapshot), approval);
    record.snapshot.approval = clone(approval);
    record.snapshot.state = transitionActionState(record.snapshot.state, "Approved");
    return clone(record.snapshot);
  }

  execute(actionId: string, decide: ActionDecisionProvider): Promise<ActionSnapshot> {
    const record = this.requireRecord(actionId);
    if (record.executionPromise) return record.executionPromise;
    record.executionPromise = this.executeOnce(record, decide);
    return record.executionPromise;
  }

  cancel(actionId: string): ActionSnapshot {
    const record = this.requireRecord(actionId);
    record.abortController.abort();
    if (["Proposed", "AwaitingApproval", "Approved", "Evaluating", "Allowed", "Starting"].includes(
      record.snapshot.state,
    )) {
      record.snapshot.state = transitionActionState(record.snapshot.state, "Cancelled");
    }
    return clone(record.snapshot);
  }

  get(actionId: string): ActionSnapshot | null {
    const record = this.records.get(actionId);
    return record ? clone(record.snapshot) : null;
  }

  private async executeOnce(
    record: ActionRecord,
    decide: ActionDecisionProvider,
  ): Promise<ActionSnapshot> {
    const snapshot = record.snapshot;
    const approval = snapshot.approval;
    if (snapshot.state !== "Approved" || !approval) {
      throw new ActionRuntimeError("invalid_transition", "Action must be approved before evaluation.");
    }
    this.assertApprovalValid(record, approval);
    if (record.abortController.signal.aborted) {
      snapshot.state = transitionActionState(snapshot.state, "Cancelled");
      return clone(snapshot);
    }
    const handler = this.registry.resolve(snapshot.proposal.actionType);
    if (!handler) {
      snapshot.state = transitionActionState(snapshot.state, "Evaluating");
      snapshot.decision = this.localDecision(snapshot.proposal, "unknown_action");
      snapshot.state = transitionActionState(snapshot.state, "DecisionError");
      return clone(snapshot);
    }

    snapshot.state = transitionActionState(snapshot.state, "Evaluating");
    await this.hooks.beforeDecisionRequest?.(clone(snapshot));
    let decision: ActionDecision;
    try {
      decision = await decide(snapshot.proposal, approval, record.abortController.signal);
    } catch {
      decision = this.localDecision(snapshot.proposal, "decision_provider_failed");
    }
    this.validateDecision(snapshot.proposal, decision);
    snapshot.decision = clone(decision);
    await this.hooks.afterDecisionReceived?.(clone(snapshot), decision);

    if (record.abortController.signal.aborted) {
      snapshot.state = transitionActionState(snapshot.state, "Cancelled");
      return clone(snapshot);
    }
    if (decision.decision !== "allow") {
      snapshot.state = transitionActionState(
        snapshot.state,
        decision.decision === "deny"
          ? "Denied"
          : decision.decision === "hold"
            ? "Held"
            : "DecisionError",
      );
      return clone(snapshot);
    }

    this.assertApprovalValid(record, approval);
    snapshot.state = transitionActionState(snapshot.state, "Allowed");
    snapshot.state = transitionActionState(snapshot.state, "Starting");
    const started: ActionStarted = {
      actionId: snapshot.proposal.actionId,
      approvalId: approval.approvalId,
      decisionId: decision.decisionId,
      executionReceiptId: this.idFactory("executionReceipt"),
      startedAt: this.clock().toISOString(),
    };
    if (snapshot.started) {
      throw new ActionRuntimeError("duplicate_dispatch", "Action already has an execution receipt.");
    }
    if (this.executionReceipts.has(started.executionReceiptId)) {
      throw new ActionRuntimeError(
        "duplicate_dispatch",
        "Execution receipt is already bound to another action.",
      );
    }
    await this.hooks.beforeDispatch?.(clone(snapshot), started).catch(() => {
      throw new ActionRuntimeError(
        "dispatch_barrier_failed",
        "Durable dispatch evidence could not be recorded.",
      );
    });
    this.assertApprovalValid(record, approval);
    if (record.abortController.signal.aborted) {
      snapshot.state = transitionActionState(snapshot.state, "Cancelled");
      return clone(snapshot);
    }
    this.executionReceipts.add(started.executionReceiptId);
    snapshot.started = started;
    snapshot.state = transitionActionState(snapshot.state, "Running");

    let outcome: ActionOutcome;
    try {
      const result = await handler({
        proposal: snapshot.proposal,
        approval,
        decision,
        signal: record.abortController.signal,
      });
      outcome = {
        actionId: snapshot.proposal.actionId,
        executionReceiptId: started.executionReceiptId,
        status: "completed",
        ...(result === undefined ? {} : { result }),
        settledAt: this.clock().toISOString(),
      };
    } catch (error) {
      const cancelled = record.abortController.signal.aborted || isAbortError(error);
      outcome = {
        actionId: snapshot.proposal.actionId,
        executionReceiptId: started.executionReceiptId,
        status: cancelled ? "cancelled" : "failed",
        error: {
          code: cancelled ? "handler_cancelled" : "handler_failed",
          message: cancelled
            ? "Action handler acknowledged cancellation."
            : "Action handler failed after dispatch.",
        },
        settledAt: this.clock().toISOString(),
      };
    }
    this.recordTerminalOutcome(outcome);
    snapshot.outcome = outcome;
    await this.hooks.afterSettlement?.(clone(snapshot), outcome);
    snapshot.state = transitionActionState(
      snapshot.state,
      outcome.status === "completed"
        ? "Completed"
        : outcome.status === "failed"
          ? "Failed"
          : outcome.status === "cancelled"
            ? "Cancelled"
            : "Interrupted",
    );
    return clone(snapshot);
  }

  private requireRecord(actionId: string): ActionRecord {
    const record = this.records.get(actionId);
    if (!record) throw new ActionRuntimeError("action_not_found", "Action does not exist.");
    return record;
  }

  private assertApprovalValid(record: ActionRecord, approval: ActionApproval): void {
    if (
      approval.proposalDigest !== record.snapshot.proposal.proposalDigest
      || approval.taskId !== record.snapshot.proposal.taskId
    ) {
      throw new ActionRuntimeError("approval_mismatch", "Approval no longer matches the proposal.");
    }
    if (approval.generation !== record.expectedGeneration) {
      throw new ActionRuntimeError("approval_generation_mismatch", "Approval generation is stale.");
    }
    this.assertApprovalNotExpired(approval);
  }

  private assertApprovalNotExpired(approval: ActionApproval): void {
    const expires = Date.parse(approval.expiresAt);
    if (Number.isNaN(expires) || expires <= this.clock().getTime()) {
      throw new ActionRuntimeError("approval_expired", "Approval has expired.");
    }
  }

  private validateDecision(proposal: ActionProposal, decision: ActionDecision): void {
    if (decision.actionId !== proposal.actionId) {
      throw new ActionRuntimeError("decision_mismatch", "Decision does not match the action.");
    }
    if (!["allow", "deny", "hold", "error"].includes(decision.decision)) {
      throw new ActionRuntimeError("decision_mismatch", "Decision value is unsupported.");
    }
  }

  private localDecision(proposal: ActionProposal, reasonCode: string): ActionDecision {
    return {
      decisionId: `local-${reasonCode}-${proposal.actionId}`,
      actionId: proposal.actionId,
      decision: "error",
      reasonCode,
      summary: "Action evaluation failed closed before dispatch.",
      policyVersion: "kerniq.action-runtime.v1",
      evidence: { source: "action-runtime", reasonCode },
      decidedAt: this.clock().toISOString(),
    };
  }

  private recordTerminalOutcome(outcome: ActionOutcome): void {
    if (this.terminalOutcomes.has(outcome.executionReceiptId)) {
      throw new ActionRuntimeError(
        "duplicate_terminal_outcome",
        "Execution receipt already has a terminal outcome.",
      );
    }
    this.terminalOutcomes.set(outcome.executionReceiptId, outcome);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
