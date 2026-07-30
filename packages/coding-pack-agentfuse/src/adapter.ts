import type { CodingPackOperationSnapshot } from "@qodex/coding-pack-store";
import {
  AGENTFUSE_BRIDGE_PROTOCOL,
  AGENTFUSE_EVIDENCE_SCHEMA,
  AGENTFUSE_PACKAGE_VERSION,
  AGENTFUSE_POLICY_VERSION,
  AGENTFUSE_SOURCE_COMMIT,
  CODING_PACK_EXPORT_POLICY_DIGEST,
  CODING_PACK_EXPORT_POLICY_ID,
  trustedCodingPackExportPolicyDigest,
} from "./policy.js";
import {
  createCodingPackAgentFuseExportRequest,
  createCodingPackAgentFuseRequestDigest,
} from "./request.js";
import type {
  CodingPackAgentFuseAdapterOptions,
  CodingPackAgentFuseBridgeRequest,
  CodingPackAgentFuseBridgeResponse,
  CodingPackAgentFuseDecisionResult,
} from "./types.js";

const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

export class CodingPackAgentFuseAdapter {
  private readonly messageIdFactory;
  private readonly clock;

  constructor(private readonly options: CodingPackAgentFuseAdapterOptions) {
    this.messageIdFactory = options.messageIdFactory
      ?? (() => `coding-pack-agentfuse-${globalThis.crypto.randomUUID()}`);
    this.clock = options.clock ?? (() => new Date());
  }

  async evaluate(
    snapshot: CodingPackOperationSnapshot,
    signal: AbortSignal,
  ): Promise<CodingPackAgentFuseDecisionResult> {
    const request = createCodingPackAgentFuseExportRequest(snapshot, this.clock());
    const requestDigest = await createCodingPackAgentFuseRequestDigest(request);
    const policyDigest = await trustedCodingPackExportPolicyDigest();
    const messageId = this.messageIdFactory();
    const bridgeRequest: CodingPackAgentFuseBridgeRequest = {
      protocolVersion: AGENTFUSE_BRIDGE_PROTOCOL,
      messageId,
      messageType: "coding_pack_export_decision_request",
      payload: {
        request,
        requestDigest,
        policyProfileId: CODING_PACK_EXPORT_POLICY_ID,
        expectedPolicyDigest: policyDigest,
      },
    };
    try {
      const raw = await this.options.bridge.requestCodingPackExportDecision(
        bridgeRequest,
        signal,
      );
      const response = validateResponse(raw, {
        messageId,
        operationId: request.operationId,
        requestDigest,
      });
      return result({
        decisionId: response.payload.decisionId,
        requestDigest,
        proposalDigest: request.proposalDigest,
        approvalEvidenceDigest: request.approvalEvidenceDigest,
        decision: response.payload.decision === "block" ? "deny" : "allow",
        reasonCode: response.payload.reasonCode,
        decidedAt: response.payload.decidedAt,
      });
    } catch (error) {
      const reasonCode = classifyFailure(error);
      return result({
        decisionId: `decision-${requestDigest.slice(7, 31)}-${reasonCode}`,
        requestDigest,
        proposalDigest: request.proposalDigest,
        approvalEvidenceDigest: request.approvalEvidenceDigest,
        decision: "error",
        reasonCode,
        decidedAt: this.clock().toISOString(),
      });
    }
  }
}

function validateResponse(
  value: unknown,
  expected: {
    readonly messageId: string;
    readonly operationId: string;
    readonly requestDigest: string;
  },
): CodingPackAgentFuseBridgeResponse {
  if (!isRecord(value) || !isRecord(value.payload)) invalidResponse();
  const payload = value.payload;
  if (
    value.protocolVersion !== AGENTFUSE_BRIDGE_PROTOCOL
    || value.messageId !== expected.messageId
    || value.messageType !== "coding_pack_export_decision_result"
    || !boundedText(payload.decisionId, 256)
    || payload.operationId !== expected.operationId
    || payload.requestDigest !== expected.requestDigest
    || (payload.decision !== "allow" && payload.decision !== "block")
    || !reasonCode(payload.reasonCode)
    || payload.policyVersion !== AGENTFUSE_POLICY_VERSION
    || payload.schemaVersion !== AGENTFUSE_EVIDENCE_SCHEMA
    || payload.agentFuseCommit !== AGENTFUSE_SOURCE_COMMIT
    || payload.policyProfileId !== CODING_PACK_EXPORT_POLICY_ID
    || payload.policyDigest !== CODING_PACK_EXPORT_POLICY_DIGEST
    || !canonicalTimestamp(payload.decidedAt)
  ) {
    invalidResponse();
  }
  return value as unknown as CodingPackAgentFuseBridgeResponse;
}

function result(
  value: Pick<
    CodingPackAgentFuseDecisionResult,
    | "decisionId"
    | "requestDigest"
    | "proposalDigest"
    | "approvalEvidenceDigest"
    | "decision"
    | "reasonCode"
    | "decidedAt"
  >,
): CodingPackAgentFuseDecisionResult {
  return Object.freeze({
    ...value,
    agentFuseSourceCommit: AGENTFUSE_SOURCE_COMMIT,
    agentFusePackageVersion: AGENTFUSE_PACKAGE_VERSION,
    bridgeProtocol: AGENTFUSE_BRIDGE_PROTOCOL,
    policyId: CODING_PACK_EXPORT_POLICY_ID,
    policyDigest: CODING_PACK_EXPORT_POLICY_DIGEST,
  });
}

function classifyFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "request_cancelled";
  }
  if (error instanceof Error) {
    if (error.message.includes("timeout")) return "bridge_timeout";
    if (error.message.includes("process")) return "bridge_process_exit";
    if (error.message.includes("protocol")) return "bridge_protocol_mismatch";
    if (error.message.includes("policy")) return "policy_identity_mismatch";
  }
  return "invalid_bridge_response";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && new TextEncoder().encode(value).byteLength <= maximum
    && !/\p{Cc}/u.test(value);
}

function reasonCode(value: unknown): value is string {
  return typeof value === "string" && REASON_CODE_PATTERN.test(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function invalidResponse(): never {
  throw new Error("invalid_bridge_response");
}
