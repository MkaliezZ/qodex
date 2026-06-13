import type { RegistryEntry } from "@qodex/marketplace-runtime";
import { TrustBadge } from "./TrustBadge";

export function RegistryEntryCard({ entry, onClick }: { entry: RegistryEntry; onClick: () => void }) {
  const blocked = entry.trust?.level === "blocked";
  return (
    <button onClick={onClick} className={`registry-entry-card${blocked ? " registry-entry-blocked" : ""}`}>
      <div className="registry-entry-topline">
        <div className="registry-entry-mark">{entry.name.slice(0, 1).toUpperCase()}</div>
        <TrustBadge level={entry.trust?.level ?? "community"} warnings={entry.trust?.warnings} />
      </div>
      <div className="registry-entry-copy">
        <h3>{entry.name}</h3>
        <p>{entry.description}</p>
      </div>
      <div className="registry-entry-footer">
        <span>v{entry.latestVersion}</span>
        <span>{entry.publisher.name}</span>
        <div className="registry-entry-tags">
          {entry.tags.slice(0, 2).map((t: string) => <span key={t}>{t}</span>)}
        </div>
      </div>
    </button>
  );
}

export function RegistryEntryDetail({ entry, onClose }: { entry: RegistryEntry; onClose: () => void }) {
  const blocked = entry.trust?.level === "blocked";
  return (
    <div className={`registry-entry-detail${blocked ? " registry-entry-detail-blocked" : ""}`}>
      <div className="registry-detail-header">
        <div className="registry-entry-mark registry-detail-mark">{entry.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <div className="view-eyebrow">Registry entry</div>
          <h2>{entry.name}</h2>
        </div>
        <button onClick={onClose} className="detail-close" aria-label="Close detail">×</button>
      </div>
      <p className="registry-detail-description">{entry.description}</p>
      <TrustBadge level={entry.trust?.level ?? "community"} warnings={entry.trust?.warnings} />
      <div className="registry-detail-grid">
        <div><span>Publisher</span><strong>{entry.publisher.name}</strong></div>
        <div><span>Version</span><strong>{entry.latestVersion}</strong></div>
        <div><span>Compatibility</span><strong>{entry.compatibility.qodexVersion}</strong></div>
      </div>
      {blocked && <div className="blocked-notice">This package is blocked and cannot be installed.</div>}
      {!blocked && <button className="qodex-button registry-install-button">Install skill</button>}
    </div>
  );
}
