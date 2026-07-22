import { describe, expect, it } from "vitest";
import type { AgentLoopTask } from "@qodex/agent-runtime";
import type { PatchProposal } from "@qodex/diff-engine";
import {
  discardedProposalNotice,
  getAgentPendingProposal,
  resolveProposalActionRoute,
  type ProposalOrigin,
} from "./proposalOwnership";

const proposal: PatchProposal = {
  id: "proposal-1",
  taskId: "task-1",
  summary: "Change one file",
  files: [{ path: "src/a.ts", oldContent: "a", newContent: "b" }],
  createdAt: new Date(0).toISOString(),
};

function task(status: AgentLoopTask["status"], pendingPatch: AgentLoopTask["pendingPatch"] = proposal): AgentLoopTask {
  return {
    id: "task-1",
    prompt: "test",
    status,
    output: "",
    error: null,
    limitReason: null,
    conversation: [],
    timeline: [],
    pendingPatch,
    pendingCommand: null,
    patchHistory: [],
    modelTurns: 1,
    totalToolCalls: 0,
    searchCalls: 0,
    readCalls: 0,
    commandCalls: 0,
    patchProposals: 1,
    startedAt: 0,
    updatedAt: 0,
  };
}

describe("desktop proposal ownership", () => {
  it("exposes an Agent proposal only while waiting for patch approval", () => {
    expect(getAgentPendingProposal(task("WaitingForPatchApproval"))).toEqual({
      proposal,
      origin: { mode: "agent", taskId: "task-1" },
    });
    for (const status of ["Cancelled", "Failed", "LimitReached", "Done"] as const) {
      expect(getAgentPendingProposal(task(status))).toEqual({ proposal: null, origin: null });
    }
  });

  it("routes a current Agent proposal only through AgentLoopRuntime", () => {
    const origin: ProposalOrigin = { mode: "agent", taskId: "task-1" };
    expect(resolveProposalActionRoute(proposal, origin, task("WaitingForPatchApproval"))).toBe("agent");
  });

  it("never routes a stale Agent proposal through the single-turn fallback", () => {
    const origin: ProposalOrigin = { mode: "agent", taskId: "task-1" };
    for (const status of ["Cancelled", "Failed", "LimitReached", "Done", "ApplyingPatch"] as const) {
      expect(resolveProposalActionRoute(proposal, origin, task(status, null))).toBeNull();
    }
    expect(resolveProposalActionRoute(proposal, origin, null)).toBeNull();
  });

  it("preserves the explicit single-turn route", () => {
    expect(resolveProposalActionRoute(
      proposal,
      { mode: "single_turn", taskId: "task-1" },
      null,
    )).toBe("single_turn");
  });

  it("provides truthful terminal disposal notices", () => {
    expect(discardedProposalNotice("Cancelled")).toContain("cancelled");
    expect(discardedProposalNotice("LimitReached")).toContain("expired");
    expect(discardedProposalNotice("Failed")).toContain("failed");
    expect(discardedProposalNotice("Done")).toBeNull();
  });
});
