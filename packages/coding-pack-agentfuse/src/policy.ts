import {
  CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
  CODING_PACK_AGENTFUSE_EXPORT_TOOL,
  sha256Canonical,
} from "@qodex/coding-pack-store";

export const AGENTFUSE_SOURCE_REPOSITORY = "MkaliezZ/dhms-engine";
export const AGENTFUSE_SOURCE_COMMIT =
  "ec4b5842339dccfba0db62df7541920759203bc9";
export const AGENTFUSE_PACKAGE_VERSION = "3.6.0";
export const AGENTFUSE_BRIDGE_PROTOCOL = "kerniq.agentfuse.bridge.v1";
export const AGENTFUSE_EVIDENCE_SCHEMA = "agentfuse-evidence-schema-v0.1";
export const AGENTFUSE_POLICY_VERSION = "dhms-agentfuse-runtime-guard@3.6.0";

export const CODING_PACK_EXPORT_PROTOCOL =
  CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL;
export const CODING_PACK_EXPORT_TOOL = CODING_PACK_AGENTFUSE_EXPORT_TOOL;
export const CODING_PACK_EXPORT_POLICY_ID = "kerniq-coding-pack-export-v1";
export const CODING_PACK_EXPORT_FORMAT = "kerniq-coding-pack-bundle-v1";
export const CODING_PACK_EXPORT_POLICY_DIGEST =
  "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07";

export const CODING_PACK_EXPORT_POLICY = Object.freeze({
  protocolVersion: CODING_PACK_EXPORT_PROTOCOL,
  toolIdentity: CODING_PACK_EXPORT_TOOL,
  policyProfileId: CODING_PACK_EXPORT_POLICY_ID,
  exportFormat: CODING_PACK_EXPORT_FORMAT,
  approvalEvidence: "PACK_CONFIRMED.payloadDigest",
  decision: "allow_exact_trusted_request_only",
} as const);

export async function trustedCodingPackExportPolicyDigest(): Promise<string> {
  const digest = await sha256Canonical(CODING_PACK_EXPORT_POLICY);
  if (digest !== CODING_PACK_EXPORT_POLICY_DIGEST) {
    throw new TypeError("The Coding Pack export policy identity is invalid.");
  }
  return digest;
}
