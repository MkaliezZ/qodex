import type { ActionLifecycleHooks, ActionSnapshot } from "./types.js";

export interface ActionEvidenceEvent {
  type:
    | "approval.accepted"
    | "decision.requested"
    | "decision.received"
    | "dispatch.recorded"
    | "outcome.settled"
    | "outcome.interrupted";
  actionId: string;
  snapshot: ActionSnapshot;
}

export class InMemoryActionEvidenceStore {
  readonly events: ActionEvidenceEvent[] = [];

  hooks(): ActionLifecycleHooks {
    return {
      beforeApprovalAccepted: async (snapshot) => this.record("approval.accepted", snapshot),
      beforeDecisionRequest: async (snapshot) => this.record("decision.requested", snapshot),
      afterDecisionReceived: async (snapshot) => this.record("decision.received", snapshot),
      beforeDispatch: async (snapshot) => this.record("dispatch.recorded", snapshot),
      afterSettlement: async (snapshot) => this.record("outcome.settled", snapshot),
      afterSettlementPersistenceFailure: async (snapshot) => {
        this.record("outcome.interrupted", snapshot);
      },
    };
  }

  private record(type: ActionEvidenceEvent["type"], snapshot: ActionSnapshot): void {
    this.events.push({
      type,
      actionId: snapshot.proposal.actionId,
      snapshot: structuredClone(snapshot),
    });
  }
}
