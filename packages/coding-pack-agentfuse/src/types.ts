import type {
  CodingPackAgentFuseExportRequestIdentity,
  CodingPackOperationSnapshot,
  CodingPackStore,
} from "@qodex/coding-pack-store";

export type CodingPackAgentFuseDecision = "allow" | "deny" | "error";

export type CodingPackAgentFuseExportRequest =
  CodingPackAgentFuseExportRequestIdentity;

export interface CodingPackAgentFuseBridgeRequest {
  readonly protocolVersion: "kerniq.agentfuse.bridge.v1";
  readonly messageId: string;
  readonly messageType: "coding_pack_export_decision_request";
  readonly payload: {
    readonly request: CodingPackAgentFuseExportRequest;
    readonly requestDigest: string;
    readonly policyProfileId: "kerniq-coding-pack-export-v1";
    readonly expectedPolicyDigest: string;
  };
}

export interface CodingPackAgentFuseBridgeResponse {
  readonly protocolVersion: "kerniq.agentfuse.bridge.v1";
  readonly messageId: string;
  readonly messageType: "coding_pack_export_decision_result";
  readonly payload: {
    readonly decisionId: string;
    readonly operationId: string;
    readonly requestDigest: string;
    readonly decision: "allow" | "block";
    readonly reasonCode: string;
    readonly policyVersion: string;
    readonly schemaVersion: string;
    readonly agentFuseCommit: string;
    readonly policyProfileId: "kerniq-coding-pack-export-v1";
    readonly policyDigest: string;
    readonly decidedAt: string;
  };
}

export interface CodingPackAgentFuseBridgeClient {
  requestCodingPackExportDecision(
    request: CodingPackAgentFuseBridgeRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface CodingPackAgentFuseDecisionResult {
  readonly decisionId: string;
  readonly requestDigest: string;
  readonly proposalDigest: string;
  readonly approvalEvidenceDigest: string;
  readonly agentFuseSourceCommit: "ec4b5842339dccfba0db62df7541920759203bc9";
  readonly agentFusePackageVersion: "3.6.0";
  readonly bridgeProtocol: "kerniq.agentfuse.bridge.v1";
  readonly policyId: "kerniq-coding-pack-export-v1";
  readonly policyDigest: string;
  readonly decision: CodingPackAgentFuseDecision;
  readonly reasonCode: string;
  readonly evaluationStartedAt: string;
  readonly decidedAt: string;
}

export interface CodingPackAgentFuseAdapterOptions {
  readonly bridge: CodingPackAgentFuseBridgeClient;
  readonly messageIdFactory?: () => string;
  readonly clock?: () => Date;
}

export interface EvaluateCodingPackExportPolicyOptions {
  readonly store: CodingPackStore;
  readonly adapter: {
    evaluate(
      snapshot: CodingPackOperationSnapshot,
      signal: AbortSignal,
      evaluationStartedAt: string,
    ): Promise<CodingPackAgentFuseDecisionResult>;
  };
  readonly operationId: string;
  readonly destinationCapabilityVerifier: CodingPackDestinationCapabilityVerifier;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

export interface CodingPackDestinationCapabilityVerifier {
  verifyDestinationCapability(
    binding: CodingPackOperationSnapshot["destination"],
  ): Promise<boolean>;
}
