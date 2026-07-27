import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
} from "@qodex/agentfuse-adapter";
import {
  PROJECT_COMMAND_POLICY,
} from "@qodex/agent-runtime";
import {
  InMemorySessionStore,
  SessionRecorder,
  SessionRuntime,
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
  ProjectCommandDecisionCoordinator,
  ProjectCommandDecisionPersistenceError,
  type DurableProjectCommandDecisionRecorder,
} from "./projectCommandDecisionCoordinator";

const NOW = new Date("2026-07-27T00:00:00.000Z");
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
        prepared.coordinator.decideAndPersist(
          prepared.proposal,
          prepared.approval,
          new AbortController().signal,
        ),
        prepared.coordinator.decideAndPersist(
          prepared.proposal,
          prepared.approval,
          new AbortController().signal,
        ),
      ]);
      expect(first.decision).toBe(expectedDecision);
      expect(duplicate).toEqual(first);
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

  it("persists one fail-closed error decision when the bridge fails", async () => {
    const prepared = await prepare("allow", async () => {
      throw new Error("bridge process exited");
    });
    const decision = await prepared.coordinator.decideAndPersist(
      prepared.proposal,
      prepared.approval,
      new AbortController().signal,
    );
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

  it("fails closed when durable decision persistence fails", async () => {
    const prepared = await proposalAndApproval();
    const bridge = bridgeFor(prepared.proposal.actionId, "allow");
    const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
      messageIdFactory: () => "message-1",
      clock: () => NOW,
    });
    const recorder: DurableProjectCommandDecisionRecorder = {
      recordDurably: vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
    };
    const coordinator = new ProjectCommandDecisionCoordinator({
      adapter,
      recorder,
      clock: () => NOW,
    });
    await expect(coordinator.decideAndPersist(
      prepared.proposal,
      prepared.approval,
      new AbortController().signal,
    )).rejects.toBeInstanceOf(ProjectCommandDecisionPersistenceError);
    expect(bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(recorder.recordDurably).toHaveBeenCalledTimes(1);
  });

  it("does not request or persist a decision when already cancelled", async () => {
    const prepared = await proposalAndApproval();
    const bridge = bridgeFor(prepared.proposal.actionId, "allow");
    const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
      messageIdFactory: () => "message-1",
      clock: () => NOW,
    });
    const recorder: DurableProjectCommandDecisionRecorder = {
      recordDurably: vi.fn(async () => {}),
    };
    const coordinator = new ProjectCommandDecisionCoordinator({
      adapter,
      recorder,
      clock: () => NOW,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(coordinator.decideAndPersist(
      prepared.proposal,
      prepared.approval,
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(bridge.requestDecision).not.toHaveBeenCalled();
    expect(recorder.recordDurably).not.toHaveBeenCalled();
  });

  it("fails closed when cancelled after decision but before persistence", async () => {
    const prepared = await proposalAndApproval();
    const controller = new AbortController();
    const bridge = bridgeFor(prepared.proposal.actionId, "allow", async (response) => {
      controller.abort();
      return response;
    });
    const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
      messageIdFactory: () => "message-1",
      clock: () => NOW,
    });
    const recorder: DurableProjectCommandDecisionRecorder = {
      recordDurably: vi.fn(async () => {}),
    };
    const coordinator = new ProjectCommandDecisionCoordinator({
      adapter,
      recorder,
      clock: () => NOW,
    });
    await expect(coordinator.decideAndPersist(
      prepared.proposal,
      prepared.approval,
      controller.signal,
    )).rejects.toMatchObject({ name: "AbortError" });
    expect(bridge.requestDecision).toHaveBeenCalledTimes(1);
    expect(recorder.recordDurably).not.toHaveBeenCalled();
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

async function prepare(
  coreDecision: "allow" | "block",
  respond?: () => Promise<unknown>,
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
  const recorder = new SessionRecorder(runtime, session.id);
  const recordDurably = vi.spyOn(recorder, "recordDurably");
  const bridge = respond
    ? { requestDecision: vi.fn(respond) }
    : bridgeFor(prepared.proposal.actionId, coreDecision);
  const adapter = await createProjectCommandAgentFuseAdapter(bridge, {
    messageIdFactory: () => "message-1",
    clock: () => NOW,
  });
  return {
    ...prepared,
    runtime,
    sessionId: session.id,
    bridge,
    recordDurably,
    coordinator: new ProjectCommandDecisionCoordinator({
      adapter,
      recorder,
      clock: () => NOW,
    }),
  };
}

async function proposalAndApproval() {
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
    sessionId: "session-1",
    projectBindingId: "project-1",
    projectFingerprint: `sha256:${"b".repeat(64)}`,
    requestedAt: NOW.toISOString(),
  });
  const approval = await createProjectCommandActionApproval({
    proposal,
    approvalId: "approval-1",
    sessionApprovalGeneration: 0,
    approvedAt: NOW.toISOString(),
    expiresAt: "2026-07-27T00:10:00.000Z",
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
        decisionId: `decision-${decision}`,
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
          record_id: `record-${decision}`,
          boundary_decision: { decision },
        },
        decidedAt: NOW.toISOString(),
      },
    })),
  };
}

function sequenceIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}
