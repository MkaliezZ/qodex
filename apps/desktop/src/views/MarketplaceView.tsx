import { useState } from "react";
import { useRegistryContext } from "../components/RegistryContext";
import { RegistryEntryCard, RegistryEntryDetail } from "../components/RegistryEntryCard";

export function MarketplaceView() {
  const { search, searchResults, selectEntry } = useRegistryContext();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"discover" | "updates">("discover");
  const [detailId, setDetailId] = useState<string | null>(null);

  const detail = detailId ? searchResults.find((e) => e.id === detailId) ?? null : null;

  return (
    <div className="view-page marketplace-view">
      <header className="view-header marketplace-header">
        <div>
          <div className="view-eyebrow">Curated for local agents</div>
          <h1>Marketplace</h1>
          <p>Discover trusted skills and integrations for your KerniQ workbench.</p>
        </div>
        <div className="marketplace-orbit" aria-hidden="true"><span>Q</span></div>
      </header>

      <div className="marketplace-toolbar">
        <div className="pill-tabs">
          {(["discover", "updates"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "pill-tab pill-tab-active" : "pill-tab"}>
              {t === "discover" ? "Discover" : "Updates"}
              {t === "updates" && <span className="tab-count">0</span>}
            </button>
          ))}
        </div>
        <span className="marketplace-security">Verified registry metadata</span>
      </div>

      {tab === "discover" && (
        <div className="marketplace-content">
          <div className="search-shell">
            <span className="search-icon">/</span>
            <input
              className="marketplace-search"
              placeholder="Search skills, providers, or capabilities..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); setDetailId(null); }}
            />
            <span className="search-shortcut">⌘ K</span>
          </div>

          {detail ? (
            <RegistryEntryDetail entry={detail} onClose={() => setDetailId(null)} />
          ) : searchResults.length === 0 ? (
            <div className="marketplace-empty">
              <div className="marketplace-empty-art"><span>Q</span></div>
              <div className="view-eyebrow">{query ? "No matches" : "Registry ready"}</div>
              <h2>{query ? "Nothing matched that search" : "Find your next capability"}</h2>
              <p>{query ? "Try another name, publisher, or capability." : "Search connected registries for trusted skills, tools, and agent integrations."}</p>
              <div className="empty-hints"><span>Local-first</span><span>Trust metadata</span><span>Version aware</span></div>
            </div>
          ) : (
            <div className="registry-results">
              <div className="results-heading"><span>{searchResults.length} result{searchResults.length === 1 ? "" : "s"}</span><span>Registry entries</span></div>
              <div className="registry-card-grid">
                {searchResults.map((e) => (
                  <RegistryEntryCard key={e.id} entry={e} onClick={() => { selectEntry(e.id); setDetailId(e.id); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "updates" && (
        <div className="marketplace-empty">
          <div className="marketplace-empty-art marketplace-empty-art-update"><span>↻</span></div>
          <div className="view-eyebrow">Everything current</div>
          <h2>No updates available</h2>
          <p>Installed registry skills and their available updates will appear here.</p>
        </div>
      )}
    </div>
  );
}
