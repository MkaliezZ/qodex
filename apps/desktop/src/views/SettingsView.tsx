import { ProviderSettings } from "../components/ProviderSettings";

export function SettingsView() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: 12, letterSpacing: "0.05em" }}>
        Settings
      </div>

      {/* Provider Configuration */}
      <div style={{ marginBottom: 20 }}>
        <ProviderSettings />
      </div>

      {/* Theme */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Theme
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
          Dark
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 2 }}>
          Light theme coming soon.
        </div>
      </div>

      {/* Language */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Language
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
          English
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 2 }}>
          Internationalization in progress (M13).
        </div>
      </div>

      {/* Version */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Version
        </div>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          background: "rgba(91, 140, 255, 0.10)",
          border: "1px solid rgba(91, 140, 255, 0.15)",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "#5B8CFF",
        }}>
          v0.1.0-alpha
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 2 }}>
          Public alpha release.
        </div>
      </div>
    </div>
  );
}
