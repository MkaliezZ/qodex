import { describe, expect, it } from "vitest";
import { InMemorySessionStore, SessionRuntime, type SessionEventType } from "../src/index.js";

type ActionKind = "action" | "patch" | "command";

const EVENTS: Record<ActionKind, {
  proposed: SessionEventType;
  approved: SessionEventType;
  started: SessionEventType;
  completed: SessionEventType;
  denied: SessionEventType;
}> = {
  action: {
    proposed: "ACTION_PROPOSED",
    approved: "ACTION_APPROVED",
    started: "ACTION_STARTED",
    completed: "ACTION_COMPLETED",
    denied: "ACTION_DENIED",
  },
  patch: {
    proposed: "PATCH_PROPOSED",
    approved: "PATCH_APPROVED",
    started: "PATCH_STARTED",
    completed: "PATCH_APPLIED",
    denied: "PATCH_REJECTED",
  },
  command: {
    proposed: "COMMAND_PROPOSED",
    approved: "COMMAND_APPROVED",
    started: "COMMAND_STARTED",
    completed: "COMMAND_COMPLETED",
    denied: "COMMAND_DENIED",
  },
};

function runtime() {
  let id = 0;
  return new SessionRuntime(
    new InMemorySessionStore(),
    () => new Date(Date.UTC(2026, 3, 1, 0, 0, id++)),
    () => `integrity-${++id}`,
  );
}

async function propose(instance: SessionRuntime, sessionId: string, kind: ActionKind, actionId = `${kind}-1`) {
  await instance.appendEntry(sessionId, {
    type: EVENTS[kind].proposed,
    payload: { actionId },
    safeMetadata: { actionId },
  });
}

function evidence(actionId: string, suffix = "1") {
  return {
    actionId,
    approvalId: `approval-${suffix}`,
    approvalGeneration: 0,
    decisionId: `decision-${suffix}`,
    executionReceiptId: `receipt-${suffix}`,
  };
}

async function decideAllow(
  instance: SessionRuntime,
  sessionId: string,
  actionId: string,
  suffix = "1",
) {
  await instance.appendEntry(sessionId, {
    type: "ACTION_DECIDED",
    payload: { actionId, decision: "allow" },
    safeMetadata: {
      ...evidence(actionId, suffix),
      taskId: "task-1",
      decision: "allow",
      policyVersion: "dhms-agentfuse-runtime-guard@3.5.1",
      decisionSchemaVersion: "agentfuse-evidence-schema-v0.1",
      agentFuseCommit: "af08d80abaeb196da1e66d9e74c2d1c7002c9c2e",
    },
  });
}

