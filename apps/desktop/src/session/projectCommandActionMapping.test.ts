import { readFile } from "node:fs/promises";
import {
  createActionProposal,
  validateActionApproval,
  validateActionProposal,
  type ActionProposal,
  type ActionProposalInput,
} from "@qodex/action-runtime";
import {
  PROJECT_COMMAND_POLICY,
  type TrustedProjectCommandDefinition,
} from "@qodex/agent-runtime";
import { describe, expect, it } from "vitest";
import {
  createProjectCommandActionApproval,
  createProjectCommandActionProposal,
  sessionApprovalGenerationToActionGeneration,
  type ProjectCommandActionProposalInput,
} from "./projectCommandActionMapping";

const REQUESTED_AT = "2026-07-27T02:00:00.000Z";
const APPROVED_AT = "2026-07-27T02:01:00.000Z";
const EXPIRES_AT = "2026-07-27T02:06:00.000Z";
const NOW = new Date("2026-07-27T02:02:00.000Z");

function command(
  overrides: Partial<TrustedProjectCommandDefinition> = {},
): TrustedProjectCommandDefinition {
  return {
    id: "package-script:test",
    label: "pnpm test",
    executable: "pnpm",
    args: ["run", "test"],
    cwd: ".",
    source: "package.json",
    category: "test",
    catalogDigest: `sha256:${"a".repeat(64)}`,
    policy: PROJECT_COMMAND_POLICY,
    ...overrides,
  };
}

function proposalInput(
  overrides: Partial<ProjectCommandActionProposalInput> = {},
): ProjectCommandActionProposalInput {
  return {
    command: command(),
    toolCallId: "tool-call-1",
    taskId: "task-1",
    sessionId: "session-1",
    projectBindingId: "project-0123456789abcdef01234567",
    projectFingerprint: `sha256:${"b".repeat(64)}`,
    requestedAt: REQUESTED_AT,
    ...overrides,
  };
}

async function proposalWith(
  overrides: Partial<ProjectCommandActionProposalInput> = {},
): Promise<Readonly<ActionProposal>> {
  return createProjectCommandActionProposal(proposalInput(overrides));
}

function proposalActionInput(proposal: ActionProposal): ActionProposalInput {
  const {
    schemaVersion: _schemaVersion,
    proposalDigest: _proposalDigest,
    ...input
  } = proposal;
  return input;
}

