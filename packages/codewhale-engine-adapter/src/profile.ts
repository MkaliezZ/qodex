import { sha256Canonical, type CanonicalValue } from "./canonical.js";

export const CODEWHALE_MANAGED_PROFILE = Object.freeze({
  schemaVersion: "kerniq.codewhale.managed-profile.v1",
  mode: "plan",
  allowShell: false,
  approvalPolicy: "never",
  sandboxMode: "read-only",
  autoApprove: false,
  trustMode: false,
  projectConfig: "disabled",
  bindHost: "127.0.0.1",
  runtimeEntrypoint: "serve --http",
  mcp: "disabled",
  plugins: "disabled",
  externalTools: "disabled",
  fleet: "disabled",
  tasks: "disabled",
  automations: "disabled",
  execEntrypoint: "disabled",
  tui: "disabled",
  webUi: "disabled",
  acpServer: "disabled",
  mcpServer: "disabled",
  backgroundShell: "disabled",
  subagents: "disabled",
  updateChecks: "disabled",
  memoryWrites: "disabled",
}) as Readonly<Record<string, CanonicalValue>>;

export async function managedProfileDigest(): Promise<string> {
  return sha256Canonical(CODEWHALE_MANAGED_PROFILE);
}

export function assertManagedProfile(profile: Readonly<Record<string, CanonicalValue>>): void {
  const expected = JSON.stringify(CODEWHALE_MANAGED_PROFILE);
  if (JSON.stringify(profile) !== expected) {
    throw new TypeError("The CodeWhale managed profile may not be loosened or extended.");
  }
}

const INHERITED_ENV_ALLOWLIST = new Set([
  "LANG",
  "LC_ALL",
  "PATH",
  "SystemRoot",
  "TMPDIR",
  "WINDIR",
]);

export interface ManagedEnvironmentInput {
  readonly inherited: Readonly<Record<string, string | undefined>>;
  readonly managedHome: string;
  readonly configPath: string;
  readonly managedConfigPath: string;
  readonly requirementsPath: string;
  readonly runtimeToken: string;
}

export function buildManagedEnvironment(input: ManagedEnvironmentInput): Record<string, string> {
  assertRuntimeToken(input.runtimeToken);
  const environment: Record<string, string> = {};
  for (const key of [...INHERITED_ENV_ALLOWLIST].sort()) {
    const value = input.inherited[key];
    if (value) environment[key] = value;
  }
  return {
    ...environment,
    HOME: input.managedHome,
    CODEWHALE_HOME: input.managedHome,
    CODEWHALE_CONFIG_PATH: input.configPath,
    CODEWHALE_MANAGED_CONFIG_PATH: input.managedConfigPath,
    CODEWHALE_REQUIREMENTS_PATH: input.requirementsPath,
    CODEWHALE_RUNTIME_TOKEN: input.runtimeToken,
    NO_COLOR: "1",
  };
}

export function assertRuntimeToken(token: string): void {
  if (!/^cwrt_[A-Za-z0-9_-]{43,}$/u.test(token)) {
    throw new TypeError("The CodeWhale runtime token must contain at least 256 bits of URL-safe entropy.");
  }
}

export function redactRuntimeToken(value: string, token: string): string {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value
    .replace(new RegExp(escaped, "gu"), "[REDACTED_RUNTIME_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED_RUNTIME_TOKEN]");
}
