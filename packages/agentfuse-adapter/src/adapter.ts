import type {
  ActionApproval,
  ActionDecision,
  ActionDecisionProvider,
  ActionProposal,
  JsonValue,
} from "@qodex/action-runtime";
import type {
  AgentFuseAdapterOptions,
  AgentFuseDecisionRequest,
  AgentFuseDecisionResponse,
} from "./types.js";

export class AgentFuseAdapter {
  private readonly seenResponseIds = new Set<string>();
  private readonly messageIdFactory;
  private readonly clock;

  constructor(private readonly options: AgentFuseAdapterOptions) {
    this.messageIdFactory = options.messageIdFactory
      ?? (() => `agentfuse-${globalThis.crypto.randomUUID()}`);
    this.clock = options.clock ?? (() => new Date());
  }

  readonly decide: ActionDecisionProvider = async (
    proposal,
    approval,
    signal,
  ): Promise<ActionDecision> => {
    const messageId = this.messageIdFactory();
    const request = mapActionProposalToDecisionRequest(
      proposal,
      approval,
      this.options.policyFixtureId,
      messageId,
    );
    try {
      const raw = await this.options.bridge.requestDecision(request, signal);
      const response = validateDecisionResponse(raw, {
        messageId,
        actionId: proposal.actionId,
        expectedAgentFuseCommit: this.options.expectedAgentFuseCommit,
        expectedProtocolVersion: this.options.expectedProtocolVersion,
        expectedSchemaVersion: this.options.expectedSchemaVersion,
        expectedPolicyVersion: this.options.expectedPolicyVersion,
      });
      if (this.seenResponseIds.has(response.payload.decisionId)) {
        return this.errorDecision(proposal, "duplicate_response");
      }
      this.seenResponseIds.add(response.payload.decisionId);
      return {
        decisionId: response.payload.decisionId,
        actionId: response.payload.actionId,
        decision: response.payload.decision,
        reasonCode: response.payload.reasonCode,
        summary: response.payload.summary,
        policyVersion: response.payload.policyVersion,
        evidence: {
          agentFuseCommit: response.payload.agentFuseCommit,
          schemaVersion: response.payload.schemaVersion,
          canonical: response.payload.evidence,
        },
        decidedAt: response.payload.decidedAt,
      };
    } catch (error) {
      return this.errorDecision(proposal, classifyAdapterFailure(error));
    }
  };

  private errorDecision(proposal: ActionProposal, reasonCode: string): ActionDecision {
    return {
      decisionId: `adapter-error-${proposal.actionId}-${reasonCode}`,
      actionId: proposal.actionId,
      decision: "error",
      reasonCode,
      summary: "Canonical AgentFuse decision was unavailable or invalid; dispatch is blocked.",
      policyVersion: this.options.expectedPolicyVersion,
      evidence: {
        adapter: "@qodex/agentfuse-adapter",
        expectedAgentFuseCommit: this.options.expectedAgentFuseCommit,
        reasonCode,
      },
      decidedAt: this.clock().toISOString(),
    };
  }
}

export function mapActionProposalToDecisionRequest(
  proposal: ActionProposal,
  approval: ActionApproval,
  policyFixtureId: string,
  messageId: string,
): AgentFuseDecisionRequest {
  return {
    protocolVersion: "kerniq.agentfuse.bridge.v1",
    messageId,
    messageType: "decision_request",
    payload: {
      proposal: structuredClone(proposal),
      approval: structuredClone(approval),
      policyFixtureId,
    },
  };
}

interface ResponseExpectation {
  messageId: string;
  actionId: string;
  expectedAgentFuseCommit: string;
  expectedProtocolVersion: string;
  expectedSchemaVersion: string;
  expectedPolicyVersion: string;
}

export function validateDecisionResponse(
  raw: unknown,
  expected: ResponseExpectation,
): AgentFuseDecisionResponse {
  if (!isRecord(raw) || !isRecord(raw.payload)) throw new Error("malformed_json");
  if (
    raw.protocolVersion !== expected.expectedProtocolVersion
    || raw.messageId !== expected.messageId
    || raw.messageType !== "decision_result"
  ) {
    throw new Error("protocol_or_message_mismatch");
  }
  const payload = raw.payload;
  if (
    !text(payload.decisionId)
    || payload.actionId !== expected.actionId
    || !["allow", "deny", "hold", "error"].includes(String(payload.decision))
    || !text(payload.reasonCode)
    || !text(payload.summary)
    || payload.policyVersion !== expected.expectedPolicyVersion
    || payload.schemaVersion !== expected.expectedSchemaVersion
    || payload.agentFuseCommit !== expected.expectedAgentFuseCommit
    || !isJsonValue(payload.evidence)
    || !text(payload.decidedAt)
    || Number.isNaN(Date.parse(payload.decidedAt))
  ) {
    throw new Error("invalid_decision_response");
  }
  return raw as unknown as AgentFuseDecisionResponse;
}

function classifyAdapterFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "request_cancelled";
  if (error instanceof Error) {
    if (error.message.includes("timeout")) return "bridge_timeout";
    if (error.message.includes("process")) return "bridge_process_exit";
    if (error.message.includes("size")) return "oversized_response";
    if (error.message.includes("revision")) return "agentfuse_revision_mismatch";
    if (error.message.includes("protocol")) return "bridge_protocol_mismatch";
  }
  return "invalid_bridge_response";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
