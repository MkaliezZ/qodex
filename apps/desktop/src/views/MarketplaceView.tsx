import { useState } from "react";
import { Package, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useRegistryContext } from "../components/RegistryContext";
import { RegistryEntryCard, RegistryEntryDetail } from "../components/RegistryEntryCard";
import { EmptyState, StatusIndicator, ViewTitle } from "../components/WorkbenchPrimitives";

export function MarketplaceView() {
  const { search, searchResults, selectEntry } = useRegistryContext();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"discover" | "updates">("discover");
  const [detailId, setDetailId] = useState<string | null>(null);

  const detail = detailId ? searchResults.find((e) => e.id === detailId) ?? null : null;

  return (
    <div className="workbench-view marketplace-view">
      <ViewTitle
        title="Marketplace"
        description="Discover skills and integrations from connected registries."
        icon={Package}
        aside={<StatusIndicator label="Beta" tone="accent" />}
      />

      <div className="marketplace-toolbar">
        <div className="pill-tabs">
          {(["discover", "updates"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "pill-tab pill-tab-active" : "pill-tab"}>
              {t === "discover" ? "Discover" : "Updates"}
              {t === "updates" && <span className="tab-count">0</span>}
            </button>
          ))}
        </div>
        <span className="marketplace-security"><ShieldCheck size={13} aria-hidden="true" /> Verified registry metadata</span>
      </div>

      {tab === "discover" && (
        <div className="marketplace-content">
          <div className="search-shell">
            <Search className="search-icon" size={15} aria-hidden="true" />
            <input
              className="marketplace-search"
              placeholder="Search skills, providers, or capabilities..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); search(e.target.value); setDetailId(null); }}
            />
            <span className="search-shortcut">Search</span>
          </div>

          {detail ? (
            <RegistryEntryDetail entry={detail} onClose={() => setDetailId(null)} />
          ) : searchResults.length === 0 ? (
            <EmptyState
              icon={Package}
              title={query ? "Nothing matched that search" : "Search the connected registries"}
              description={query
                ? "Try another name, publisher, or capability."
                : "Trusted skills, tools, and agent integrations will appear here."}
            />
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
        <EmptyState
          icon={RefreshCw}
          title="No updates available"
          description="Installed registry skills and available updates will appear here."
        />
      )}
    </div>
  );
}
