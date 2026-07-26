import { describe, expect, it } from "vitest";
import {
  InMemorySessionStore,
  SESSION_SCHEMA_VERSION,
  SessionRuntime,
  type PersistenceInfo,
  type SessionStore,
} from "../src/index.js";

function harness(store?: SessionStore) {
  let tick = 0;
  let id = 0;
  const runtime = new SessionRuntime(
    store ?? new InMemorySessionStore(),
    () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)),
    () => `id-${++id}`,
  );
  return runtime;
}

describe("universal session runtime", () => {
  it("creates an append-only ordered ledger and rejects duplicate or skipped entries", async () => {
    const store = new InMemorySessionStore();
    const runtime = harness(store);
    const session = await runtime.createSession({ title: "Ordering" });
    const first = await runtime.appendEntry(session.id, { type: "USER_MESSAGE", payload: { text: "hello" } });
    const second = await runtime.appendEntry(session.id, { type: "MODEL_MESSAGE", payload: { text: "hi" } });
    expect((await runtime.loadActivePath(session.id)).map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    await expect(store.appendEntry({ ...second, id: "duplicate", sequence: 9 }, {
      activeLeafId: "duplicate",
      status: "Active",
      updatedAt: second.createdAt,
      completedAt: null,
    })).rejects.toThrow("append-only");
    expect(first.parentEntryId).toBe(session.activeLeafId);
  });

  it("supports tree-compatible parents while projecting only the active leaf path", async () => {
    const runtime = harness();
    const session = await runtime.createSession({ title: "Tree" });
    const left = await runtime.appendEntry(session.id, { type: "USER_MESSAGE", payload: { text: "left" } });
    await runtime.appendEntry(session.id, { type: "MODEL_MESSAGE", payload: { text: "left reply" } });
    const right = await runtime.appendEntry(session.id, {
      parentEntryId: left.id,
      type: "USER_MESSAGE",
      payload: { text: "right" },
    });
    expect((await runtime.loadActivePath(session.id)).map((entry) => entry.id)).toEqual([
      session.activeLeafId,
      left.id,
      right.id,
    ]);
  });

  it("validates schemas and rejects unsupported future sessions", async () => {
    const store = new InMemorySessionStore();
    const runtime = harness(store);
    const session = await runtime.createSession({ title: "Schema" });
    const stored = await store.getSession(session.id);
    expect(stored?.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    if (!stored) throw new Error("missing fixture session");
    const future = { ...stored, id: "future", schemaVersion: SESSION_SCHEMA_VERSION + 1 };
    await expect(store.createSession(future, {
      ...(await store.listEntries(session.id))[0],
      id: "future-entry",
      sessionId: "future",
    })).rejects.toThrow("Unsupported session schema");
  });

  it("keeps deletion isolated to one local session", async () => {
    const runtime = harness();
    const first = await runtime.createSession({ title: "First" });
    const second = await runtime.createSession({ title: "Second" });
    await runtime.appendEntry(first.id, { type: "USER_MESSAGE", payload: { text: "first" } });
    await runtime.appendEntry(second.id, { type: "USER_MESSAGE", payload: { text: "second" } });
    expect(await runtime.deleteSession(first.id)).toBe(true);
    expect(await runtime.getSession(first.id)).toBeNull();
    expect(await runtime.getSession(second.id)).not.toBeNull();
    expect((await runtime.loadActivePath(second.id)).at(-1)?.payload).toEqual({ text: "second" });
  });

  it("supports future managed-Python metadata without persisting source or environment values", async () => {
    const runtime = harness();
    const session = await runtime.createSession({ title: "Python future" });
    await runtime.appendEntry(session.id, {
      type: "ACTION_PROPOSED",
      payload: { actionId: "py-action", label: "Generate report" },
      safeMetadata: {
        runtimeType: "python",
        scriptId: "report-builder",
        scriptVersion: "1",
        environmentId: "managed-default",
        pythonVersion: "3.13",
        dependencyLockDigest: "sha256:fixture",
        actionId: "py-action",
        approvalId: "approval-pending",
        executionReceiptId: "receipt-pending",
        artifactIds: ["artifact-1"],
        executionStatus: "proposed",
      },
    });
    const entry = (await runtime.loadActivePath(session.id)).at(-1)!;
    expect(entry.safeMetadata.runtimeType).toBe("python");
    const sanitized = await runtime.appendEntry(session.id, {
      type: "TOOL_COMPLETED",
      payload: { actionId: "py-action", environmentVariables: { SECRET: "value" } },
      safeMetadata: { actionId: "py-action" },
    });
    expect(sanitized.payload).toEqual({ actionId: "py-action" });
  });

  it("records non-coding actions and artifacts", async () => {
    const runtime = harness();
    const session = await runtime.createSession({ title: "Research" });
    await runtime.appendEntry(session.id, {
      type: "ACTION_PROPOSED",
      payload: { actionId: "research-1", capability: "research" },
      safeMetadata: { actionId: "research-1" },
    });
    await runtime.appendEntry(session.id, {
      type: "ACTION_APPROVED",
      payload: { actionId: "research-1" },
      safeMetadata: { actionId: "research-1", approvalId: "approval-1", approvalGeneration: 0 },
    });
    await runtime.appendEntry(session.id, {
      type: "ACTION_DECIDED",
      payload: { actionId: "research-1", decision: "allow" },
      safeMetadata: {
        actionId: "research-1",
        taskId: "task-1",
        approvalId: "approval-1",
        approvalGeneration: 0,
        decisionId: "decision-1",
        decision: "allow",
        policyVersion: "policy-1",
        decisionSchemaVersion: "schema-1",
        agentFuseCommit: "commit-1",
      },
    });
    await runtime.appendEntry(session.id, {
      type: "ACTION_STARTED",
      payload: { actionId: "research-1" },
      safeMetadata: {
        actionId: "research-1",
        approvalId: "approval-1",
        approvalGeneration: 0,
        decisionId: "decision-1",
        executionReceiptId: "receipt-1",
      },
    });
    await runtime.appendEntry(session.id, {
      type: "ARTIFACT_CREATED",
      payload: { artifactId: "artifact-1", mediaType: "text/markdown" },
    });
    await runtime.appendEntry(session.id, {
      type: "ACTION_COMPLETED",
      payload: { actionId: "research-1" },
      safeMetadata: {
        actionId: "research-1",
        approvalId: "approval-1",
        approvalGeneration: 0,
        executionReceiptId: "receipt-1",
      },
    });
    expect((await runtime.projectCurrentState(session.id)).artifactCount).toBe(1);
  });

  it("reports the selected adapter persistence honestly", async () => {
    const info: PersistenceInfo = {
      kind: "test",
      persistent: true,
      location: "fixture://sessions",
      schemaVersion: 2,
      message: "Deterministic test store",
    };
    const runtime = harness(new InMemorySessionStore(info));
    expect(await runtime.getPersistenceInfo()).toEqual(info);
  });
});
