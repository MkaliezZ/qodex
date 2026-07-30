import {
  createCodingPackAgentFuseExportRequestIdentity,
  createCodingPackAgentFuseRequestDigest as createStoreRequestDigest,
  validateCodingPackAgentFuseExportRequestIdentity,
  type CodingPackOperationSnapshot,
} from "@qodex/coding-pack-store";
import type { CodingPackAgentFuseExportRequest } from "./types.js";

export function createCodingPackAgentFuseExportRequest(
  snapshot: CodingPackOperationSnapshot,
  now: Date = new Date(),
): CodingPackAgentFuseExportRequest {
  const confirmedEvent = snapshot.events[1];
  if (
    snapshot.operation.state !== "confirmed"
    || snapshot.operation.lastEventSequence !== 2
    || !snapshot.approval
    || snapshot.decision
    || !confirmedEvent
    || confirmedEvent.eventType !== "PACK_CONFIRMED"
    || confirmedEvent.payloadDigest.length !== 71
    || Date.parse(snapshot.proposal.expiresAt) <= now.getTime()
    || Date.parse(snapshot.approval.expiresAt) <= now.getTime()
    || snapshot.approval.proposalDigest !== snapshot.proposal.proposalDigest
    || snapshot.destination.destinationBindingId
      !== snapshot.proposal.destinationBindingId
    || snapshot.destination.destinationFingerprint
      !== snapshot.proposal.destinationFingerprint
  ) {
    throw new TypeError("Coding Pack export decision preconditions are not satisfied.");
  }
  return createCodingPackAgentFuseExportRequestIdentity(
    snapshot.proposal,
    confirmedEvent.payloadDigest,
  );
}

export function validateCodingPackAgentFuseExportRequest(
  value: unknown,
): CodingPackAgentFuseExportRequest {
  try {
    return validateCodingPackAgentFuseExportRequestIdentity(value);
  } catch {
    throw new TypeError("The Coding Pack AgentFuse export request is invalid.");
  }
}

export async function createCodingPackAgentFuseRequestDigest(
  request: CodingPackAgentFuseExportRequest,
): Promise<string> {
  return createStoreRequestDigest(request);
}
