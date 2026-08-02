import { sha256Bytes } from "./canonical.js";
import { AgentEngineError, type AgentEngineIdentity } from "./types.js";

export const CODEWHALE_SOURCE_REPOSITORY = "https://github.com/Hmbown/CodeWhale";
export const CODEWHALE_SOURCE_COMMIT = "4f2c97b0d75c039a9b6069ebcf210cc499583376";
export const CODEWHALE_RUNTIME_VERSION = "0.9.3";
export const CODEWHALE_LICENSE = "MIT";

// Frozen from a deterministic git archive and the managed macOS x86_64 proof build.
export const CODEWHALE_SOURCE_ARCHIVE_SHA256 =
  "sha256:61b6c3ed704b732085fc7d7fe7c60e6061b97296ddc6d923e19270a5ca465f69";
export const CODEWHALE_EXECUTABLE_SHA256 =
  "sha256:88b9dc2f82e6aa55fe8c168b7ad7573e834d7af164960835f1ccda7a4559189f";

export const CODEWHALE_PINNED_IDENTITY: AgentEngineIdentity = Object.freeze({
  engineId: "codewhale",
  sourceRepository: CODEWHALE_SOURCE_REPOSITORY,
  sourceCommit: CODEWHALE_SOURCE_COMMIT,
  sourceArchiveSha256: CODEWHALE_SOURCE_ARCHIVE_SHA256,
  executableSha256: CODEWHALE_EXECUTABLE_SHA256,
  transport: "authenticated_loopback_http_sse",
});

export function assertPinnedIdentity(identity: AgentEngineIdentity): void {
  for (const key of Object.keys(CODEWHALE_PINNED_IDENTITY) as (keyof AgentEngineIdentity)[]) {
    if (identity[key] !== CODEWHALE_PINNED_IDENTITY[key]) {
      throw new AgentEngineError("identity_mismatch", `CodeWhale ${key} does not match the pinned identity.`);
    }
  }
}

export async function verifyExecutableDigest(bytes: Uint8Array): Promise<void> {
  const actual = await sha256Bytes(bytes);
  if (actual !== CODEWHALE_EXECUTABLE_SHA256) {
    throw new AgentEngineError("digest_mismatch", "CodeWhale executable digest does not match the pinned proof build.");
  }
}

export async function verifyArchiveDigest(bytes: Uint8Array): Promise<void> {
  const actual = await sha256Bytes(bytes);
  if (actual !== CODEWHALE_SOURCE_ARCHIVE_SHA256) {
    throw new AgentEngineError("digest_mismatch", "CodeWhale source archive digest does not match the pinned archive.");
  }
}
