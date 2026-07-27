import { describe, expect, it } from "vitest";
import {
  InMemorySessionStore,
  SessionRuntime,
  type SessionEntry,
  type SessionEventType,
  type SessionStatus,
} from "../src/index.js";

const COMMAND_PROPOSAL_DIGEST = `sha256:${"a".repeat(64)}`;

function runtime() {
  let index = 0;
  return new SessionRuntime(
    new InMemorySessionStore(),
    () => new Date(Date.UTC(2026, 1, 1, 0, 0, index++)),
    () => `entry-${++index}`,
  );
}

function commandProposalIdentity(actionId: string) {
  return {
    payload: { actionId, proposalDigest: COMMAND_PROPOSAL_DIGEST },
    safeMetadata: {
      actionId,
      taskId: "task-1",
      proposalDigest: COMMAND_PROPOSAL_DIGEST,
    },
  };
}

async function appendCommandAllow(
  instance: SessionRuntime,
  sessionId: string,
  actionId: string,
  approvalId: string,
  approvalGeneration: number,
  decisionId: string,
) {
  const decidedAt = "2026-02-01T00:01:00.000Z";
  await instance.appendEntry(sessionId, {
    type: "ACTION_DECIDED",
    payload: {
      actionId,
      proposalDigest: COMMAND_PROPOSAL_DIGEST,
      decision: "allow",
      reasonCode: "allow_fixture",
      summary: "Allow Project Command.",
      decidedAt,
      evidence: { fixture: decisionId },
    },
    safeMetadata: {
      actionId,
      taskId: "task-1",
      proposalDigest: COMMAND_PROPOSAL_DIGEST,
      approvalId,
      approvalGeneration,
      decisionId,
      decision: "allow",
      reasonCode: "allow_fixture",
      policyVersion: "dhms-agentfuse-runtime-guard@3.6.0",
      decisionSchemaVersion: "agentfuse-evidence-schema-v0.1",
      agentFuseCommit: "ec4b5842339dccfba0db62df7541920759203bc9",
      decidedAt,
    },
  });
}

async function pendingPatch() {
  const instance = runtime();
  const session = await instance.createSession({ title: "Patch recovery" });
  await instance.appendEntry(session.id, {
    type: "PATCH_PROPOSED",
    payload: {
      actionId: "patch-1",
      summary: "Change value",
      files: [{ path: "src/a.ts", oldContent: "old", newContent: "new" }],
    },
    safeMetadata: { actionId: "patch-1", runtimeStatus: "WaitingForPatchApproval" },
  });
  return { instance, session };
}

