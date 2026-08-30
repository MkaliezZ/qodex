import type {
  AgentBackend,
  AgentBackendAdmission,
  AgentBackendTaskInput,
  AgentBackendTaskOutput,
  AgentObservation,
  GovernanceTier,
} from "../types.js";
import { AgentBackendUnavailableError } from "./codex-observed.js";
import type { AgentProcessTaskTransport, DshRuntimeProbe } from "./process-transport.js";

export class DshGovernanceUnavailableError extends Error {
  constructor(readonly failedChecks: readonly string[]) {
    super(`Governed DSH admission failed: ${failedChecks.join(", ")}.`);
    this.name = "DshGovernanceUnavailableError";
  }
}

export class DshGovernedBackend implements AgentBackend {
  readonly id = "dsh-deepseek";
  readonly kind = "deepseek-harness";

  constructor(
    private readonly transport: AgentProcessTaskTransport<DshRuntimeProbe>,
  ) {}

  async probeCapabilities(): Promise<AgentBackendAdmission> {
    const probe = await this.transport.probe();
    return Object.freeze({
      version: normalizedVersion(probe.version),
      ...(probe.model?.trim() ? { model: probe.model.trim() } : {}),
      capabilities: Object.freeze({
        supportsStreaming: probe.supportsStreaming,
        supportsCancel: probe.supportsCancel,
        supportsToolEvents: probe.supportsToolEvents,
        governanceTier: classifyDshGovernanceTier(probe),
        governanceMode: probe.available ? probe.governance.mode : "none",
        supportsResume: probe.supportsResume,
      }),
    });
  }

  async startTask(
    input: AgentBackendTaskInput,
    observe: (observation: AgentObservation) => void,
  ): Promise<AgentBackendTaskOutput> {
    const probe = await this.transport.probe();
    if (!probe.available) throw new AgentBackendUnavailableError(this.id);
    const failedChecks = failedGovernanceChecks(probe);
    if (input.governanceRequired && failedChecks.length > 0) {
      throw new DshGovernanceUnavailableError(failedChecks);
    }
    return this.transport.runTask(input, observe);
  }

  async stop(workerRunId: string): Promise<void> {
    await this.transport.stop?.(workerRunId);
  }
}

export function classifyDshGovernanceTier(probe: DshRuntimeProbe): GovernanceTier {
  if (!probe.available) return "OPAQUE";
  return failedGovernanceChecks(probe).length === 0 ? "GOVERNED" : "OBSERVED";
}

export function failedGovernanceChecks(probe: DshRuntimeProbe): readonly string[] {
  const checks: readonly [string, boolean][] = [
    ["compatible_runtime", probe.governance.compatibleRuntime],
    ["agentfuse_adapter", probe.governance.agentFuseAdapterAvailable],
    ["pre_dispatch_seam", probe.governance.preDispatchSeamAvailable],
    ["governed_profile", probe.governance.governedProfileValid],
    ["evidence_capture", probe.governance.evidenceCaptureAvailable],
  ];
  if (probe.governance.mode !== "pre_dispatch_plugin") {
    return Object.freeze(["pre_dispatch_plugin_mode", ...checks.filter(([, passed]) => !passed).map(([name]) => name)]);
  }
  return Object.freeze(checks.filter(([, passed]) => !passed).map(([name]) => name));
}

function normalizedVersion(version: string): string {
  return version.trim() || "unavailable";
}
