import { CodingPackStoreError } from "@qodex/coding-pack-store";
import type {
  CodingPackAgentFuseDecisionResult,
  EvaluateCodingPackExportPolicyOptions,
} from "./types.js";

const activeEvaluations = new Set<string>();

export async function evaluateCodingPackExportPolicy(
  options: EvaluateCodingPackExportPolicyOptions,
): Promise<CodingPackAgentFuseDecisionResult> {
  if (activeEvaluations.has(options.operationId)) {
    throw new CodingPackStoreError("coding_pack_decision_in_progress");
  }
  activeEvaluations.add(options.operationId);
  try {
    const snapshot = await options.store.getCodingPackOperation(options.operationId);
    const clock = options.now ?? (() => new Date());
    const preflightAt = clock();
    if (
      !snapshot
      || snapshot.operation.state !== "confirmed"
      || !snapshot.approval
      || snapshot.decision
      || Date.parse(snapshot.proposal.expiresAt) <= preflightAt.getTime()
      || Date.parse(snapshot.approval.expiresAt) <= preflightAt.getTime()
    ) {
      throw new CodingPackStoreError(
        snapshot
        && (
          Date.parse(snapshot.proposal.expiresAt) <= preflightAt.getTime()
          || (snapshot.approval
            && Date.parse(snapshot.approval.expiresAt) <= preflightAt.getTime())
        )
          ? "coding_pack_proposal_expired"
          : "coding_pack_destination_unavailable",
      );
    }
    if (!await options.destinationCapabilityVerifier.verifyDestinationCapability(
      snapshot.destination,
    )) {
      throw new CodingPackStoreError("coding_pack_destination_unavailable");
    }
    const evaluationStartedAt = clock();
    if (
      Date.parse(snapshot.proposal.expiresAt) <= evaluationStartedAt.getTime()
      || Date.parse(snapshot.approval.expiresAt) <= evaluationStartedAt.getTime()
    ) {
      throw new CodingPackStoreError("coding_pack_proposal_expired");
    }
    const decision = await options.adapter.evaluate(
      snapshot,
      options.signal ?? new AbortController().signal,
      evaluationStartedAt.toISOString(),
    );
    await options.store.recordCodingPackExportDecision({
      operationId: options.operationId,
      decision,
    });
    return decision;
  } finally {
    activeEvaluations.delete(options.operationId);
  }
}
