import type {
  AgentBackendTaskInput,
  AgentBackendTaskOutput,
  AgentObservation,
  GovernanceMode,
} from "../types.js";

export interface AgentProcessRuntimeProbe {
  readonly available: boolean;
  readonly version: string;
  readonly model?: string;
  readonly supportsStreaming: boolean;
  readonly supportsCancel: boolean;
  readonly supportsToolEvents: boolean;
  readonly supportsResume: boolean;
}

export interface AgentProcessTaskTransport<Probe extends AgentProcessRuntimeProbe> {
  probe(): Promise<Probe>;
  runTask(
    input: AgentBackendTaskInput,
    observe: (observation: AgentObservation) => void,
  ): Promise<AgentBackendTaskOutput>;
  stop?(workerRunId: string): Promise<void>;
}

export interface DshGovernanceProbe {
  readonly mode: GovernanceMode;
  readonly compatibleRuntime: boolean;
  readonly agentFuseAdapterAvailable: boolean;
  readonly agentFuseVersion?: string;
  readonly preDispatchSeamAvailable: boolean;
  readonly productionObserverAvailable: boolean;
  readonly governedProfileValid: boolean;
  readonly evidenceCaptureAvailable: boolean;
}

export interface DshRuntimeProbe extends AgentProcessRuntimeProbe {
  readonly runtimeRevision?: string;
  readonly providerRoute?: string;
  readonly governance: DshGovernanceProbe;
}
