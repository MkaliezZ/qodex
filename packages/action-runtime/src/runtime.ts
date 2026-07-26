import { ActionRuntimeError } from "./errors.js";
import { ActionHandlerRegistry } from "./registry.js";
import { transitionActionState } from "./state-machine.js";
import type {
  ActionApproval,
  ActionDecision,
  ActionDecisionProvider,
  ActionLifecycleFailure,
  ActionOutcome,
  ActionProposal,
  ActionRuntimeOptions,
  ActionSnapshot,
  ActionStarted,
} from "./types.js";
import {
  DEFAULT_ACTION_JSON_SIZE_LIMIT,
  validateActionApproval,
  validateActionDecision,
  validateActionOutcome,
  validateActionProposal,
  validateActionStarted,
} from "./validation.js";

interface ActionRecord {
  snapshot: ActionSnapshot;
  expectedGeneration: number;
  abortController: AbortController;
  executionPromise: Promise<ActionSnapshot> | null;
}

export class ActionRuntime {
  private readonly records = new Map<string, ActionRecord>();
  private readonly terminalOutcomes = new Map<string, ActionOutcome>();
  private readonly decisionIds = new Set<string>();
  private readonly executionReceipts = new Set<string>();
  private readonly hooks;
  private readonly clock;
  private readonly idFactory;
  private readonly evidenceSizeLimit;
  readonly registry = new ActionHandlerRegistry();

  constructor(options: ActionRuntimeOptions = {}) {
    this.hooks = options.hooks ?? {};
    this.clock = options.clock ?? (() => new Date());
    this.idFactory = options.idFactory
      ?? (() => `receipt-${globalThis.crypto.randomUUID()}`);
    this.evidenceSizeLimit = options.evidenceSizeLimit ?? DEFAULT_ACTION_JSON_SIZE_LIMIT;
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
    validateActionApproval(
      approval,
      proposal,
      record.expectedGeneration,
      this.clock(),
    );
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
      await this.failClosedDecision(record, this.localDecision(snapshot.proposal, "unknown_action"));
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
    try {
      validateActionDecision(decision, snapshot.proposal, this.evidenceSizeLimit);
      if (this.decisionIds.has(decision.decisionId)) {
        throw new ActionRuntimeError(
          "duplicate_decision",
          "Decision ID is already bound to another action.",
        );
      }
    } catch (error) {
      const reasonCode = error instanceof ActionRuntimeError
        ? error.code
        : "invalid_decision";
      await this.failClosedDecision(record, this.localDecision(snapshot.proposal, reasonCode));
      return clone(snapshot);
    }
    this.decisionIds.add(decision.decisionId);
    snapshot.decision = clone(decision);
    try {
      await this.hooks.afterDecisionReceived?.(clone(snapshot), decision);
    } catch {
      snapshot.decision = this.localDecision(snapshot.proposal, "decision_persistence_failed");
      snapshot.state = transitionActionState(snapshot.state, "DecisionError");
      return clone(snapshot);
    }

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
    validateActionStarted(started, snapshot.proposal, approval, decision, this.clock());
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

    let candidateOutcome: ActionOutcome;
    try {
      const result = await handler({
        proposal: snapshot.proposal,
        approval,
        decision,
        signal: record.abortController.signal,
      });
      candidateOutcome = {
        actionId: snapshot.proposal.actionId,
        executionReceiptId: started.executionReceiptId,
        status: "completed",
        ...(result === undefined ? {} : { result }),
        settledAt: this.clock().toISOString(),
      };
    } catch (error) {
      const cancelled = record.abortController.signal.aborted || isAbortError(error);
      candidateOutcome = {
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

    try {
      validateActionOutcome(
        candidateOutcome,
        snapshot.proposal,
        started,
        this.evidenceSizeLimit,
      );
      const settlementSnapshot = clone(snapshot);
      settlementSnapshot.outcome = clone(candidateOutcome);
      await this.hooks.afterSettlement?.(settlementSnapshot, candidateOutcome);
    } catch {
      return this.interruptAfterSettlementFailure(record, started);
    }

    this.recordTerminalOutcome(candidateOutcome);
    snapshot.outcome = candidateOutcome;
    snapshot.state = transitionActionState(
      snapshot.state,
      candidateOutcome.status === "completed"
        ? "Completed"
        : candidateOutcome.status === "failed"
          ? "Failed"
          : candidateOutcome.status === "cancelled"
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
    validateActionApproval(
      approval,
      record.snapshot.proposal,
      record.expectedGeneration,
      this.clock(),
    );
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

  private async failClosedDecision(
    record: ActionRecord,
    decision: ActionDecision,
  ): Promise<void> {
    validateActionDecision(decision, record.snapshot.proposal, this.evidenceSizeLimit);
    if (this.decisionIds.has(decision.decisionId)) {
      throw new ActionRuntimeError(
        "duplicate_decision",
        "Local fail-closed decision ID is already in use.",
      );
    }
    this.decisionIds.add(decision.decisionId);
    record.snapshot.decision = clone(decision);
    try {
      await this.hooks.afterDecisionReceived?.(clone(record.snapshot), decision);
    } catch {
      record.snapshot.decision = this.localDecision(
        record.snapshot.proposal,
        "decision_persistence_failed",
      );
    }
    record.snapshot.state = transitionActionState(record.snapshot.state, "DecisionError");
  }

  private async interruptAfterSettlementFailure(
    record: ActionRecord,
    started: ActionStarted,
  ): Promise<ActionSnapshot> {
    const failure: ActionLifecycleFailure = {
      code: "settlement_persistence_failed",
      message: "Durable settlement evidence could not be recorded.",
    };
    const uncertainOutcome: ActionOutcome = {
      actionId: record.snapshot.proposal.actionId,
      executionReceiptId: started.executionReceiptId,
      status: "unknown_or_interrupted",
      error: failure,
      settledAt: this.clock().toISOString(),
    };
    validateActionOutcome(
      uncertainOutcome,
      record.snapshot.proposal,
      started,
      this.evidenceSizeLimit,
    );
    this.recordTerminalOutcome(uncertainOutcome);
    record.snapshot.outcome = uncertainOutcome;
    record.snapshot.state = transitionActionState(record.snapshot.state, "Interrupted");
    try {
      await this.hooks.afterSettlementPersistenceFailure?.(
        clone(record.snapshot),
        uncertainOutcome,
        failure,
      );
    } catch {
      // The runtime state remains interrupted even when secondary evidence storage is unavailable.
    }
    return clone(record.snapshot);
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
