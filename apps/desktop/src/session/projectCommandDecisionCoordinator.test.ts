import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
} from "@qodex/agentfuse-adapter";
import { PROJECT_COMMAND_POLICY } from "@qodex/agent-runtime";
import {
  InMemorySessionStore,
  SessionRecorder,
  SessionRuntime,
  type PendingActionProjection,
} from "@qodex/session-runtime";
import {
  AGENTFUSE_COMMIT,
  AGENTFUSE_POLICY,
  AGENTFUSE_SCHEMA,
} from "../platform/agentFuseIdentity";
import {
  createProjectCommandActionApproval,
  createProjectCommandActionProposal,
} from "./projectCommandActionMapping";
import {
  createProjectCommandAgentFuseAdapter,
  ProjectCommandApprovalExpiredDuringDecisionError,
  ProjectCommandDecisionCoordinator,
  ProjectCommandDecisionPersistenceError,
  ProjectCommandDecisionTimeError,
  ProjectCommandDurableApprovalError,
  SessionProjectCommandDecisionLedger,
} from "./projectCommandDecisionCoordinator";

const NOW = new Date("2026-07-27T00:00:00.000Z");
const EXPIRES_AT = "2026-07-27T00:10:00.000Z";
const PROJECT_POLICY_DIGEST =
  "sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad";

