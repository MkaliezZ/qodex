import type { TrustLevel } from "../../../../packages/marketplace-runtime/src/index";

const styles: Record<TrustLevel, { color: string; label: string }> = {
  local: { color: "rgba(255,255,255,0.30)", label: "" },
  community: { color: "#F0A050", label: "Community" },
  verified: { color: "#4FFFC2", label: "✓ Verified" },
  official: { color: "#5B8CFF", label: "Official" },
  blocked: { color: "#FF5C7A", label: "⚠ Blocked" },
};

export function TrustBadge({ level, warnings }: { level: TrustLevel; warnings?: string[] }) {
  const s = styles[level] ?? styles.community;
  if (level === "local") return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: s.color }}>
      {s.label}
      {warnings && warnings.length > 0 && <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginLeft: 4 }}>{warnings[0]}</span>}
    </span>
  );
}
