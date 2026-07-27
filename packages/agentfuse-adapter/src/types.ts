import type {
  ActionApproval,
  ActionDecision,
  ActionProposal,
  JsonValue,
} from "@qodex/action-runtime";

export type AgentFusePolicySelection =
  | {
    policyFixtureId: string;
    policyProfileId?: never;
    expectedPolicyDigest?: never;
  }
  | {
    policyFixtureId?: never;
    policyProfileId: string;
    expectedPolicyDigest: string;
  };

export interface AgentFuseDecisionRequest {
  protocolVersion: "kerniq.agentfuse.bridge.v1";
  messageId: string;
  messageType: "decision_request";
  payload: {
    proposal: ActionProposal;
    approval: ActionApproval;
  } & AgentFusePolicySelection;
}

export interface AgentFuseDecisionResponse {
  protocolVersion: "kerniq.agentfuse.bridge.v1";
  messageId: string;
  messageType: "decision_result";
  payload: {
    decisionId: string;
    actionId: string;
    decision: ActionDecision["decision"] | "block";
    reasonCode: string;
    summary: string;
    policyVersion: string;
    schemaVersion: string;
    agentFuseCommit: string;
    policyProfileId?: string;
    policyDigest?: string;
    evidence: JsonValue;
    decidedAt: string;
  };
}

export interface AgentFuseBridgeClient {
  requestDecision(request: AgentFuseDecisionRequest, signal: AbortSignal): Promise<unknown>;
}

interface AgentFuseAdapterBaseOptions {
  bridge: AgentFuseBridgeClient;
  expectedAgentFuseCommit: string;
  expectedProtocolVersion: "kerniq.agentfuse.bridge.v1";
  expectedSchemaVersion: string;
  expectedPolicyVersion: string;
  messageIdFactory?: () => string;
  clock?: () => Date;
}

export type AgentFuseAdapterOptions = AgentFuseAdapterBaseOptions & AgentFusePolicySelection;
