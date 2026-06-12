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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: 10, letterSpacing: "0.05em" }}>Marketplace</div>
      <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
        {(["discover", "updates"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", border: "1px solid transparent",
              background: tab === t ? "rgba(91,140,255,0.10)" : "transparent",
              borderColor: tab === t ? "rgba(91,140,255,0.15)" : "transparent",
              color: tab === t ? "#5B8CFF" : "rgba(255,255,255,0.30)", fontWeight: tab === t ? 600 : 400 }}>
            {t === "discover" ? "Discover" : "Updates"}
          </button>
        ))}
      </div>

      {tab === "discover" && (
        <>
          <input style={{ width: "100%", padding: "6px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", marginBottom: 10 }}
            placeholder="Search registry..." value={query} onChange={(e) => { setQuery(e.target.value); search(e.target.value); setDetailId(null); }} />

          {detail ? (
            <RegistryEntryDetail entry={detail} onClose={() => setDetailId(null)} />
          ) : searchResults.length === 0 ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.20)", textAlign: "center", padding: 20 }}>
              {query ? "No matching skills found." : "Search for skills to discover."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto", flex: 1 }}>
              {searchResults.map((e) => (
                <RegistryEntryCard key={e.id} entry={e} onClick={() => { selectEntry(e.id); setDetailId(e.id); }} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "updates" && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.20)", textAlign: "center", padding: 20 }}>
          Update detection coming soon. Check back after installing registry skills.
        </div>
      )}
    </div>
  );
}