describe("session projection and restart recovery", () => {
  it("replays deterministically and projects terminal states", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Replay" });
    await instance.appendEntry(session.id, { type: "USER_MESSAGE", payload: { text: "hello" } });
    await instance.appendEntry(session.id, { type: "MODEL_MESSAGE", payload: { text: "done" } });
    await instance.appendEntry(session.id, { type: "SESSION_COMPLETED", payload: { reason: "done" } });
    const path = await instance.loadActivePath(session.id);
    expect(instance.projector.project(path)).toEqual(instance.projector.project(structuredClone(path)));
    expect((await instance.projectCurrentState(session.id)).status).toBe("Completed");
    await expect(instance.appendEntry(session.id, { type: "USER_MESSAGE", payload: { text: "late" } }))
      .rejects.toThrow("terminal session");
  });

  it("maps a pending patch to reapproval without calling providers or writing files", async () => {
    const { instance, session } = await pendingPatch();
    let providerCalls = 0;
    let writes = 0;
    const projection = await instance.recoverSession(session.id);
    expect(projection.status).toBe("RecoveryRequired");
    expect(projection.recoveryRequirement?.reason).toBe("patch_reapproval");
    expect(projection.pendingAction?.approved).toBe(false);
    expect(providerCalls).toBe(0);
    expect(writes).toBe(0);
  });

  it("maps a pending command to reapproval without starting a process", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Command recovery" });
    await instance.appendEntry(session.id, {
      type: "COMMAND_PROPOSED",
      payload: { actionId: "command-1", command: { id: "package-script:test" } },
      safeMetadata: { actionId: "command-1", toolCallId: "call-7", runtimeStatus: "WaitingForCommandApproval" },
    });
    let starts = 0;
    const projection = await instance.recoverSession(session.id);
    expect(projection.recoveryRequirement?.reason).toBe("command_reapproval");
    expect(projection.pendingAction?.recoveryRequired).toBe(true);
    expect(starts).toBe(0);
  });

  it.each([
    ["patch", "PATCH_PROPOSED", "PATCH_APPROVED", "PATCH_STARTED", "PATCH_APPLIED", "patch_reapproval"],
    ["command", "COMMAND_PROPOSED", "COMMAND_APPROVED", "COMMAND_STARTED", "COMMAND_COMPLETED", "command_reapproval"],
  ] as const)("invalidates an approved but not started %s and accepts only a fresh generation", async (
    kind,
    proposedType,
    approvedType,
    startedType,
    completedType,
    reason,
  ) => {
    const instance = runtime();
    const session = await instance.createSession({ title: `Approved ${kind}` });
    const actionId = `${kind}-approved`;
    await instance.appendEntry(session.id, {
      type: proposedType,
      ...(kind === "command"
        ? commandProposalIdentity(actionId)
        : { payload: { actionId }, safeMetadata: { actionId } }),
    });
    await instance.appendEntry(session.id, {
      type: approvedType,
      payload: { actionId },
      safeMetadata: { actionId, approvalId: "approval-before-restart", approvalGeneration: 0 },
    });

    const recovered = await instance.recoverSession(session.id);
    expect(recovered.status).toBe("RecoveryRequired");
    expect(recovered.recoveryRequirement?.reason).toBe(reason);
    expect(recovered.pendingAction?.approved).toBe(false);
    expect(recovered.pendingAction?.approvalId).toBeNull();
    expect(recovered.pendingAction?.approvalGeneration).toBe(1);

    const freshEvidence = {
      actionId,
      approvalId: "approval-after-restart",
      approvalGeneration: 1,
      executionReceiptId: "receipt-after-restart",
    };
    await instance.appendEntry(session.id, {
      type: approvedType,
      payload: { actionId },
      safeMetadata: freshEvidence,
    });
    if (kind === "command") {
      await appendCommandAllow(
        instance,
        session.id,
        actionId,
        freshEvidence.approvalId,
        freshEvidence.approvalGeneration,
        "decision-after-restart",
      );
    }
    await instance.appendEntry(session.id, {
      type: startedType,
      payload: { actionId },
      safeMetadata: {
        ...freshEvidence,
        ...(kind === "command"
          ? { decisionId: "decision-after-restart" }
          : {}),
      },
    });
    await instance.appendEntry(session.id, {
      type: completedType,
      payload: { actionId },
      safeMetadata: {
        ...freshEvidence,
        ...(kind === "command"
          ? { decisionId: "decision-after-restart" }
          : {}),
      },
    });
    expect((await instance.projectCurrentState(session.id)).pendingAction).toBeNull();
  });

  it.each([
    ["patch", "PATCH_PROPOSED", "PATCH_APPROVED", "PATCH_STARTED"],
    ["command", "COMMAND_PROPOSED", "COMMAND_APPROVED", "COMMAND_STARTED"],
  ] as const)("maps an unmatched started %s to Interrupted without reapproval", async (
    kind,
    proposedType,
    approvedType,
    startedType,
  ) => {
    const instance = runtime();
    const session = await instance.createSession({ title: `Started ${kind}` });
    const actionId = `${kind}-started`;
    await instance.appendEntry(session.id, {
      type: proposedType,
      ...(kind === "command"
        ? commandProposalIdentity(actionId)
        : { payload: { actionId }, safeMetadata: { actionId } }),
    });
    await instance.appendEntry(session.id, {
      type: approvedType,
      payload: { actionId },
      safeMetadata: { actionId, approvalId: "approval-started", approvalGeneration: 0 },
    });
    if (kind === "command") {
      await appendCommandAllow(
        instance,
        session.id,
        actionId,
        "approval-started",
        0,
        "decision-started",
      );
    }
    await instance.appendEntry(session.id, {
      type: startedType,
      payload: { actionId },
      safeMetadata: {
        actionId,
        approvalId: "approval-started",
        approvalGeneration: 0,
        ...(kind === "command" ? { decisionId: "decision-started" } : {}),
        executionReceiptId: "receipt-started",
      },
    });

    const projection = await instance.recoverSession(session.id);
    expect(projection.status).toBe("Interrupted");
    expect(projection.recoveryRequirement?.reason).toBe("interrupted");
    expect(projection.pendingAction?.started).toBe(true);
    expect(projection.pendingAction?.approved).toBe(false);
  });

  it.each(["CallingModel", "Streaming", "ExecutingReadTool", "ApplyingPatch", "RunningCommand", "ReturningToolResult", "Cancelling"])(
    "maps %s evidence to an honest interrupted state",
    async (runtimeStatus) => {
      const instance = runtime();
      const session = await instance.createSession({ title: runtimeStatus });
      await instance.appendEntry(session.id, {
        type: "AGENT_STATE_CHANGED",
        payload: { status: runtimeStatus },
        safeMetadata: { runtimeStatus, executionStatus: runtimeStatus === "RunningCommand" ? "running" : "active" },
      });
      const projection = await instance.recoverSession(session.id);
      expect(projection.status).toBe("Interrupted");
      expect(projection.recoveryRequirement?.executionStatus).toBe("unknown_or_interrupted");
    },
  );

  it.each([
    ["Done", "Completed"],
    ["Failed", "Failed"],
    ["Cancelled", "Cancelled"],
    ["LimitReached", "LimitReached"],
  ] as const)("maps %s evidence to %s when the terminal event was not flushed", async (runtimeStatus, expected) => {
    const instance = runtime();
    const session = await instance.createSession({ title: runtimeStatus });
    await instance.appendEntry(session.id, {
      type: "AGENT_STATE_CHANGED",
      payload: { status: runtimeStatus },
      safeMetadata: { runtimeStatus, executionStatus: "settled" },
    });

    expect((await instance.recoverSession(session.id)).status).toBe(expected);
  });

  it("invalidates the previous approval and requires a fresh approval ID", async () => {
    const { instance, session } = await pendingPatch();
    await instance.recoverSession(session.id);
    await instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "patch-1" },
      safeMetadata: {
        actionId: "patch-1",
        approvalId: "approval-after-restart",
        approvalGeneration: 1,
      },
    });
    const projection = await instance.projectCurrentState(session.id);
    expect(projection.pendingAction?.approved).toBe(true);
    expect(projection.recoveryRequirement).toBeNull();
  });

  it("fails safely on impossible approval transitions", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Impossible" });
    await expect(instance.appendEntry(session.id, {
      type: "PATCH_APPROVED",
      payload: { actionId: "missing" },
      safeMetadata: { actionId: "missing" },
    })).rejects.toThrow("no pending action");
  });

  it.each([
    ["command", "COMMAND_PROPOSED", "COMMAND_APPROVED", "COMMAND_STARTED", "SESSION_FAILED", "Failed"],
    ["patch", "PATCH_PROPOSED", "PATCH_APPROVED", "PATCH_STARTED", "SESSION_CANCELLED", "Cancelled"],
  ] as const)("repairs legacy %s started evidence masked by cached %s", async (
    kind,
    proposedType,
    approvedType,
    startedType,
    terminalType,
    terminalStatus,
  ) => {
    const store = new InMemorySessionStore();
    let id = 0;
    const instance = new SessionRuntime(
      store,
      () => new Date(Date.UTC(2026, 4, 1, 0, 0, id++)),
      () => `legacy-${++id}`,
    );
    const session = await instance.createSession({ title: `Legacy ${kind}` });
    const actionId = `${kind}-legacy-started`;
    const approvalId = `${kind}-legacy-approval`;
    const executionReceiptId = `${kind}-legacy-receipt`;
    await instance.appendEntry(session.id, {
      type: proposedType,
      ...(kind === "command"
        ? commandProposalIdentity(actionId)
        : { payload: { actionId }, safeMetadata: { actionId } }),
    });
    await instance.appendEntry(session.id, {
      type: approvedType,
      payload: { actionId },
      safeMetadata: { actionId, approvalId, approvalGeneration: 0 },
    });
    if (kind === "command") {
      await appendCommandAllow(
        instance,
        session.id,
        actionId,
        approvalId,
        0,
        "decision-legacy",
      );
    }
    await instance.appendEntry(session.id, {
      type: startedType,
      payload: { actionId },
      safeMetadata: {
        actionId,
        approvalId,
        approvalGeneration: 0,
        ...(kind === "command" ? { decisionId: "decision-legacy" } : {}),
        executionReceiptId,
      },
    });

    const started = (await instance.loadActivePath(session.id)).at(-1)!;
    const terminal: SessionEntry = {
      id: `legacy-terminal-${kind}`,
      sessionId: session.id,
      parentEntryId: started.id,
      sequence: started.sequence + 1,
      type: terminalType as SessionEventType,
      payloadVersion: 1,
      payload: { reason: "legacy terminal masking" },
      safeMetadata: {},
      createdAt: new Date(Date.UTC(2026, 4, 1, 0, 1, id++)).toISOString(),
    };
    await store.appendEntry(terminal, {
      activeLeafId: terminal.id,
      status: terminalStatus as SessionStatus,
      updatedAt: terminal.createdAt,
      completedAt: terminal.createdAt,
    });

    await expect(instance.projectCurrentState(session.id)).rejects.toThrow("cannot hide a started action");
    expect((await store.getSession(session.id))?.status).toBe(terminalStatus);

    const recovered = await instance.recoverSession(session.id);
    expect(recovered.status).toBe("Interrupted");
    expect(recovered.recoveryRequirement?.executionStatus).toBe("unknown_or_interrupted");
    expect(recovered.pendingAction?.started).toBe(true);
    expect(recovered.pendingAction?.approved).toBe(false);
    const activePath = await instance.loadActivePath(session.id);
    expect(activePath.at(-1)?.type).toBe("SESSION_INTERRUPTED");
    expect(activePath.some((entry) => entry.id === terminal.id)).toBe(false);
    expect((await store.listEntries(session.id)).some((entry) => entry.id === terminal.id)).toBe(true);
  });
});
