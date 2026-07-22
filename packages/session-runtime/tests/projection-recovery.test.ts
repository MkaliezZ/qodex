import { describe, expect, it } from "vitest";
import { InMemorySessionStore, SessionRuntime } from "../src/index.js";

function runtime() {
  let index = 0;
  return new SessionRuntime(
    new InMemorySessionStore(),
    () => new Date(Date.UTC(2026, 1, 1, 0, 0, index++)),
    () => `entry-${++index}`,
  );
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
      safeMetadata: { actionId: "patch-1", approvalId: "approval-after-restart" },
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
});
