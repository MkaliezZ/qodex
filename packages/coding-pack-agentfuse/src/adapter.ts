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
const RESPONSE_KEYS = [
  "protocolVersion",
  "messageId",
  "messageType",
  "payload",
] as const;
const RESPONSE_PAYLOAD_KEYS = [
  "decisionId",
  "operationId",
  "requestDigest",
  "decision",
  "reasonCode",
  "policyVersion",
  "schemaVersion",
  "agentFuseCommit",
  "policyProfileId",
  "policyDigest",
  "decidedAt",
] as const;

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
    evaluationStartedAt: string,
  ): Promise<CodingPackAgentFuseDecisionResult> {
    const request = createCodingPackAgentFuseExportRequest(
      snapshot,
      new Date(evaluationStartedAt),
    );
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
      const late = Date.parse(response.payload.decidedAt)
        >= Math.min(
          Date.parse(snapshot.proposal.expiresAt),
          Date.parse(snapshot.approval?.expiresAt ?? snapshot.proposal.expiresAt),
        );
      return result({
        decisionId: response.payload.decisionId,
        requestDigest,
        proposalDigest: request.proposalDigest,
        approvalEvidenceDigest: request.approvalEvidenceDigest,
        decision: late
          ? "error"
          : response.payload.decision === "block" ? "deny" : "allow",
        reasonCode: late
          ? "decision_window_expired_during_evaluation"
          : response.payload.reasonCode,
        evaluationStartedAt,
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
        evaluationStartedAt,
        decidedAt: completionTimestamp(this.clock, evaluationStartedAt),
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
  const response = exactRecord(value, RESPONSE_KEYS);
  const payload = exactRecord(response.payload, RESPONSE_PAYLOAD_KEYS);
  if (
    response.protocolVersion !== AGENTFUSE_BRIDGE_PROTOCOL
    || response.messageId !== expected.messageId
    || response.messageType !== "coding_pack_export_decision_result"
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
  return response as unknown as CodingPackAgentFuseBridgeResponse;
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
    | "evaluationStartedAt"
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

function exactRecord<const Keys extends readonly string[]>(
  value: unknown,
  keys: Keys,
): { [Key in Keys[number]]: unknown } {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null)
  ) {
    invalidResponse();
  }
  const record = value as Record<string, unknown>;
  const expected = new Set<string>(keys);
  const actual = Object.keys(record);
  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    invalidResponse();
  }
  return record as { [Key in Keys[number]]: unknown };
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value.length > 0
    && new TextEncoder().encode(value).byteLength <= maximum
    && wellFormed(value)
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

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function completionTimestamp(clock: () => Date, evaluationStartedAt: string): string {
  const completed = clock();
  return completed.getTime() >= Date.parse(evaluationStartedAt)
    ? completed.toISOString()
    : evaluationStartedAt;
}

function invalidResponse(): never {
  throw new Error("invalid_bridge_response");
}