describe("ProjectCommandDecisionCoordinator", () => {
  it.each([
    ["allow", "allow", false],
    ["block", "deny", true],
  ] as const)(
    "persists one command-linked AgentFuse %s decision as KerniQ %s",
    async (coreDecision, expectedDecision, settled) => {
      const prepared = await prepare(coreDecision);
      const [first, duplicate] = await Promise.all([
        decide(prepared),
        decide(prepared),
      ]);
      const completedDuplicate = await decide(prepared);

      expect(first.decision).toBe(expectedDecision);
      expect(duplicate).toEqual(first);
      expect(completedDuplicate).toEqual(first);
      expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
      expect(prepared.recordDurably).toHaveBeenCalledTimes(1);

      const entries = await prepared.runtime.loadActivePath(prepared.sessionId);
      expect(entries.map(({ type }) => type)).toEqual([
        "SESSION_CREATED",
        "COMMAND_PROPOSED",
        "COMMAND_APPROVED",
        "ACTION_DECIDED",
      ]);
      expect(entries.at(-1)).toMatchObject({
        type: "ACTION_DECIDED",
        payload: {
          actionId: prepared.proposal.actionId,
          proposalDigest: prepared.proposal.proposalDigest,
          decision: expectedDecision,
          evidence: {
            agentFuseCommit: AGENTFUSE_COMMIT,
            schemaVersion: AGENTFUSE_SCHEMA,
            canonical: { boundary_decision: { decision: coreDecision } },
          },
        },
        safeMetadata: {
          actionId: prepared.proposal.actionId,
          taskId: prepared.proposal.taskId,
          approvalId: prepared.approval.approvalId,
          approvalGeneration: 0,
          proposalDigest: prepared.proposal.proposalDigest,
          decision: expectedDecision,
          policyVersion: AGENTFUSE_POLICY,
          decisionSchemaVersion: AGENTFUSE_SCHEMA,
          agentFuseCommit: AGENTFUSE_COMMIT,
        },
      });
      const projection = await prepared.runtime.projectCurrentState(prepared.sessionId);
      expect(projection.pendingAction === null).toBe(settled);
      if (!settled) {
        expect(projection.pendingAction).toMatchObject({
          kind: "command",
          decisionRecorded: true,
          decision: "allow",
          started: false,
        });
      }
      expect(entries.some(({ type }) => type === "COMMAND_STARTED")).toBe(false);
    },
  );

  it("requires durable COMMAND_APPROVED before requesting AgentFuse", async () => {
    const prepared = await prepare("allow", { recordApproval: false });

    await expect(decide(prepared)).rejects.toBeInstanceOf(
      ProjectCommandDurableApprovalError,
    );
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.recordDurably).not.toHaveBeenCalled();
  });

  it.each([
    ["actionId", (pending: PendingActionProjection) => ({
      ...pending,
      actionId: "another-action",
    })],
    ["taskId", (pending: PendingActionProjection) => ({
      ...pending,
      taskId: "another-task",
    })],
    ["proposalDigest", (pending: PendingActionProjection) => ({
      ...pending,
      proposalDigest: `sha256:${"c".repeat(64)}`,
    })],
    ["approvalId", (pending: PendingActionProjection) => ({
      ...pending,
      approvalId: "another-approval",
    })],
    ["approval generation", (pending: PendingActionProjection) => ({
      ...pending,
      approvalGeneration: 1,
    })],
    ["started state", (pending: PendingActionProjection) => ({
      ...pending,
      started: true,
    })],
    ["settled state", (pending: PendingActionProjection) => ({
      ...pending,
      settled: true,
    })],
    ["prior decision", (pending: PendingActionProjection) => ({
      ...pending,
      decisionRecorded: true,
    })],
  ] as const)(
    "rejects the wrong durable %s before requesting AgentFuse",
    async (_field, changePending) => {
      const prepared = await prepare("allow");
      prepared.coordinator = await coordinatorWithPending(
        prepared,
        changePending,
      );

      await expect(decide(prepared)).rejects.toBeInstanceOf(
        ProjectCommandDurableApprovalError,
      );
      expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
      expect(prepared.recordDurably).not.toHaveBeenCalled();
    },
  );

  it("rejects a durable approval from another Session", async () => {
    const prepared = await prepare("allow");
    const other = await proposalAndApproval({ sessionId: "session-2" });
    const coordinator = new ProjectCommandDecisionCoordinator({
      adapter: prepared.adapter,
      ledger: new SessionProjectCommandDecisionLedger(
        prepared.runtime,
        prepared.recorder,
      ),
      clock: () => NOW,
    });

    await expect(coordinator.decideAndPersist(
      other.proposal,
      other.approval,
      new AbortController().signal,
    )).rejects.toBeInstanceOf(ProjectCommandDurableApprovalError);
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.recordDurably).not.toHaveBeenCalled();
  });

  it("revalidates approval expiry after AgentFuse and discards allow", async () => {
    let trustedNow = NOW;
    const prepared = await prepare("allow", {
      clock: () => trustedNow,
      respond: async (response) => {
        trustedNow = new Date(EXPIRES_AT);
        return response;
      },
    });

    await expect(decide(prepared)).rejects.toBeInstanceOf(
      ProjectCommandApprovalExpiredDuringDecisionError,
    );
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.recordDurably).not.toHaveBeenCalled();
  });

  it.each([
    ["before approval", "2026-07-26T23:59:59.999Z"],
    ["at expiry", EXPIRES_AT],
    ["after expiry", "2026-07-27T00:10:00.001Z"],
  ])(
    "rejects a decision timestamp %s",
    async (_position, decidedAt) => {
      const prepared = await prepare("allow", {
        respond: async (response) => withDecidedAt(response, decidedAt),
      });

      await expect(decide(prepared)).rejects.toBeInstanceOf(
        ProjectCommandDecisionTimeError,
      );
      expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
      expect(prepared.recordDurably).not.toHaveBeenCalled();
    },
  );

  it("persists a decision timestamp inside the approval window once", async () => {
    const prepared = await prepare("allow", {
      respond: async (response) => withDecidedAt(
        response,
        "2026-07-27T00:05:00.000Z",
      ),
    });

    await expect(decide(prepared)).resolves.toMatchObject({ decision: "allow" });
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.recordDurably).toHaveBeenCalledTimes(1);
  });

  it("persists one fail-closed error decision when the bridge fails", async () => {
    const prepared = await prepare("allow", {
      respond: async () => {
        throw new Error("bridge process exited");
      },
    });
    const decision = await decide(prepared);

    expect(decision).toMatchObject({
      decision: "error",
      reasonCode: "bridge_process_exit",
    });
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(prepared.recordDurably).toHaveBeenCalledTimes(1);
    expect((await prepared.runtime.loadActivePath(prepared.sessionId)).at(-1))
      .toMatchObject({
        type: "ACTION_DECIDED",
        safeMetadata: {
          decision: "error",
          agentFuseCommit: AGENTFUSE_COMMIT,
          decisionSchemaVersion: AGENTFUSE_SCHEMA,
        },
      });
    expect((await prepared.runtime.projectCurrentState(prepared.sessionId)).pendingAction)
      .toBeNull();
  });

  it("does not cache an allow when durable persistence fails", async () => {
    const prepared = await prepare("allow");
    prepared.recordDurably.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(decide(prepared)).rejects.toBeInstanceOf(
      ProjectCommandDecisionPersistenceError,
    );
    await expect(decide(prepared)).resolves.toMatchObject({ decision: "allow" });
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(2);
    expect(prepared.recordDurably).toHaveBeenCalledTimes(2);
  });

  it("does not cache a cancelled operation as a completed decision", async () => {
    const controller = new AbortController();
    const prepared = await prepare("allow", {
      respond: async (response) => {
        controller.abort();
        return response;
      },
    });

    await expect(decide(prepared, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect(decide(prepared)).resolves.toMatchObject({ decision: "allow" });
    expect(prepared.bridge.requestDecision).toHaveBeenCalledTimes(2);
    expect(prepared.recordDurably).toHaveBeenCalledTimes(1);
  });

  it("does not request or persist a decision when already cancelled", async () => {
    const prepared = await prepare("allow");
    const controller = new AbortController();
    controller.abort();

    await expect(decide(prepared, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(prepared.bridge.requestDecision).not.toHaveBeenCalled();
    expect(prepared.recordDurably).not.toHaveBeenCalled();
  });

  it("contains no dispatch, native runner, Tauri, or command-start dependency", async () => {
    const source = await readFile(new URL(
      "./projectCommandDecisionCoordinator.ts",
      import.meta.url,
    ), "utf8");
    for (const forbidden of [
      "ActionRuntime",
      ".execute(",
      "ProjectCommandRunner",
      "run_project_command",
      "COMMAND_STARTED",
      "COMMAND_COMPLETED",
      "@tauri-apps",
      "invoke(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

interface PrepareOptions {
  respond?: (response: unknown) => Promise<unknown>;
  clock?: () => Date;
  recordApproval?: boolean;
}

async function prepare(
  coreDecision: "allow" | "block",
  options: PrepareOptions = {},
) {
  const prepared = await proposalAndApproval();
  const runtime = new SessionRuntime(
    new InMemorySessionStore(),
    () => NOW,
    sequenceIds("ledger"),
  );
  const session = await runtime.createSession({
    id: prepared.proposal.sessionId,
    title: "Project Command decision",
    createdAt: NOW.toISOString(),
  });
  await runtime.appendEntry(session.id, {
    type: "COMMAND_PROPOSED",
    payload: {
      actionId: prepared.proposal.actionId,
      commandId: "package:test",
      proposalDigest: prepared.proposal.proposalDigest,
    },
    safeMetadata: {
      actionId: prepared.proposal.actionId,
      taskId: prepared.proposal.taskId,
      proposalDigest: prepared.proposal.proposalDigest,
    },
  });
  if (options.recordApproval !== false) {
    await runtime.appendEntry(session.id, {
      type: "COMMAND_APPROVED",
      payload: { actionId: prepared.proposal.actionId },
      safeMetadata: {
        actionId: prepared.proposal.actionId,
        taskId: prepared.proposal.taskId,
        approvalId: prepared.approval.approvalId,
        approvalGeneration: 0,
      },
    });
  }
  const recorder = new SessionRecorder(runtime, session.id);
  const recordDurably = vi.spyOn(recorder, "recordDurably");
  const bridge = bridgeFor(
    prepared.proposal.actionId,
    coreDecision,
    options.respond,
  );
  const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
    messageIdFactory: sequenceIds("message"),
    clock: () => NOW,
  });
  const result = {
    ...prepared,
    runtime,
    sessionId: session.id,
    recorder,
    recordDurably,
    bridge,
    adapter,
    coordinator: new ProjectCommandDecisionCoordinator({
      adapter,
      ledger: new SessionProjectCommandDecisionLedger(runtime, recorder),
      clock: options.clock ?? (() => NOW),
    }),
  };
  return result;
}

async function coordinatorWithPending(
  prepared: Awaited<ReturnType<typeof prepare>>,
  changePending: (pending: PendingActionProjection) => PendingActionProjection,
): Promise<ProjectCommandDecisionCoordinator> {
  const projection = await prepared.runtime.projectCurrentState(prepared.sessionId);
  if (!projection.pendingAction) throw new Error("Test requires a pending command.");
  const projected = {
    ...projection,
    pendingAction: changePending({ ...projection.pendingAction }),
  };
  return new ProjectCommandDecisionCoordinator({
    adapter: prepared.adapter,
    ledger: new SessionProjectCommandDecisionLedger(
      { projectCurrentState: vi.fn(async () => projected) },
      prepared.recorder,
    ),
    clock: () => NOW,
  });
}

function decide(
  prepared: Awaited<ReturnType<typeof prepare>>,
  signal = new AbortController().signal,
) {
  return prepared.coordinator.decideAndPersist(
    prepared.proposal,
    prepared.approval,
    signal,
  );
}

async function proposalAndApproval(
  overrides: { sessionId?: string } = {},
) {
  const proposal = await createProjectCommandActionProposal({
    command: {
      id: "package:test",
      label: "Run tests",
      executable: "pnpm",
      args: ["test"],
      cwd: ".",
      source: "package.json",
      category: "test",
      catalogDigest: `sha256:${"a".repeat(64)}`,
      policy: PROJECT_COMMAND_POLICY,
    },
    toolCallId: "command-action-1",
    taskId: "task-1",
    sessionId: overrides.sessionId ?? "session-1",
    projectBindingId: "project-1",
    projectFingerprint: `sha256:${"b".repeat(64)}`,
    requestedAt: NOW.toISOString(),
  });
  const approval = await createProjectCommandActionApproval({
    proposal,
    approvalId: "approval-1",
    sessionApprovalGeneration: 0,
    approvedAt: NOW.toISOString(),
    expiresAt: EXPIRES_AT,
    now: NOW,
  });
  return { proposal, approval };
}

function bridgeFor(
  actionId: string,
  decision: "allow" | "block",
  transform: (response: unknown) => Promise<unknown> = async (response) => response,
): AgentFuseBridgeClient & { requestDecision: ReturnType<typeof vi.fn> } {
  return {
    requestDecision: vi.fn(async (request: AgentFuseDecisionRequest) => transform({
      protocolVersion: request.protocolVersion,
      messageId: request.messageId,
      messageType: "decision_result",
      payload: {
        decisionId: `decision-${decision}-${request.messageId}`,
        actionId,
        decision,
        reasonCode: decision === "allow" ? "allowed" : "policy_denied",
        summary: `Canonical AgentFuse returned ${decision}.`,
        policyVersion: AGENTFUSE_POLICY,
        schemaVersion: AGENTFUSE_SCHEMA,
        agentFuseCommit: AGENTFUSE_COMMIT,
        policyProfileId: "kerniq-project-command-v1",
        policyDigest: PROJECT_POLICY_DIGEST,
        evidence: {
          record_id: `record-${decision}-${request.messageId}`,
          boundary_decision: { decision },
        },
        decidedAt: NOW.toISOString(),
      },
    })),
  };
}

function withDecidedAt(response: unknown, decidedAt: string): unknown {
  const envelope = response as {
    payload: Record<string, unknown>;
  };
  return {
    ...envelope,
    payload: {
      ...envelope.payload,
      decidedAt,
    },
  };
}

function sequenceIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}
