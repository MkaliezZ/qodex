export function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease?: string } | null {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+[\w.]+)?$/);
  if (!m) return null;
  return { major: parseInt(m[1]), minor: parseInt(m[2]), patch: parseInt(m[3]), prerelease: m[4] };
}
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a), vb = parseVersion(b);
  if (!va || !vb) throw new Error("Invalid SemVer");
  for (const k of ["major","minor","patch"] as const) {
    if (va[k] !== vb[k]) return va[k] - vb[k];
  }
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  return 0;
}
export function isUpdateAvailable(installed: string, available: string): boolean { return compareVersions(available, installed) > 0; }
export function satisfiesCompatibility(qodexVersion: string, range: string): boolean { return range.startsWith(">=") ? compareVersions(qodexVersion, range.slice(2)) >= 0 : compareVersions(qodexVersion, range) >= 0; }