describe("session lifecycle integrity", () => {
  it.each(["action", "patch", "command"] as const)(
    "accepts one complete %s lifecycle with explicit evidence",
    async (kind) => {
      const instance = runtime();
      const session = await instance.createSession({ title: `${kind} lifecycle` });
      const actionId = `${kind}-1`;
      await propose(instance, session.id, kind, actionId);
      await instance.appendEntry(session.id, {
        type: EVENTS[kind].approved,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      });
      if (kind === "action") await decideAllow(instance, session.id, actionId);
      await instance.appendEntry(session.id, {
        type: EVENTS[kind].started,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      });
      await instance.appendEntry(session.id, {
        type: EVENTS[kind].completed,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      });
      expect((await instance.projectCurrentState(session.id)).pendingAction).toBeNull();
    },
  );

  it("rejects approval without a proposal or without explicit approval evidence", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Approval invariant" });
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: { actionId: "patch-1", approvalId: "approval-1", approvalGeneration: 0 },
    })).rejects.toThrow("no pending action");
    await propose(instance, session.id, "patch", "patch-1");
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: { actionId: "patch-1", approvalId: "approval-1" },
    })).rejects.toThrow("approvalGeneration");
  });

  it("rejects start without approval and completion without started evidence", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Start invariant" });
    await propose(instance, session.id, "command", "command-1");
    await expect(instance.appendEntry(session.id, {
      type: "COMMAND_STARTED",
      payload: { actionId: "command-1" },
      safeMetadata: evidence("command-1"),
    })).rejects.toThrow("without approval");
    await instance.appendEntry(session.id, {
      type: "COMMAND_APPROVED",
      payload: { actionId: "command-1" },
      safeMetadata: evidence("command-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "COMMAND_COMPLETED",
      payload: { actionId: "command-1" },
      safeMetadata: evidence("command-1"),
    })).rejects.toThrow("started evidence");
  });

  it("requires a durable allow decision before a generic action can start", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Decision invariant" });
    await propose(instance, session.id, "action", "action-1");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_STARTED",
      payload: { actionId: "action-1", decision: "allow" },
      safeMetadata: evidence("action-1"),
    })).rejects.toThrow("prior allow decision");
    await decideAllow(instance, session.id, "action-1");
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_STARTED",
      payload: { actionId: "action-1" },
      safeMetadata: { ...evidence("action-1"), decisionId: "wrong-decision" },
    })).rejects.toThrow("different decision");
  });

  it("rejects a generic decision before approval", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Decision before approval" });
    await propose(instance, session.id, "action", "action-1");
    await expect(decideAllow(instance, session.id, "action-1"))
      .rejects.toThrow("without approval");
  });

  it.each(["deny", "hold", "error"] as const)(
    "records %s as a terminal decision without started evidence",
    async (decision) => {
      const instance = runtime();
      const session = await instance.createSession({ title: `${decision} decision` });
      const actionId = `action-${decision}`;
      await propose(instance, session.id, "action", actionId);
      await instance.appendEntry(session.id, {
        type: "ACTION_APPROVED",
        payload: { actionId },
        safeMetadata: evidence(actionId),
      });
      await instance.appendEntry(session.id, {
        type: "ACTION_DECIDED",
        payload: { actionId, decision },
        safeMetadata: {
          ...evidence(actionId),
          taskId: "task-1",
          decision,
          policyVersion: "dhms-agentfuse-runtime-guard@3.5.1",
          decisionSchemaVersion: "agentfuse-evidence-schema-v0.1",
          agentFuseCommit: "af08d80abaeb196da1e66d9e74c2d1c7002c9c2e",
        },
      });
      expect((await instance.projectCurrentState(session.id)).pendingAction).toBeNull();
      await expect(instance.appendEntry(session.id, {
        type: "ACTION_STARTED",
        payload: { actionId },
        safeMetadata: evidence(actionId),
      })).rejects.toThrow("no pending action");
    },
  );

  it("rejects malformed and reused decision evidence", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Decision identity" });
    await propose(instance, session.id, "action", "action-1");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_DECIDED",
      payload: { actionId: "action-1", decision: "allow" },
      safeMetadata: {
        ...evidence("action-1"),
        taskId: "task-1",
        decision: "allow",
        policyVersion: "",
        decisionSchemaVersion: "schema-1",
        agentFuseCommit: "commit-1",
      },
    })).rejects.toThrow("policyVersion");
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_DECIDED",
      payload: { actionId: "action-1", decision: "allow" },
      safeMetadata: {
        ...evidence("action-1"),
        taskId: "task-1",
        decisionId: "",
        decision: "allow",
        policyVersion: "policy-1",
        decisionSchemaVersion: "schema-1",
        agentFuseCommit: "commit-1",
      },
    })).rejects.toThrow("decisionId");
    await decideAllow(instance, session.id, "action-1");
    await instance.appendEntry(session.id, {
      type: "ACTION_STARTED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    });
    await instance.appendEntry(session.id, {
      type: "ACTION_COMPLETED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    });
    await propose(instance, session.id, "action", "action-2");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "action-2" },
      safeMetadata: evidence("action-2", "2"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_DECIDED",
      payload: { actionId: "action-2", decision: "allow" },
      safeMetadata: {
        ...evidence("action-2", "2"),
        taskId: "task-1",
        decisionId: "decision-1",
        decision: "allow",
        policyVersion: "policy-1",
        decisionSchemaVersion: "schema-1",
        agentFuseCommit: "commit-1",
      },
    })).rejects.toThrow("cannot be reused");
  });

  it("keeps legacy ACTION_DENIED ledgers readable", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Legacy denied" });
    await propose(instance, session.id, "action", "legacy-action");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "legacy-action" },
      safeMetadata: evidence("legacy-action"),
    });
    await instance.appendEntry(session.id, {
      type: "ACTION_DENIED",
      payload: { actionId: "legacy-action" },
      safeMetadata: { actionId: "legacy-action" },
    });
    expect((await instance.projectCurrentState(session.id)).pendingAction).toBeNull();
  });

  it("rejects generic settlement without matching started evidence", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Settlement before start" });
    await propose(instance, session.id, "action", "action-1");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    });
    await decideAllow(instance, session.id, "action-1");
    await expect(instance.appendEntry(session.id, {
      type: "ACTION_COMPLETED",
      payload: { actionId: "action-1" },
      safeMetadata: evidence("action-1"),
    })).rejects.toThrow("started evidence");
  });

  it.each(["action", "patch", "command"] as const)(
    "rejects %s completion without approval",
    async (kind) => {
      const instance = runtime();
      const session = await instance.createSession({ title: `${kind} completion invariant` });
      const actionId = `${kind}-unapproved`;
      await propose(instance, session.id, kind, actionId);
      await expect(instance.appendEntry(session.id, {
        type: EVENTS[kind].completed,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      })).rejects.toThrow("requires approval");
    },
  );

  it.each(["patch", "command"] as const)(
    "rejects approved %s completion without started evidence",
    async (kind) => {
      const instance = runtime();
      const session = await instance.createSession({ title: `${kind} start invariant` });
      const actionId = `${kind}-not-started`;
      await propose(instance, session.id, kind, actionId);
      await instance.appendEntry(session.id, {
        type: EVENTS[kind].approved,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      });
      await expect(instance.appendEntry(session.id, {
        type: EVENTS[kind].completed,
        payload: { actionId },
        safeMetadata: evidence(actionId),
      })).rejects.toThrow("started evidence");
    },
  );

  it("rejects duplicate approval, duplicate start, and duplicate completion", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Duplicate invariant" });
    await propose(instance, session.id, "patch", "patch-1");
    await instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: { ...evidence("patch-1"), approvalId: "approval-2" },
    })).rejects.toThrow("approved twice");
    await instance.appendEntry(session.id, {
      type: "PATCH_STARTED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_STARTED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    })).rejects.toThrow("start twice");
    await instance.appendEntry(session.id, {
      type: "PATCH_APPLIED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_APPLIED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    })).rejects.toThrow("no pending action");
  });

  it("rejects completion after denial, mismatched action IDs, and mismatched receipts", async () => {
    const instance = runtime();
    const denied = await instance.createSession({ title: "Denied invariant" });
    await propose(instance, denied.id, "patch", "patch-denied");
    await instance.appendEntry(denied.id, {
      type: "PATCH_REJECTED",
      payload: { actionId: "patch-denied" },
      safeMetadata: { actionId: "patch-denied" },
    });
    await expect(instance.appendEntry(denied.id, {
      type: "PATCH_APPLIED",
      payload: { actionId: "patch-denied" },
      safeMetadata: evidence("patch-denied"),
    })).rejects.toThrow("no pending action");
    await expect(instance.appendEntry(denied.id, {
      type: "PATCH_STARTED",
      payload: { actionId: "patch-denied" },
      safeMetadata: evidence("patch-denied"),
    })).rejects.toThrow("no pending action");

    const mismatch = await instance.createSession({ title: "Mismatch invariant" });
    await propose(instance, mismatch.id, "command", "command-1");
    await expect(instance.appendEntry(mismatch.id, {
      type: "COMMAND_APPROVED",
      payload: { actionId: "command-2" },
      safeMetadata: { ...evidence("command-2"), actionId: "command-2" },
    })).rejects.toThrow("different action");
    await instance.appendEntry(mismatch.id, {
      type: "COMMAND_APPROVED",
      payload: { actionId: "command-1" },
      safeMetadata: evidence("command-1"),
    });
    await instance.appendEntry(mismatch.id, {
      type: "COMMAND_STARTED",
      payload: { actionId: "command-1" },
      safeMetadata: evidence("command-1"),
    });
    await expect(instance.appendEntry(mismatch.id, {
      type: "COMMAND_COMPLETED",
      payload: { actionId: "command-1" },
      safeMetadata: { ...evidence("command-1"), executionReceiptId: "receipt-other" },
    })).rejects.toThrow("different execution receipt");
    await expect(instance.appendEntry(mismatch.id, {
      type: "ACTION_FAILED",
      payload: { actionId: "command-other" },
      safeMetadata: { ...evidence("command-other"), actionId: "command-other" },
    })).rejects.toThrow("different action");
  });

  it("never makes a started action reapprovable", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Started recovery invariant" });
    await propose(instance, session.id, "patch", "patch-1");
    await instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    });
    await instance.appendEntry(session.id, {
      type: "PATCH_STARTED",
      payload: { actionId: "patch-1" },
      safeMetadata: evidence("patch-1"),
    });
    await expect(instance.appendEntry(session.id, {
      type: "RECOVERY_REQUIRED",
      payload: { reason: "patch_reapproval" },
      safeMetadata: { approvalGeneration: 1 },
    })).rejects.toThrow("cannot become reapprovable");
  });

  it.each([
    ["patch", "SESSION_FAILED"],
    ["command", "SESSION_CANCELLED"],
    ["action", "SESSION_COMPLETED"],
    ["command", "SESSION_LIMIT_REACHED"],
  ] as const)("rejects %s started evidence masked by %s", async (kind, terminalType) => {
    const instance = runtime();
    const session = await instance.createSession({ title: `${kind} terminal masking` });
    const actionId = `${kind}-terminal-masking`;
    await propose(instance, session.id, kind, actionId);
    await instance.appendEntry(session.id, {
      type: EVENTS[kind].approved,
      payload: { actionId },
      safeMetadata: evidence(actionId),
    });
    if (kind === "action") await decideAllow(instance, session.id, actionId);
    await instance.appendEntry(session.id, {
      type: EVENTS[kind].started,
      payload: { actionId },
      safeMetadata: evidence(actionId),
    });
    await expect(instance.appendEntry(session.id, {
      type: terminalType,
      payload: { reason: "must not hide started evidence" },
    })).rejects.toThrow("cannot hide a started action");
  });

  it.each([
    ["patch", "PATCH_APPLIED", "SESSION_COMPLETED", "Completed"],
    ["command", "COMMAND_COMPLETED", "SESSION_COMPLETED", "Completed"],
    ["action", "ACTION_FAILED", "SESSION_FAILED", "Failed"],
  ] as const)("accepts a settled %s before %s", async (kind, settlementType, terminalType, expectedStatus) => {
    const instance = runtime();
    const session = await instance.createSession({ title: `${kind} settled terminal` });
    const actionId = `${kind}-settled-terminal`;
    await propose(instance, session.id, kind, actionId);
    await instance.appendEntry(session.id, {
      type: EVENTS[kind].approved,
      payload: { actionId },
      safeMetadata: evidence(actionId),
    });
    if (kind === "action") await decideAllow(instance, session.id, actionId);
    await instance.appendEntry(session.id, {
      type: EVENTS[kind].started,
      payload: { actionId },
      safeMetadata: evidence(actionId),
    });
    await instance.appendEntry(session.id, {
      type: settlementType,
      payload: { actionId },
      safeMetadata: evidence(actionId),
    });
    await instance.appendEntry(session.id, {
      type: terminalType,
      payload: { reason: "action settlement is durable" },
    });
    expect((await instance.projectCurrentState(session.id)).status).toBe(expectedStatus);
  });

  it("does not make an interrupted started action reapprovable", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Interrupted action" });
    await propose(instance, session.id, "action", "action-interrupted");
    await instance.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "action-interrupted" },
      safeMetadata: evidence("action-interrupted"),
    });
    await decideAllow(instance, session.id, "action-interrupted");
    await instance.appendEntry(session.id, {
      type: "ACTION_STARTED",
      payload: { actionId: "action-interrupted" },
      safeMetadata: evidence("action-interrupted"),
    });
    await instance.appendEntry(session.id, {
      type: "SESSION_INTERRUPTED",
      payload: { reason: "settlement_persistence_failed" },
      safeMetadata: {
        actionId: "action-interrupted",
        executionStatus: "unknown_or_interrupted",
      },
    });
    const projection = await instance.projectCurrentState(session.id);
    expect(projection.status).toBe("Interrupted");
    expect(projection.pendingAction).toMatchObject({
      actionId: "action-interrupted",
      started: true,
      recoveryRequired: false,
      approved: false,
    });
  });
});
