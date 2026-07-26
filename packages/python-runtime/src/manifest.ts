import { PythonRuntimeError } from "./errors.js";
import type { ManagedPythonManifest, RuntimeArtifact } from "./types.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function parseRuntimeManifest(value: unknown): ManagedPythonManifest {
  if (!isRecord(value)) throw invalidManifest();
  if (value.manifestVersion !== "kerniq.python-runtime-manifest.v1") throw invalidManifest();
  if (
    !text(value.runtimeVersion)
    || !text(value.pythonVersion)
    || value.bridgeProtocolVersion !== "kerniq.agentfuse.bridge.v1"
    || !text(value.decisionSchemaVersion)
  ) {
    throw invalidManifest();
  }
  const distribution = value.distribution;
  const agentFuse = value.agentFuse;
  const bridge = value.bridge;
  const lock = value.installedPackageLock;
  if (
    !isRecord(distribution)
    || !text(distribution.publisher)
    || !text(distribution.release)
    || !text(distribution.license)
    || !Array.isArray(distribution.artifacts)
    || distribution.artifacts.length === 0
    || !isRecord(agentFuse)
    || !isRecord(bridge)
    || !sha256(bridge.installedTreeSha256)
    || !isRecord(lock)
    || lock.mode !== "verified-source-no-site-packages"
    || !Array.isArray(lock.packages)
    || lock.packages.length !== 0
  ) {
    throw invalidManifest();
  }
  const artifacts = distribution.artifacts.map(parseArtifact);
  if (
    !text(agentFuse.repository)
    || !text(agentFuse.commit)
    || !/^[0-9a-f]{40}$/.test(agentFuse.commit)
    || !text(agentFuse.packageVersion)
    || !httpsUrl(agentFuse.url)
    || !sha256(agentFuse.archiveSha256)
    || !sha256(agentFuse.installedTreeSha256)
    || agentFuse.archiveFormat !== "tar.gz"
    || !text(agentFuse.expectedModule)
  ) {
    throw invalidManifest();
  }
  return {
    manifestVersion: "kerniq.python-runtime-manifest.v1",
    runtimeVersion: value.runtimeVersion,
    pythonVersion: value.pythonVersion,
    distribution: {
      publisher: distribution.publisher,
      release: distribution.release,
      license: distribution.license,
      artifacts,
    },
    agentFuse: {
      repository: agentFuse.repository,
      commit: agentFuse.commit,
      packageVersion: agentFuse.packageVersion,
      url: agentFuse.url,
      archiveSha256: agentFuse.archiveSha256,
      installedTreeSha256: agentFuse.installedTreeSha256,
      archiveFormat: "tar.gz",
      expectedModule: agentFuse.expectedModule,
    },
    bridge: {
      installedTreeSha256: bridge.installedTreeSha256,
    },
    bridgeProtocolVersion: "kerniq.agentfuse.bridge.v1",
    decisionSchemaVersion: value.decisionSchemaVersion,
    installedPackageLock: {
      mode: "verified-source-no-site-packages",
      packages: [],
    },
  };
}

export function selectRuntimeArtifact(
  manifest: ManagedPythonManifest,
  platform: RuntimeArtifact["platform"],
  architecture: RuntimeArtifact["architecture"],
): RuntimeArtifact {
  const artifact = manifest.distribution.artifacts.find(
    (candidate) => candidate.platform === platform && candidate.architecture === architecture,
  );
  if (!artifact) {
    throw new PythonRuntimeError(
      "unsupported_platform",
      "No trusted managed Python artifact is available for this platform.",
    );
  }
  return artifact;
}

function parseArtifact(value: unknown): RuntimeArtifact {
  if (
    !isRecord(value)
    || !["macos", "windows", "linux"].includes(String(value.platform))
    || !["x86_64", "aarch64"].includes(String(value.architecture))
    || !httpsUrl(value.url)
    || !sha256(value.archiveSha256)
    || !sha256(value.installedTreeSha256)
    || value.archiveFormat !== "tar.gz"
    || !text(value.expectedExecutable)
  ) {
    throw invalidManifest();
  }
  return value as unknown as RuntimeArtifact;
}

function invalidManifest(): PythonRuntimeError {
  return new PythonRuntimeError("invalid_manifest", "Managed Python runtime manifest is invalid.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function httpsUrl(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function sha256(value: unknown): value is string {
  return text(value)
    && SHA256_PATTERN.test(value)
    && value !== "0".repeat(64);
}