async function expectedPolicyDigest(): Promise<string> {
  const serialized =
    "{\"actionType\":\"kerniq.project-command.run\",\"risk\":\"process\",\"approval\":\"explicit_once\",\"maxTimeoutMs\":120000,\"policyProfileId\":\"kerniq-project-command-v1\"}";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("Project Command Action mapping", () => {
  it("maps exact trusted proposal identity and produces a valid immutable proposal", async () => {
    const proposal = await proposalWith();

    expect(proposal).toMatchObject({
      actionId: "tool-call-1",
      taskId: "task-1",
      sessionId: "session-1",
      actionType: "kerniq.project-command.run",
      risk: "process",
      requestedAt: REQUESTED_AT,
      title: "Run project command: pnpm test",
      summary: "Run trusted catalog command package-script:test in the approved project.",
      parameters: {
        commandId: "package-script:test",
        catalogDigest: `sha256:${"a".repeat(64)}`,
        commandCategory: "test",
        projectBindingId: "project-0123456789abcdef01234567",
        projectFingerprint: `sha256:${"b".repeat(64)}`,
        policyProfileId: "kerniq-project-command-v1",
        policyDigest: await expectedPolicyDigest(),
      },
    });
    await expect(validateActionProposal(proposal)).resolves.toBeUndefined();
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.parameters)).toBe(true);
  });

  it("produces the same proposal digest from the same trusted inputs", async () => {
    const first = await proposalWith();
    const second = await proposalWith();

    expect(first.proposalDigest).toBe(second.proposalDigest);
  });

  it.each([
    ["commandId", { command: command({ id: "package-script:check" }) }],
    ["catalogDigest", { command: command({ catalogDigest: `sha256:${"c".repeat(64)}` }) }],
    ["commandCategory", { command: command({ category: "check" }) }],
    ["projectBindingId", { projectBindingId: "project-fedcba9876543210fedcba98" }],
    ["projectFingerprint", { projectFingerprint: `sha256:${"d".repeat(64)}` }],
  ] as const)("binds %s into the proposal digest", async (_field, overrides) => {
    const baseline = await proposalWith();
    const changed = await proposalWith(overrides);

    expect(changed.proposalDigest).not.toBe(baseline.proposalDigest);
    await expect(validateActionProposal(changed)).resolves.toBeUndefined();
  });

  it("binds the trusted policy profile and exact serialized policy digest", async () => {
    const proposal = await proposalWith();
    const parameters = proposal.parameters as Record<string, string>;

    expect(parameters.policyProfileId).toBe(PROJECT_COMMAND_POLICY.policyProfileId);
    expect(parameters.policyDigest).toBe(await expectedPolicyDigest());
    expect(parameters.catalogDigest).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("changes the proposal digest if either bound policy identity field changes", async () => {
    const baseline = await proposalWith();
    const input = proposalActionInput(baseline);
    const parameters = baseline.parameters as Record<string, string>;
    const changedProfile = await createActionProposal({
      ...input,
      parameters: {
        ...parameters,
        policyProfileId: "different-policy-profile",
      },
    });
    const changedDigest = await createActionProposal({
      ...input,
      parameters: {
        ...parameters,
        policyDigest: `sha256:${"e".repeat(64)}`,
      },
    });

    expect(changedProfile.proposalDigest).not.toBe(baseline.proposalDigest);
    expect(changedDigest.proposalDigest).not.toBe(baseline.proposalDigest);
  });

  it("rejects cloned or modified policy objects", async () => {
    await expect(proposalWith({
      command: command({
        policy: { ...PROJECT_COMMAND_POLICY },
      } as Partial<TrustedProjectCommandDefinition>),
    })).rejects.toThrow("trusted KerniQ catalog");
    await expect(proposalWith({
      command: command({
        policy: {
          ...PROJECT_COMMAND_POLICY,
          policyProfileId: "project-selected-policy",
        },
      } as unknown as Partial<TrustedProjectCommandDefinition>),
    })).rejects.toThrow("trusted KerniQ catalog");
  });

  it("ignores untrusted policy and process fields outside the trusted command", async () => {
    const input = {
      ...proposalInput(),
      actionType: "model.action",
      risk: "read",
      approval: "automatic",
      policyProfileId: "model-selected-policy",
      policyDigest: `sha256:${"f".repeat(64)}`,
      timeout: 1,
      executable: "sh",
      arguments: ["-c", "rm -rf /"],
      environment: { SECRET: "value" },
      cwd: "/private/project",
      projectRoot: "/private/project",
    } as ProjectCommandActionProposalInput;
    const proposal = await createProjectCommandActionProposal(input);
    const baseline = await proposalWith();
    const parameters = proposal.parameters as Record<string, unknown>;

    expect(proposal.actionType).toBe(PROJECT_COMMAND_POLICY.actionType);
    expect(proposal.risk).toBe(PROJECT_COMMAND_POLICY.risk);
    expect(proposal.proposalDigest).toBe(baseline.proposalDigest);
    expect(parameters.policyProfileId).toBe(PROJECT_COMMAND_POLICY.policyProfileId);
    expect(parameters.policyDigest).toBe(await expectedPolicyDigest());
    for (const excluded of [
      "executable",
      "args",
      "arguments",
      "environment",
      "cwd",
      "projectRoot",
      "timeout",
      "approval",
      "approvedAt",
      "expiresAt",
    ]) {
      expect(parameters).not.toHaveProperty(excluded);
    }
  });

  it("bounds title and summary text from trusted catalog metadata", async () => {
    const proposal = await proposalWith({
      command: command({
        id: `package-script:test:${"a".repeat(500)}`,
        label: `pnpm test:${"b".repeat(500)}`,
      }),
    });

    expect([...proposal.title].length).toBeLessThanOrEqual(117);
    expect([...proposal.summary].length).toBeLessThanOrEqual(213);
    expect(proposal.title).not.toContain("vitest --runInBand");
  });

  it("maps Session generation explicitly and binds an immutable approval", async () => {
    const proposal = await proposalWith();
    const approval = createProjectCommandActionApproval({
      proposal,
      approvalId: "approval-1",
      sessionApprovalGeneration: 0,
      approvedAt: APPROVED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    });

    expect(approval).toEqual({
      approvalId: "approval-1",
      actionId: proposal.actionId,
      taskId: proposal.taskId,
      proposalDigest: proposal.proposalDigest,
      generation: 1,
      approvedAt: APPROVED_AT,
      expiresAt: EXPIRES_AT,
    });
    expect(() => validateActionApproval(approval, proposal, 1, NOW)).not.toThrow();
    expect(Object.isFrozen(approval)).toBe(true);
  });

  it("rejects invalid Session approval generations instead of passing through zero", () => {
    expect(sessionApprovalGenerationToActionGeneration(0)).toBe(1);
    expect(sessionApprovalGenerationToActionGeneration(2)).toBe(3);
    expect(() => sessionApprovalGenerationToActionGeneration(-1)).toThrow(
      "non-negative integer",
    );
    expect(() => sessionApprovalGenerationToActionGeneration(0.5)).toThrow(
      "non-negative integer",
    );
  });

  it("rejects expired, non-increasing, and invalid-clock approvals", async () => {
    const proposal = await proposalWith();
    const common = {
      proposal,
      approvalId: "approval-invalid-time",
      sessionApprovalGeneration: 0,
      approvedAt: APPROVED_AT,
      now: NOW,
    };

    expect(() => createProjectCommandActionApproval({
      ...common,
      expiresAt: "2026-07-27T02:01:30.000Z",
    })).toThrow("expired");
    expect(() => createProjectCommandActionApproval({
      ...common,
      expiresAt: APPROVED_AT,
      now: new Date("2026-07-27T02:00:00.000Z"),
    })).toThrow("later than approvedAt");
    expect(() => createProjectCommandActionApproval({
      ...common,
      expiresAt: EXPIRES_AT,
      now: new Date("invalid"),
    })).toThrow("trusted current time");
  });

  it("rejects approval identity, digest, and generation mismatches with the public validator", async () => {
    const proposal = await proposalWith();
    const approval = createProjectCommandActionApproval({
      proposal,
      approvalId: "approval-mismatch",
      sessionApprovalGeneration: 0,
      approvedAt: APPROVED_AT,
      expiresAt: EXPIRES_AT,
      now: NOW,
    });

    for (const changed of [
      { ...approval, actionId: "wrong-action" },
      { ...approval, taskId: "wrong-task" },
      { ...approval, proposalDigest: `sha256:${"0".repeat(64)}` },
    ]) {
      expect(() => validateActionApproval(changed, proposal, 1, NOW)).toThrow(
        "exact action proposal",
      );
    }
    expect(() => validateActionApproval(
      { ...approval, generation: 2 },
      proposal,
      1,
      NOW,
    )).toThrow("stale or unexpected");
  });

  it("has no imports or calls to execution, policy, persistence, native, or Tauri boundaries", async () => {
    const source = await readFile(
      new URL("./projectCommandActionMapping.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("createActionProposal");
    expect(source).toContain("validateActionApproval");
    for (const forbidden of [
      "ActionRuntime",
      "AgentFuse",
      "SessionRecorder",
      "ProjectCommandRunner",
      "@tauri-apps",
      "run_project_command",
      ".propose(",
      ".approve(",
      ".execute(",
      ".decide(",
      ".recordDurably(",
      ".run(",
      "invoke(",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
