import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentLoopRuntime,
  createTrustedProjectCommandDefinition,
  type AgentLoopTask,
  type AgentPatchAdapter,
  type AgentProjectAccess,
  type AgentSideEffectLifecycle,
  type ProjectCommandDefinition,
  type ProjectCommandRunner,
} from "@qodex/agent-runtime";
import type {
  AgentFuseBridgeClient,
  AgentFuseDecisionRequest,
  AgentFuseDecisionResponse,
} from "@qodex/agentfuse-adapter";
import type { ModelChunk, ModelProvider } from "@qodex/provider-sdk";
import { ProjectRuntime } from "@qodex/project-runtime";
import type { SessionEntry } from "@qodex/session-runtime";
import { useSessionContext } from "./SessionContext";
import { createManagedPythonBridge } from "../platform/managedPythonBridge";
import { openProjectDirectory } from "../platform/openProjectDirectory";
import { projectBindingIdentity } from "../platform/projectBinding";
import { AgentSessionLedgerRecorder } from "../session/agentSessionRecorder";
import {
  createProjectCommandActionApproval,
  createProjectCommandActionProposal,
} from "../session/projectCommandActionMapping";
import { createProjectCommandAgentFuseAdapter } from "../session/projectCommandDecisionCoordinator";

const PROOF_COMMAND_ID = "package-script:test:agentfuse-proof";
const PROOF_CONFIG_PATH = "kerniq-proof-case.json";
const PROJECT_COMMAND_POLICY_PROFILE = "kerniq-project-command-v1";
const PROJECT_COMMAND_POLICY_DIGEST =
  "sha256:9c01df377b0cfd8db8392dc8966a2f12b38ad1b2ab9c89780ac049ac0eed38ad";
let proofPickerStarted = false;

type ProofCase =
  | "identity"
  | "allow"
  | "human-deny"
  | "canonical-block"
  | "decision-fault"
  | "start-fault"
  | "settlement-fault"
  | "settlement-restart"
  | "allowed-unstarted"
  | "allowed-unstarted-restart"
  | "duplicate"
  | "active-run-duplicate";

interface ProofConfig {
  case: ProofCase;
}

interface PreparedLifecycle {
  case: ProofCase;
  sessionId: string;
  taskId: string;
  loop: AgentLoopRuntime;
  recorder: AgentSessionLedgerRecorder;
  provider: CountingProofProvider;
  bridge: CountingBridge;
}

interface OpenedProofProject {
  project: ProjectRuntime;
  commandRunner: ProjectCommandRunner;
  bindingId: string;
  projectFingerprint: string;
  config: ProofConfig;
  primaryCommand: ProjectCommandDefinition;
  otherCommand: ProjectCommandDefinition;
}

interface ProofReport {
  case: ProofCase;
  status: string;
  sessionId?: string;
  providerCalls?: number;
  agentFuseRequests?: number;
  eventTypes?: string[];
  taskStatus?: string;
  commandResult?: unknown;
  details?: Record<string, unknown>;
}

class CountingBridge implements AgentFuseBridgeClient {
  requests = 0;
  lastRequest: AgentFuseDecisionRequest | null = null;
  lastError: string | null = null;

  constructor(private readonly delegate: AgentFuseBridgeClient) {}

  async requestDecision(
    request: AgentFuseDecisionRequest,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.requests += 1;
    this.lastRequest = structuredClone(request);
    this.lastError = null;
    try {
      return await this.delegate.requestDecision(request, signal);
    } catch (cause) {
      this.lastError = messageOf(cause);
      throw cause;
    }
  }
}

class CountingProofProvider implements ModelProvider {
  readonly id = "kerniq-real-tauri-proof";
  readonly name = "KerniQ deterministic real-Tauri proof provider";
  readonly protocol = "openai-chat";
  readonly capabilities = { toolAgentLoop: true };
  calls = 0;

  constructor(private readonly commandId: string) {}

