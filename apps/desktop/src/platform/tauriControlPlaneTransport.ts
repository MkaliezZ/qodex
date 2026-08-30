import { invoke } from "@tauri-apps/api/core";
import {
  createAgentGovernanceEvidence,
  type AgentBackendTaskInput,
  type AgentBackendTaskOutput,
  type AgentGovernanceEvidenceInput,
  type AgentObservation,
  type AgentProcessRuntimeProbe,
  type AgentProcessTaskTransport,
  type DshRuntimeProbe,
} from "@qodex/multi-agent-runtime";

export interface TauriControlPlaneInvoker {
  <T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

interface NativeBackendRunOutput {
  readonly result: AgentBackendTaskOutput["result"];
  readonly governanceEvidenceInputs: readonly AgentGovernanceEvidenceInput[];
  readonly observations: readonly AgentObservation[];
}

class TauriControlPlaneTransport<Probe extends AgentProcessRuntimeProbe>
implements AgentProcessTaskTransport<Probe> {
  constructor(
    private readonly backendId: string,
    private readonly invokeCommand: TauriControlPlaneInvoker,
  ) {}

  probe(): Promise<Probe> {
    return this.invokeCommand<Probe>("control_plane_probe_backend", {
      backendId: this.backendId,
    });
  }

  async runTask(
    input: AgentBackendTaskInput,
    observe: (observation: AgentObservation) => void,
  ): Promise<AgentBackendTaskOutput> {
    const output = await this.invokeCommand<NativeBackendRunOutput>(
      "control_plane_run_backend",
      {
        request: {
          backendId: this.backendId,
          taskId: input.taskId,
          workerRunId: input.workerRunId,
          workspace: input.workspace,
          prompt: input.prompt,
          governanceRequired: input.governanceRequired,
        },
      },
    );
    for (const observation of output.observations) {
      observe(Object.freeze({
        ...observation,
        at: normalizedTimestamp(observation.at),
      }));
    }
    return Object.freeze({
      result: Object.freeze({
        ...output.result,
        findings: Object.freeze(output.result.findings.map((finding) => Object.freeze({
          ...finding,
          files: Object.freeze([...finding.files]),
        }))),
      }),
      governanceEvidence: Object.freeze(
        output.governanceEvidenceInputs.map(createAgentGovernanceEvidence),
      ),
    });
  }
}

export function createTauriCodexTransport(
  invokeCommand: TauriControlPlaneInvoker = invoke,
): AgentProcessTaskTransport<AgentProcessRuntimeProbe> {
  return new TauriControlPlaneTransport("codex", invokeCommand);
}

export function createTauriDshTransport(
  invokeCommand: TauriControlPlaneInvoker = invoke,
): AgentProcessTaskTransport<DshRuntimeProbe> {
  return new TauriControlPlaneTransport("dsh-deepseek", invokeCommand);
}

function normalizedTimestamp(value: string): string {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}
