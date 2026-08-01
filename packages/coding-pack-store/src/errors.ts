export type CodingPackStoreErrorCode =
  | "coding_pack_store_unavailable"
  | "coding_pack_proposal_invalid"
  | "coding_pack_proposal_expired"
  | "coding_pack_approval_mismatch"
  | "coding_pack_destination_unavailable"
  | "coding_pack_decision_in_progress"
  | "coding_pack_persistence_failed";

const ERROR_MESSAGES: Record<CodingPackStoreErrorCode, string> = {
  coding_pack_store_unavailable: "The local Coding Pack store is unavailable.",
  coding_pack_proposal_invalid: "The Coding Pack export proposal is invalid.",
  coding_pack_proposal_expired: "The Coding Pack export proposal has expired.",
  coding_pack_approval_mismatch: "The export approval does not match this exact proposal.",
  coding_pack_destination_unavailable: "The selected export destination is unavailable.",
  coding_pack_decision_in_progress: "This Coding Pack export policy is already being evaluated.",
  coding_pack_persistence_failed: "The Coding Pack lifecycle update could not be persisted.",
};

export class CodingPackStoreError extends Error {
  constructor(readonly code: CodingPackStoreErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CodingPackStoreError";
  }
}
