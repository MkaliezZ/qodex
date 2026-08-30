import type {
  AgentBackend,
  AgentBackendAdmission,
  AgentBackendTaskInput,
  AgentBackendTaskOutput,
  AgentObservation,
} from "../types.js";
import type {
  AgentProcessRuntimeProbe,
  AgentProcessTaskTransport,
} from "./process-transport.js";

export class AgentBackendUnavailableError extends Error {
  constructor(readonly backendId: string) {
    super(`Agent backend "${backendId}" is unavailable.`);
    this.name = "AgentBackendUnavailableError";
  }
}

export class CodexObservedBackend implements AgentBackend {
  readonly id = "codex";
  readonly kind = "codex-cli";

  constructor(
    private readonly transport: AgentProcessTaskTransport<AgentProcessRuntimeProbe>,
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
        governanceTier: probe.available ? "OBSERVED" : "OPAQUE",
        governanceMode: "none",
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
    if (input.governanceRequired) {
      throw new Error("Codex cannot start a task that requires governed execution.");
    }
    return this.transport.runTask(input, observe);
  }

  async stop(workerRunId: string): Promise<void> {
    await this.transport.stop?.(workerRunId);
  }
}

function normalizedVersion(version: string): string {
  return version.trim() || "unavailable";
}
