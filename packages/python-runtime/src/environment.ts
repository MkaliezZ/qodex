const ALLOWED_ENVIRONMENT_KEYS = new Set([
  "PATH",
  "SYSTEMROOT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
]);

export function buildManagedPythonEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  bridgeConfiguration: Readonly<Record<string, string>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (ALLOWED_ENVIRONMENT_KEYS.has(key) && value !== undefined) {
      environment[key] = value;
    }
  }
  for (const [key, value] of Object.entries(bridgeConfiguration)) {
    if (!key.startsWith("KERNIQ_BRIDGE_")) {
      throw new Error("Managed bridge configuration keys must use the KERNIQ_BRIDGE_ prefix.");
    }
    environment[key] = value;
  }
  environment.PYTHONNOUSERSITE = "1";
  environment.PYTHONDONTWRITEBYTECODE = "1";
  return environment;
}
