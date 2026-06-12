import type { RegistryEntry } from "@qodex/marketplace-runtime";
import { TrustBadge } from "./TrustBadge";

const cardStyle: React.CSSProperties = { padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, cursor: "pointer" };

export function RegistryEntryCard({ entry, onClick }: { entry: RegistryEntry; onClick: () => void }) {
  const blocked = entry.trust?.level === "blocked";
  return (
    <div onClick={onClick} style={{ ...cardStyle, opacity: blocked ? 0.5 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{entry.name}</span>
        <TrustBadge level={entry.trust?.level ?? "community"} warnings={entry.trust?.warnings} />
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{entry.description}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
        <span>v{entry.latestVersion}</span>
        <span>·</span>
        <span>{entry.publisher.name}</span>
        {entry.tags.map((t: string) => <span key={t} style={{ background: "rgba(255,255,255,0.04)", padding: "0 4px", borderRadius: 4 }}>{t}</span>)}
      </div>
    </div>
  );
}

export function RegistryEntryDetail({ entry, onClose }: { entry: RegistryEntry; onClose: () => void }) {
  const blocked = entry.trust?.level === "blocked";
  return (
    <div style={{ padding: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{entry.name}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.30)", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 6 }}>{entry.description}</div>
      <TrustBadge level={entry.trust?.level ?? "community"} warnings={entry.trust?.warnings} />
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.30)", marginTop: 6 }}>
        <div>Publisher: {entry.publisher.name}</div>
        <div>Version: {entry.latestVersion}</div>
        <div>Compatibility: {entry.compatibility.qodexVersion}</div>
        {blocked && <div style={{ color: "#FF5C7A", fontWeight: 600, marginTop: 4 }}>This package is blocked and cannot be installed.</div>}
      </div>
      {!blocked && <button style={{ marginTop: 8, padding: "4px 12px", background: "rgba(91,140,255,0.15)", border: "1px solid rgba(91,140,255,0.20)", borderRadius: 6, color: "#5B8CFF", fontSize: 12, cursor: "pointer" }}>Install</button>}
    </div>
  );
}
