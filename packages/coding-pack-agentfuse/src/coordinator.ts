import { CodingPackStoreError } from "@qodex/coding-pack-store";
import type {
  CodingPackAgentFuseDecisionResult,
  EvaluateCodingPackExportPolicyOptions,
} from "./types.js";

export async function evaluateCodingPackExportPolicy(
  options: EvaluateCodingPackExportPolicyOptions,
): Promise<CodingPackAgentFuseDecisionResult> {
  const snapshot = await options.store.getCodingPackOperation(options.operationId);
  const now = (options.now ?? (() => new Date()))();
  if (
    !snapshot
    || snapshot.operation.state !== "confirmed"
    || !snapshot.approval
    || snapshot.decision
    || Date.parse(snapshot.proposal.expiresAt) <= now.getTime()
    || Date.parse(snapshot.approval.expiresAt) <= now.getTime()
    || !options.destinationCapabilityAvailable(snapshot)
  ) {
    throw new CodingPackStoreError(
      snapshot
      && (
        Date.parse(snapshot.proposal.expiresAt) <= now.getTime()
        || (snapshot.approval
          && Date.parse(snapshot.approval.expiresAt) <= now.getTime())
      )
        ? "coding_pack_proposal_expired"
        : "coding_pack_destination_unavailable",
    );
  }
  const decision = await options.adapter.evaluate(
    snapshot,
    options.signal ?? new AbortController().signal,
  );
  await options.store.recordCodingPackExportDecision({
    operationId: options.operationId,
    decision,
  });
  return decision;
}
