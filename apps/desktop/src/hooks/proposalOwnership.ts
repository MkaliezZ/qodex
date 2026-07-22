import type { AgentLoopTask } from "@qodex/agent-runtime";
import type { PatchProposal } from "@qodex/diff-engine";

export type ProposalOrigin =
  | { mode: "single_turn"; taskId: string }
  | { mode: "agent"; taskId: string };

export type ProposalActionRoute = "single_turn" | "agent" | null;

export function getAgentPendingProposal(task: AgentLoopTask): {
  proposal: PatchProposal | null;
  origin: ProposalOrigin | null;
} {
  if (task.status !== "WaitingForPatchApproval" || !task.pendingPatch) {
    return { proposal: null, origin: null };
  }
  return {
    proposal: task.pendingPatch as PatchProposal,
    origin: { mode: "agent", taskId: task.id },
  };
}

export function resolveProposalActionRoute(
  proposal: PatchProposal | null,
  origin: ProposalOrigin | null,
  task: AgentLoopTask | null,
): ProposalActionRoute {
  if (!proposal || !origin || proposal.taskId !== origin.taskId) return null;
  if (origin.mode === "single_turn") return "single_turn";
  if (!task
    || task.id !== origin.taskId
    || task.status !== "WaitingForPatchApproval"
    || task.pendingPatch?.id !== proposal.id) {
    return null;
  }
  return "agent";
}

export function discardedProposalNotice(status: AgentLoopTask["status"]): string | null {
  if (status === "Cancelled") return "Proposal discarded because the Agent task was cancelled.";
  if (status === "LimitReached") return "Proposal expired before approval.";
  if (status === "Failed") return "Proposal discarded because the Agent task failed.";
  return null;
}
