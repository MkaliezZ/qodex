import { useState } from "react";
import { useRegistryContext } from "./RegistryContext";

const inputStyle: React.CSSProperties = { width: "100%", padding: "5px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none" };
const btnStyle: React.CSSProperties = { padding: "4px 10px", background: "rgba(91,140,255,0.12)", border: "1px solid rgba(91,140,255,0.15)", borderRadius: 6, color: "#5B8CFF", fontSize: 11, cursor: "pointer" };

export function RegistrySourceForm() {
  const { sources, addSource, removeSource, sync, syncStatus } = useRegistryContext();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    if (!name.trim()) { setError("Name required"); return; }
    if (!url.trim()) { setError("URL required"); return; }
    if (!url.startsWith("https://")) { setError("URL must use HTTPS"); return; }
    try { addSource({ id: `src-${Date.now()}`, name: name.trim(), url: url.trim(), enabled: true, priority: 0 }); setName(""); setUrl(""); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Invalid source"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)" }}>Registry Sources</div>
      {sources.length === 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>No registry sources configured.</div>}
      {sources.map((s) => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.50)", padding: "4px 6px", background: "rgba(255,255,255,0.02)", borderRadius: 6 }}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name} — <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{s.url}</span></span>
          <button onClick={() => removeSource(s.id)} style={{ ...btnStyle, background: "rgba(255,80,100,0.10)", border: "1px solid rgba(255,80,100,0.15)", color: "#FF5C7A", fontSize: 10 }}>Remove</button>
        </div>
      ))}

      {/* Add source */}
      <div style={{ display: "flex", gap: 4 }}>
        <input placeholder="Name" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="https://..." style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} />
        <button onClick={handleAdd} style={btnStyle}>Add</button>
      </div>
      {error && <div style={{ fontSize: 11, color: "#FF5C7A" }}>{error}</div>}

      {/* Sync */}
      {sources.length > 0 && (
        <button onClick={() => sync()} disabled={syncStatus === "syncing"} style={{ ...btnStyle, opacity: syncStatus === "syncing" ? 0.5 : 1, width: "fit-content" }}>
          {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
        </button>
      )}
    </div>
  );
}
