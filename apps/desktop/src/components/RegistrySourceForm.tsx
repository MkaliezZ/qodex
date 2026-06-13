import { useState } from "react";
import { useRegistryContext } from "./RegistryContext";

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
    <div className="registry-source-form">
      <div className="source-list">
        {sources.length === 0 && (
          <div className="inline-empty-state">
            <div className="inline-empty-icon">+</div>
            <div><strong>No registry sources yet</strong><span>Add a secure HTTPS source to begin discovering marketplace entries.</span></div>
          </div>
        )}
        {sources.map((s) => (
          <div key={s.id} className="source-row">
            <div className="source-icon">R</div>
            <div className="source-meta">
              <strong>{s.name}</strong>
              <span>{s.url}</span>
            </div>
            <span className="source-enabled"><span className="status-dot status-dot-active" /> Enabled</span>
            <button onClick={() => removeSource(s.id)} className="qodex-button qodex-button-danger qodex-button-small">Remove</button>
          </div>
        ))}
      </div>

      <div className="source-add-panel">
        <div className="field-group">
          <label>Source name</label>
          <input placeholder="Official registry" className="qodex-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-group field-group-grow">
          <label>HTTPS endpoint</label>
          <input placeholder="https://registry.example.com" className="qodex-input" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button onClick={handleAdd} className="qodex-button source-add-button">Add source</button>
      </div>
      {error && <div className="form-error">{error}</div>}

      {sources.length > 0 && (
        <div className="source-actions">
          <button onClick={() => sync()} disabled={syncStatus === "syncing"} className="qodex-button qodex-button-secondary qodex-button-small">
            {syncStatus === "syncing" ? "Syncing..." : "Sync now"}
          </button>
          <span>{sources.length} source{sources.length === 1 ? "" : "s"} configured</span>
        </div>
      )}
    </div>
  );
}
