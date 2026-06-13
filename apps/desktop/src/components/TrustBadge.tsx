import type { TrustLevel } from "@qodex/marketplace-runtime";

const labels: Record<TrustLevel, { icon: string; label: string }> = {
  local: { icon: "", label: "" },
  community: { icon: "◇", label: "Community" },
  verified: { icon: "✓", label: "Verified" },
  official: { icon: "✦", label: "Official" },
  blocked: { icon: "!", label: "Blocked" },
};

export function TrustBadge({ level, warnings }: { level: TrustLevel; warnings?: string[] }) {
  const item = labels[level] ?? labels.community;
  if (level === "local") return null;
  return (
    <span className={`trust-badge trust-badge-${level}`}>
      <span className="trust-badge-icon">{item.icon}</span>
      {item.label}
      {warnings && warnings.length > 0 && <span className="trust-warning">{warnings[0]}</span>}
    </span>
  );
}
