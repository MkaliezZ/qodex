import {
  ActionRuntime,
  createActionProposal,
  type ActionApproval,
  type ActionLifecycleHooks,
  type ActionProposal,
  type ActionSnapshot,
  type JsonValue,
} from "@qodex/action-runtime";
import {
  AgentFuseAdapter,
  type AgentFuseBridgeClient,
} from "@qodex/agentfuse-adapter";
import {
  SessionRecorder,
  type SessionRuntime,
} from "@qodex/session-runtime";

export const PROOF_ACTION_TYPE = "kerniq.proof.increment-counter";
export const PROOF_SANDBOX_ID = "kerniq-private-counter-v1";
export const AGENTFUSE_COMMIT = "8c6ae9875b3618a529d5150c96385da7461099c2";
export const AGENTFUSE_PROTOCOL = "kerniq.agentfuse.bridge.v1";
export const AGENTFUSE_SCHEMA = "agentfuse-evidence-schema-v0.1";
export const AGENTFUSE_POLICY = "dhms-agentfuse-runtime-guard@3.5.0";

export type AgentFuseProofFixture = "allow" | "deny";

export class ProofCounterStore {
  private count = 0;
  private handlerInvocations = 0;

  increment(sandboxId: string): { count: number; physicalMutations: number } {
    this.handlerInvocations += 1;
    if (sandboxId !== PROOF_SANDBOX_ID) {
      throw new Error("Unknown trusted proof sandbox.");
    }
    this.count += 1;
    return { count: this.count, physicalMutations: 1 };
  }

  snapshot(): { count: number; handlerInvocations: number } {
    return { count: this.count, handlerInvocations: this.handlerInvocations };
  }
}

export interface PrepareAgentFuseProofOptions {
  fixture: AgentFuseProofFixture;
  bridge: AgentFuseBridgeClient;
  sessionRuntime: SessionRuntime;
  refreshSessions?: () => void | Promise<void>;
  counterStore?: ProofCounterStore;
  now?: () => Date;
  idFactory?: () => string;
}

export class PreparedAgentFuseProof {
  private execution: Promise<ActionSnapshot> | null = null;

  constructor(
    readonly proposal: ActionProposal,
    readonly fixture: AgentFuseProofFixture,
    readonly sessionId: string,
    readonly counterStore: ProofCounterStore,
    private readonly runtime: ActionRuntime,
    private readonly adapter: AgentFuseAdapter,
    private readonly now: () => Date,
    private readonly idFactory: () => string,
  ) {}

  approveAndRun(): Promise<ActionSnapshot> {
    this.execution ??= this.approveAndRunOnce();
    return this.execution;
  }

  private async approveAndRunOnce(): Promise<ActionSnapshot> {
    const approvedAt = this.now();
    const approval: ActionApproval = {
      approvalId: this.idFactory(),
      actionId: this.proposal.actionId,
      taskId: this.proposal.taskId,
      proposalDigest: this.proposal.proposalDigest,
      generation: 1,
      approvedAt: approvedAt.toISOString(),
      expiresAt: new Date(approvedAt.getTime() + 5 * 60_000).toISOString(),
    };
    await this.runtime.approve(approval);
    return this.runtime.execute(this.proposal.actionId, this.adapter.decide);
  }
}

export async function prepareAgentFuseProof(
  options: PrepareAgentFuseProofOptions,
): Promise<PreparedAgentFuseProof> {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? (() => globalThis.crypto.randomUUID());
  const counterStore = options.counterStore ?? new ProofCounterStore();
  const session = await options.sessionRuntime.createSession({
    title: `AgentFuse ${options.fixture} proof`,
  });
  const recorder = new SessionRecorder(
    options.sessionRuntime,
    session.id,
    options.refreshSessions,
  );
  const hooks = sessionEvidenceHooks(recorder);
  const runtime = new ActionRuntime({ hooks, clock: now });
  runtime.registry.register(PROOF_ACTION_TYPE, async ({ proposal }) => {
    const parameters = asRecord(proposal.parameters);
    return counterStore.increment(text(parameters.sandboxId));
  });
  const proposal = await createActionProposal({
    actionId: idFactory(),
    taskId: idFactory(),
    sessionId: session.id,
    actionType: PROOF_ACTION_TYPE,
    title: "Increment private proof counter",
    summary: "Increment one disposable KerniQ development proof counter.",
    risk: "write",
    parameters: {
      sandboxId: PROOF_SANDBOX_ID,
      counterName: "agentfuse-proof",
    },
    requestedAt: now().toISOString(),
  });
  await runtime.propose(proposal);
  await recorder.recordDurably({
    type: "ACTION_PROPOSED",
    payload: {
      actionId: proposal.actionId,
      actionType: proposal.actionType,
      title: proposal.title,
      summary: proposal.summary,
      risk: proposal.risk,
      proposalDigest: proposal.proposalDigest,
    },
    safeMetadata: {
      actionId: proposal.actionId,
      taskId: proposal.taskId,
      runtimeType: "managed-python-agentfuse",
      recordKey: `action-proposal:${proposal.actionId}`,
    },
  });
  const adapter = new AgentFuseAdapter({
    bridge: options.bridge,
    expectedAgentFuseCommit: AGENTFUSE_COMMIT,
    expectedProtocolVersion: AGENTFUSE_PROTOCOL,
    expectedSchemaVersion: AGENTFUSE_SCHEMA,
    expectedPolicyVersion: AGENTFUSE_POLICY,
    policyFixtureId: `kerniq-proof-${options.fixture}-v1`,
  });
  return new PreparedAgentFuseProof(
    proposal,
    options.fixture,
    session.id,
    counterStore,
    runtime,
    adapter,
    now,
    idFactory,
  );
}

