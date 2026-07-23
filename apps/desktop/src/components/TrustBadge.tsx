import type { TrustLevel } from "@qodex/marketplace-runtime";
import { BadgeCheck, CircleAlert, Gem, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const labels: Record<TrustLevel, { icon: LucideIcon | null; label: string }> = {
  local: { icon: null, label: "" },
  community: { icon: Gem, label: "Community" },
  verified: { icon: BadgeCheck, label: "Verified" },
  official: { icon: ShieldCheck, label: "Official" },
  blocked: { icon: CircleAlert, label: "Blocked" },
};

export function TrustBadge({ level, warnings }: { level: TrustLevel; warnings?: string[] }) {
  const item = labels[level] ?? labels.community;
  if (level === "local") return null;
  const Icon = item.icon;
  return (
    <span className={`trust-badge trust-badge-${level}`}>
      {Icon ? <Icon className="trust-badge-icon" size={12} aria-hidden="true" /> : null}
      {item.label}
      {warnings && warnings.length > 0 && <span className="trust-warning">{warnings[0]}</span>}
    </span>
  );
}
