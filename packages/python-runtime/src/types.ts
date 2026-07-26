export type ManagedPythonRuntimeState =
  | "NotInstalled"
  | "Provisioning"
  | "Ready"
  | "Broken"
  | "UpgradeAvailable"
  | "Removing";

export interface RuntimeArtifact {
  platform: "macos" | "windows" | "linux";
  architecture: "x86_64" | "aarch64";
  url: string;
  archiveSha256: string;
  installedTreeSha256: string;
  archiveFormat: "tar.gz";
  expectedExecutable: string;
}

export interface AgentFuseSourceArtifact {
  repository: string;
  commit: string;
  packageVersion: string;
  url: string;
  archiveSha256: string;
  installedTreeSha256: string;
  archiveFormat: "tar.gz";
  expectedModule: string;
}

export interface ManagedPythonManifest {
  manifestVersion: "kerniq.python-runtime-manifest.v1";
  runtimeVersion: string;
  pythonVersion: string;
  distribution: {
    publisher: string;
    release: string;
    license: string;
    artifacts: RuntimeArtifact[];
  };
  agentFuse: AgentFuseSourceArtifact;
  bridge: {
    installedTreeSha256: string;
  };
  bridgeProtocolVersion: "kerniq.agentfuse.bridge.v1";
  decisionSchemaVersion: string;
  installedPackageLock: {
    mode: "verified-source-no-site-packages";
    packages: readonly [];
  };
}

export interface ManagedPythonRuntimeInfo {
  state: ManagedPythonRuntimeState;
  runtimeVersion: string;
  pythonVersion: string | null;
  agentFuseCommit: string;
  bridgeProtocolVersion: string;
  integrity: "not_installed" | "verified" | "failed" | "unknown";
  lastVerifiedAt: string | null;
  message: string;
}

export interface AgentFuseSelfCheckResult {
  handshakeMatched: boolean;
  canonicalImport: boolean;
  allowDecision: "allow" | "deny" | "hold" | "error";
  denyDecision: "allow" | "deny" | "hold" | "error";
  denyHandlerInvocations: number;
  agentFuseCommit: string;
  pythonVersion: string;
  bridgeProtocolVersion: string;
}

export interface NativeManagedPythonBridge {
  inspectRuntime(): Promise<ManagedPythonRuntimeInfo>;
  provisionRuntime(): Promise<ManagedPythonRuntimeInfo>;
  verifyRuntime(): Promise<ManagedPythonRuntimeInfo>;
  removeRuntime(): Promise<ManagedPythonRuntimeInfo>;
  selfCheck(): Promise<AgentFuseSelfCheckResult>;
}