function sessionEvidenceHooks(recorder: SessionRecorder): ActionLifecycleHooks {
  return {
    beforeApprovalAccepted: async (snapshot, approval) => {
      await recorder.recordDurably({
        type: "ACTION_APPROVED",
        payload: {
          actionId: snapshot.proposal.actionId,
          proposalDigest: snapshot.proposal.proposalDigest,
        },
        safeMetadata: approvalMetadata(
          snapshot.proposal,
          approval.approvalId,
          approval.generation,
          `action-approval:${approval.approvalId}`,
        ),
      });
    },
    afterDecisionReceived: async (snapshot, decision) => {
      if (decision.decision !== "deny") return;
      await recorder.recordDurably({
        type: "ACTION_DENIED",
        payload: {
          actionId: snapshot.proposal.actionId,
          decision: decision.decision,
          reasonCode: decision.reasonCode,
          summary: decision.summary,
        },
        safeMetadata: {
          ...decisionMetadata(snapshot.proposal, decision),
          approvalId: snapshot.approval?.approvalId,
          approvalGeneration: sessionApprovalGeneration(snapshot.approval?.generation ?? 1),
          recordKey: `action-decision:${decision.decisionId}`,
        },
      });
    },
    beforeDispatch: async (snapshot, started) => {
      const decision = snapshot.decision;
      if (!decision) throw new Error("Dispatch evidence requires an AgentFuse decision.");
      await recorder.recordDurably({
        type: "ACTION_STARTED",
        payload: {
          actionId: snapshot.proposal.actionId,
          decision: decision.decision,
        },
        safeMetadata: {
          ...approvalMetadata(
            snapshot.proposal,
            started.approvalId,
            snapshot.approval?.generation ?? 1,
            `action-start:${started.executionReceiptId}`,
          ),
          ...decisionMetadata(snapshot.proposal, decision),
          executionReceiptId: started.executionReceiptId,
        },
      });
    },
    afterSettlement: async (snapshot, outcome) => {
      const approval = snapshot.approval;
      const started = snapshot.started;
      if (!approval || !started) throw new Error("Settlement evidence requires dispatch identity.");
      await recorder.recordDurably({
        type: outcome.status === "completed" ? "ACTION_COMPLETED" : "ACTION_FAILED",
        payload: {
          actionId: snapshot.proposal.actionId,
          status: outcome.status,
          outcomeId: `outcome-${outcome.executionReceiptId}`,
          ...(outcome.result === undefined ? {} : { result: outcome.result }),
          ...(outcome.error === undefined ? {} : { error: outcome.error }),
        },
        safeMetadata: {
          ...approvalMetadata(
            snapshot.proposal,
            approval.approvalId,
            approval.generation,
            `action-outcome:${outcome.executionReceiptId}`,
          ),
          executionReceiptId: outcome.executionReceiptId,
          outcomeId: `outcome-${outcome.executionReceiptId}`,
        },
      });
    },
  };
}

function approvalMetadata(
  proposal: ActionProposal,
  approvalId: string,
  generation: number,
  recordKey: string,
) {
  return {
    actionId: proposal.actionId,
    taskId: proposal.taskId,
    approvalId,
    approvalGeneration: sessionApprovalGeneration(generation),
    recordKey,
  };
}

function decisionMetadata(
  proposal: ActionProposal,
  decision: NonNullable<ActionSnapshot["decision"]>,
) {
  const evidence = asRecord(decision.evidence);
  return {
    actionId: proposal.actionId,
    decisionId: decision.decisionId,
    policyVersion: decision.policyVersion,
    decisionSchemaVersion: text(evidence.schemaVersion),
    agentFuseCommit: text(evidence.agentFuseCommit),
  };
}

function sessionApprovalGeneration(actionGeneration: number): number {
  return Math.max(0, actionGeneration - 1);
}

function asRecord(value: JsonValue): Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Proof data must be an object.");
  }
  return value;
}

function text(value: JsonValue | undefined): string {
  if (typeof value !== "string" || !value) throw new Error("Required proof identity is missing.");
  return value;
}