  listModels = async () => [];
  testConnection = async () => true;

  async *stream(): AsyncIterable<ModelChunk> {
    this.calls += 1;
    if (this.calls === 1) {
      yield { type: "tool_call", id: "proof-list", name: "list_project_commands", arguments: {} };
      yield {
        type: "tool_call",
        id: "proof-command",
        name: "run_project_command",
        arguments: { commandId: this.commandId },
      };
      return;
    }
    yield { type: "text", text: "Real Tauri Project Command proof result observed." };
  }
}

export function ProjectCommandRealTauriProof() {
  const { runtime: sessionRuntime, refreshSessions, ready } = useSessionContext();
  const managedBridge = useMemo(createManagedPythonBridge, []);
  const [phase, setPhase] = useState("Select the isolated proof fixture.");
  const [report, setReport] = useState<ProofReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedLifecycle | null>(null);
  const openedRef = useRef<OpenedProofProject | null>(null);

  useEffect(() => {
    document.title = `KerniQ Real Proof - ${phase}`;
  }, [phase]);

  const loadEntries = useCallback(async (sessionId: string): Promise<SessionEntry[]> => {
    return sessionRuntime.loadActivePath(sessionId);
  }, [sessionRuntime]);

  const showSessionReport = useCallback(async (
    configCase: ProofCase,
    sessionId: string,
    details: Record<string, unknown> = {},
  ) => {
    const entries = await loadEntries(sessionId);
    const projected = await sessionRuntime.projectCurrentState(sessionId);
    setReport({
      case: configCase,
      status: "recorded",
      sessionId,
      eventTypes: entries.map((entry) => entry.type),
      details: {
        projectedStatus: projected.status,
        pendingAction: projected.pendingAction,
        ...details,
      },
    });
    setPhase("Proof evidence is ready for external SQLite review.");
  }, [loadEntries, sessionRuntime]);

  const inspectRestart = useCallback(async (configCase: ProofCase) => {
    const target = configCase === "settlement-restart"
      ? "proof-settlement-fault-session"
      : "proof-allowed-unstarted-session";
    await showSessionReport(configCase, target, {
      automaticProviderCalls: 0,
      automaticAgentFuseRequests: 0,
      automaticNativeInvocations: 0,
    });
  }, [showSessionReport]);

  const selectFixture = useCallback(async () => {
    if (!ready || !managedBridge) return;
    setBusy(true);
    setReport(null);
    setPrepared(null);
    setPhase("Waiting for the isolated project directory.");
    try {
      const opened = await openProjectDirectory();
      if (!opened?.commandRunner) throw new Error("The real Tauri command runner is unavailable.");
      const project = new ProjectRuntime({ adapter: opened.adapter });
      await project.openProject(opened.name);
      const config = parseConfig(await opened.adapter.readTextFile(PROOF_CONFIG_PATH));
      const binding = await projectBindingIdentity(opened);
      await sessionRuntime.upsertProjectBinding({
        ...binding,
        lastOpenedAt: new Date().toISOString(),
      });
      const packageJson = JSON.parse(await opened.adapter.readTextFile("package.json")) as {
        scripts?: Record<string, unknown>;
      };
      const primaryCommand = await commandFromPackageScript(
        packageJson,
        "test:agentfuse-proof",
      );
      const otherCommand = await commandFromPackageScript(
        packageJson,
        "test:agentfuse-proof-other",
      );
      openedRef.current = {
        project,
        commandRunner: opened.commandRunner,
        bindingId: binding.bindingId,
        projectFingerprint: binding.projectFingerprint,
        config,
        primaryCommand,
        otherCommand,
      };

      if (config.case === "settlement-restart" || config.case === "allowed-unstarted-restart") {
        await inspectRestart(config.case);
      } else if (config.case === "identity") {
        const verified = await managedBridge.verify();
        const selfCheck = await managedBridge.selfCheck();
        setReport({
          case: config.case,
          status: "recorded",
          details: { verified, selfCheck },
        });
        setPhase("Canonical managed-runtime identity verified.");
      } else if (config.case === "canonical-block") {
        await runCanonicalBlock(
          config.case,
          managedBridge,
          primaryCommand,
          binding.bindingId,
          binding.projectFingerprint,
          setReport,
        );
        setPhase("Canonical RuntimeGuard block evidence recorded.");
      } else if (config.case === "active-run-duplicate") {
        setPhase("Fixture selected. Run the active native run-ID proof.");
      } else {
        const lifecycle = await prepareLifecycle(
          config.case,
          project,
          opened.commandRunner,
          binding.bindingId,
          binding.projectFingerprint,
          sessionRuntime,
          refreshSessions,
          managedBridge,
          setPhase,
        );
        setPrepared(lifecycle);
        setPhase("Waiting for explicit proof approval or denial.");
      }
    } catch (cause) {
      setPhase("Proof setup failed closed.");
      setReport({
        case: openedRef.current?.config.case ?? "identity",
        status: "error",
        details: { message: messageOf(cause) },
      });
    } finally {
      setBusy(false);
    }
  }, [
    inspectRestart,
    managedBridge,
    ready,
    refreshSessions,
    sessionRuntime,
  ]);

  useEffect(() => {
    if (!ready || !managedBridge || proofPickerStarted) return;
    proofPickerStarted = true;
    void selectFixture();
  }, [managedBridge, ready, selectFixture]);

  const settleLifecycle = useCallback(async (
    lifecycle: PreparedLifecycle,
    operation: () => Promise<AgentLoopTask>,
  ) => {
    setBusy(true);
    setReport(null);
    try {
      const task = await operation();
      lifecycle.recorder.recordTask(task);
      try {
        await lifecycle.recorder.flush();
      } catch {
        // The proof report below reads the authoritative durable path.
      }
      const entries = await loadEntries(lifecycle.sessionId);
      setReport({
        case: lifecycle.case,
        status: "recorded",
        sessionId: lifecycle.sessionId,
        providerCalls: lifecycle.provider.calls,
        agentFuseRequests: lifecycle.bridge.requests,
        eventTypes: entries.map((entry) => entry.type),
        taskStatus: task.status,
        commandResult: lastCommandResult(task),
        details: {
          bridgeError: lifecycle.bridge.lastError,
          bridgeRequest: lifecycle.bridge.lastRequest,
        },
      });
      setPhase("Proof evidence is ready for external SQLite review.");
      await refreshSessions();
    } catch (cause) {
      const entries = await loadEntries(lifecycle.sessionId).catch(() => []);
      setReport({
        case: lifecycle.case,
        status: "failed-closed",
        sessionId: lifecycle.sessionId,
        providerCalls: lifecycle.provider.calls,
        agentFuseRequests: lifecycle.bridge.requests,
        eventTypes: entries.map((entry) => entry.type),
        details: {
          message: messageOf(cause),
          bridgeError: lifecycle.bridge.lastError,
          bridgeRequest: lifecycle.bridge.lastRequest,
        },
      });
      setPhase("Proof path failed closed; durable evidence is ready for review.");
    } finally {
      setBusy(false);
      if (lifecycle.case !== "allowed-unstarted") setPrepared(null);
    }
  }, [loadEntries, refreshSessions]);

  const approve = useCallback(async () => {
    if (!prepared) return;
    await settleLifecycle(prepared, () => prepared.loop.approveCommand(prepared.taskId));
  }, [prepared, settleLifecycle]);

  const approveConcurrently = useCallback(async () => {
    if (!prepared) return;
    await settleLifecycle(prepared, async () => {
      const [first] = await Promise.all([
        prepared.loop.approveCommand(prepared.taskId),
        prepared.loop.approveCommand(prepared.taskId),
      ]);
      return first;
    });
  }, [prepared, settleLifecycle]);

  const deny = useCallback(async () => {
    if (!prepared) return;
    await settleLifecycle(prepared, () => prepared.loop.denyCommand(prepared.taskId));
  }, [prepared, settleLifecycle]);

  const runActiveDuplicate = useCallback(async () => {
    const opened = openedRef.current;
    if (!opened || opened.config.case !== "active-run-duplicate") return;
    setBusy(true);
    setReport(null);
    setPhase("Running one coalesced active native command.");
    const runId = "proof-active-duplicate-run";
    try {
      const first = opened.commandRunner.run(opened.primaryCommand, runId);
      const duplicate = opened.commandRunner.run(opened.primaryCommand, runId);
      let identityTransferBlocked = false;
      try {
        await opened.commandRunner.run(opened.otherCommand, runId);
      } catch {
        identityTransferBlocked = true;
      }
      const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
      setReport({
        case: opened.config.case,
        status: "recorded",
        details: {
          sameResult: JSON.stringify(firstResult) === JSON.stringify(duplicateResult),
          identityTransferBlocked,
          firstResult,
        },
      });
      setPhase("Active native run-ID evidence is ready for review.");
    } catch (cause) {
      setReport({
        case: opened.config.case,
        status: "error",
        details: { message: messageOf(cause) },
      });
      setPhase("Active native run-ID proof failed closed.");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <main className="workbench-view settings-view" data-testid="project-command-real-tauri-proof">
      <section className="settings-section" aria-labelledby="project-command-real-proof-title">
        <div className="settings-section-heading">
          <div>
            <h1 id="project-command-real-proof-title">Project Command real Tauri proof</h1>
            <p>
              Development-only harness. Uses actual Tauri IPC, SQLite, managed Python,
              canonical AgentFuse, and the native no-shell command runner.
            </p>
          </div>
        </div>
        <div className="managed-runtime-card">
          <div className="managed-runtime-actions">
            <button
              className="qodex-button"
              disabled={busy || !ready}
              onClick={() => void selectFixture()}
            >
              Select isolated proof project
            </button>
            {prepared ? (
              <>
                <button
                  className="qodex-button"
                  disabled={busy}
                  onClick={() => void approve()}
                >
                  Approve Project Command
                </button>
                <button
                  className="qodex-button qodex-button-secondary"
                  disabled={busy}
                  onClick={() => void approveConcurrently()}
                >
                  Approve twice concurrently
                </button>
                <button
                  className="qodex-button qodex-button-danger"
                  disabled={busy}
                  onClick={() => void deny()}
                >
                  Deny Project Command
                </button>
              </>
            ) : null}
            {openedRef.current?.config.case === "active-run-duplicate" ? (
              <button
                className="qodex-button"
                disabled={busy}
                onClick={() => void runActiveDuplicate()}
              >
                Run active duplicate proof
              </button>
            ) : null}
          </div>
          <p role="status" data-testid="project-command-proof-phase">{phase}</p>
          {report ? (
            <pre
              className="mono-value"
              data-testid="project-command-proof-report"
              style={{ whiteSpace: "pre-wrap", userSelect: "text" }}
            >
              {JSON.stringify(report, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>
    </main>
  );
}

async function prepareLifecycle(
  configCase: ProofCase,
  project: ProjectRuntime,
  commandRunner: ProjectCommandRunner,
  projectBindingId: string,
  projectFingerprint: string,
  sessionRuntime: ReturnType<typeof useSessionContext>["runtime"],
  refreshSessions: () => Promise<void>,
  bridge: NonNullable<ReturnType<typeof createManagedPythonBridge>>,
  setPhase: (phase: string) => void,
): Promise<PreparedLifecycle> {
  const sessionId = sessionIdFor(configCase);
  const taskId = sessionId;
  await sessionRuntime.createSession({
    id: sessionId,
    title: `KerniQ v0.6.1.6 ${configCase} proof`,
    projectBindingId,
    providerId: "proof-local",
    modelId: "proof-deterministic",
  });
  const countingBridge = new CountingBridge(bridge);
  const decisionAdapter = await createProjectCommandAgentFuseAdapter(countingBridge);
  const recorder = new AgentSessionLedgerRecorder({
    runtime: sessionRuntime,
    sessionId,
    onRecorded: refreshSessions,
    commandDecisionAdapter: decisionAdapter,
    projectBindingId,
    projectFingerprint,
  });
  const provider = new CountingProofProvider(PROOF_COMMAND_ID);
  const projectAccess: AgentProjectAccess = {
    listFiles: () => project.index?.files.map((file) => ({
      path: file.path,
      size: file.size,
    })) ?? [],
    readFile: (path) => project.fileAccess.readFile(path),
    commandExecutionAvailable: true,
  };
  const lifecycle = configCase === "allowed-unstarted"
    ? pauseBeforeStart(recorder, setPhase)
    : recorder;
  const loop = new AgentLoopRuntime({
    provider,
    modelId: "proof-deterministic",
    project: projectAccess,
    patchAdapter: inertPatchAdapter(),
    commandRunner,
    sideEffectLifecycle: lifecycle,
    requireCommandDecision: true,
  });
  loop.subscribe((task) => recorder.recordTask(task));
  recorder.recordUserMessage("Run the isolated real Tauri Project Command proof.");
  await recorder.flush();
  const task = await loop.start(taskId, "Run the isolated real Tauri Project Command proof.");
  recorder.recordTask(task);
  await recorder.flush();
  if (task.status !== "WaitingForCommandApproval") {
    throw new Error(`The proof command did not reach approval: ${task.status}`);
  }
  return {
    case: configCase,
    sessionId,
    taskId,
    loop,
    recorder,
    provider,
    bridge: countingBridge,
  };
}

function pauseBeforeStart(
  recorder: AgentSessionLedgerRecorder,
  setPhase: (phase: string) => void,
): AgentSideEffectLifecycle {
  return {
    beforePatchApply: (input) => recorder.beforePatchApply(input),
    afterPatchApply: (input) => recorder.afterPatchApply(input),
    beforeCommandDecision: (input) => recorder.beforeCommandDecision(input),
    beforeCommandStart: async () => {
      setPhase("Allowed and intentionally paused before COMMAND_STARTED; stop the app now.");
      await new Promise<never>(() => {});
    },
    afterCommandComplete: (input) => recorder.afterCommandComplete(input),
    afterSideEffectFailure: (input) => recorder.afterSideEffectFailure(input),
  };
}

async function runCanonicalBlock(
  configCase: ProofCase,
  bridge: NonNullable<ReturnType<typeof createManagedPythonBridge>>,
  command: ProjectCommandDefinition,
  projectBindingId: string,
  projectFingerprint: string,
  setReport: (report: ProofReport) => void,
): Promise<void> {
  const now = new Date();
  const proposal = await createProjectCommandActionProposal({
    command: createTrustedProjectCommandDefinition({
      ...command,
      catalogDigest: command.catalogDigest!,
    }),
    toolCallId: "proof-canonical-block-action",
    taskId: "proof-canonical-block-task",
    sessionId: "proof-canonical-block-session",
    projectBindingId,
    projectFingerprint,
    requestedAt: now.toISOString(),
  });
  const mutableProposal = structuredClone(proposal);
  if (
    typeof mutableProposal.parameters !== "object"
    || mutableProposal.parameters === null
    || Array.isArray(mutableProposal.parameters)
  ) {
    throw new Error("The proof proposal parameters are unavailable.");
  }
  mutableProposal.parameters.commandCategory = "deploy";
  const approval = await createProjectCommandActionApproval({
    proposal,
    approvalId: "proof-canonical-block-approval",
    sessionApprovalGeneration: 0,
    approvedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    now,
  });
  const request: AgentFuseDecisionRequest = {
    protocolVersion: "kerniq.agentfuse.bridge.v1",
    messageId: "proof-canonical-block-message",
    messageType: "decision_request",
    payload: {
      proposal: mutableProposal,
      approval: { ...approval, proposalDigest: mutableProposal.proposalDigest },
      policyProfileId: PROJECT_COMMAND_POLICY_PROFILE,
      expectedPolicyDigest: PROJECT_COMMAND_POLICY_DIGEST,
    },
  };
  const response = await bridge.requestDecision(
    request,
    new AbortController().signal,
  ) as AgentFuseDecisionResponse;
  setReport({
    case: configCase,
    status: "recorded",
    agentFuseRequests: 1,
    details: {
      proofInput: "proof-only commandCategory=deploy",
      canonicalDecision: response.payload.decision,
      kerniqMapping: response.payload.decision === "block" ? "deny" : response.payload.decision,
      handlerSupplied: false,
      nativeInvocations: 0,
      productionMapperChanged: false,
      reasonCode: response.payload.reasonCode,
    },
  });
}

async function commandFromPackageScript(
  packageJson: { scripts?: Record<string, unknown> },
  script: string,
): Promise<ProjectCommandDefinition> {
  const source = packageJson.scripts?.[script];
  if (typeof source !== "string" || !source.trim()) {
    throw new Error(`The isolated fixture is missing ${script}.`);
  }
  return createTrustedProjectCommandDefinition({
    id: `package-script:${script}`,
    label: `pnpm ${script}`,
    executable: "pnpm",
    args: ["run", script],
    cwd: ".",
    source: "package.json",
    category: "test",
    catalogDigest: await sha256(`package.json\0${script}\0${source}`),
  });
}

function parseConfig(raw: string): ProofConfig {
  const parsed = JSON.parse(raw) as { case?: unknown };
  if (!isProofCase(parsed.case)) throw new Error("The proof case is not trusted.");
  return { case: parsed.case };
}

function isProofCase(value: unknown): value is ProofCase {
  return typeof value === "string" && [
    "identity",
    "allow",
    "human-deny",
    "canonical-block",
    "decision-fault",
    "start-fault",
    "settlement-fault",
    "settlement-restart",
    "allowed-unstarted",
    "allowed-unstarted-restart",
    "duplicate",
    "active-run-duplicate",
  ].includes(value);
}

function sessionIdFor(configCase: ProofCase): string {
  switch (configCase) {
    case "decision-fault": return "proof-decision-fault-session";
    case "start-fault": return "proof-start-fault-session";
    case "settlement-fault": return "proof-settlement-fault-session";
    case "allowed-unstarted": return "proof-allowed-unstarted-session";
    case "duplicate": return "proof-duplicate-session";
    case "human-deny": return "proof-human-deny-session";
    default: return "proof-allow-session";
  }
}

function inertPatchAdapter(): AgentPatchAdapter {
  return {
    prepare: async (response) => ({
      assistantText: response,
      proposal: null,
      error: { code: "patch_not_present", message: "The proof provider emits no patch." },
    }),
    apply: async () => [],
    reject: () => {},
    rollback: async () => [],
  };
}

function lastCommandResult(task: AgentLoopTask): unknown {
  let message: AgentLoopTask["conversation"][number] | undefined;
  for (let index = task.conversation.length - 1; index >= 0; index -= 1) {
    const candidate = task.conversation[index];
    if (candidate.role === "tool" && candidate.toolCallId === "proof-command") {
      message = candidate;
      break;
    }
  }
  if (!message) return null;
  try {
    return JSON.parse(message.content);
  } catch {
    return { boundedText: message.content.slice(0, 1_024) };
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  if (typeof cause === "string" && cause.trim()) return cause;
  return "The real Tauri proof failed closed.";
}
