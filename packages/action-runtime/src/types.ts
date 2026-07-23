export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ActionRisk = "read" | "write" | "process" | "network" | "external";

export interface ActionProposal {
  schemaVersion: "kerniq.action.v1";
  actionId: string;
  taskId: string;
  sessionId?: string;
  actionType: string;
  title: string;
  summary: string;
  risk: ActionRisk;
  parameters: JsonValue;
  requestedAt: string;
  proposalDigest: string;
}

export type ActionProposalInput = Omit<ActionProposal, "schemaVersion" | "proposalDigest">;

export interface ActionApproval {
  approvalId: string;
  actionId: string;
  taskId: string;
  proposalDigest: string;
  generation: number;
  approvedAt: string;
  expiresAt: string;
}

export interface ActionDecision {
  decisionId: string;
  actionId: string;
  decision: "allow" | "deny" | "hold" | "error";
  reasonCode: string;
  summary: string;
  policyVersion: string;
  evidence: JsonValue;
  decidedAt: string;
}

export interface ActionStarted {
  actionId: string;
  approvalId: string;
  decisionId: string;
  executionReceiptId: string;
  startedAt: string;
}

export interface ActionOutcome {
  actionId: string;
  executionReceiptId: string;
  status: "completed" | "failed" | "cancelled" | "unknown_or_interrupted";
  result?: JsonValue;
  error?: {
    code: string;
    message: string;
  };
  settledAt: string;
}

export type ActionState =
  | "Proposed"
  | "AwaitingApproval"
  | "Approved"
  | "Evaluating"
  | "Allowed"
  | "Denied"
  | "Held"
  | "DecisionError"
  | "Starting"
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Interrupted";

export interface ActionSnapshot {
  proposal: ActionProposal;
  state: ActionState;
  approval: ActionApproval | null;
  decision: ActionDecision | null;
  started: ActionStarted | null;
  outcome: ActionOutcome | null;
}

export interface ActionHandlerContext {
  proposal: ActionProposal;
  approval: ActionApproval;
  decision: ActionDecision;
  signal: AbortSignal;
}

export type ActionHandler = (context: ActionHandlerContext) => Promise<JsonValue | void>;
export type ActionDecisionProvider = (
  proposal: ActionProposal,
  approval: ActionApproval,
  signal: AbortSignal,
) => Promise<ActionDecision>;

export interface ActionLifecycleHooks {
  beforeApprovalAccepted?(snapshot: ActionSnapshot, approval: ActionApproval): Promise<void>;
  beforeDecisionRequest?(snapshot: ActionSnapshot): Promise<void>;
  afterDecisionReceived?(snapshot: ActionSnapshot, decision: ActionDecision): Promise<void>;
  beforeDispatch?(snapshot: ActionSnapshot, started: ActionStarted): Promise<void>;
  afterSettlement?(snapshot: ActionSnapshot, outcome: ActionOutcome): Promise<void>;
}

export interface ActionRuntimeOptions {
  hooks?: ActionLifecycleHooks;
  clock?: () => Date;
  idFactory?: (kind: "executionReceipt") => string;
}
