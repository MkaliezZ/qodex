import type {
  ActionApproval,
  ActionDecision,
  ActionProposal,
  JsonValue,
} from "@qodex/action-runtime";

export interface AgentFuseDecisionRequest {
  protocolVersion: "kerniq.agentfuse.bridge.v1";
  messageId: string;
  messageType: "decision_request";
  payload: {
    proposal: ActionProposal;
    approval: ActionApproval;
    policyFixtureId: string;
  };
}

export interface AgentFuseDecisionResponse {
  protocolVersion: "kerniq.agentfuse.bridge.v1";
  messageId: string;
  messageType: "decision_result";
  payload: {
    decisionId: string;
    actionId: string;
    decision: ActionDecision["decision"];
    reasonCode: string;
    summary: string;
    policyVersion: string;
    schemaVersion: string;
    agentFuseCommit: string;
    evidence: JsonValue;
    decidedAt: string;
  };
}

export interface AgentFuseBridgeClient {
  requestDecision(request: AgentFuseDecisionRequest, signal: AbortSignal): Promise<unknown>;
}

export interface AgentFuseAdapterOptions {
  bridge: AgentFuseBridgeClient;
  expectedAgentFuseCommit: string;
  expectedProtocolVersion: "kerniq.agentfuse.bridge.v1";
  expectedSchemaVersion: string;
  expectedPolicyVersion: string;
  policyFixtureId: string;
  messageIdFactory?: () => string;
  clock?: () => Date;
}
