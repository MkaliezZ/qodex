export function GitView() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: 12, letterSpacing: "0.05em" }}>
        Repository
      </div>

      {/* Branch */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Current Branch
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            background: "rgba(77, 255, 157, 0.10)",
            border: "1px solid rgba(77, 255, 157, 0.15)",
            borderRadius: 6,
            padding: "3px 8px",
            fontSize: 12,
            fontWeight: 500,
            color: "#4DFF9D",
          }}>
            main
          </div>
        </div>
      </div>

      {/* Checkpoints */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Checkpoints
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>
          Not available in development mode.
        </div>
      </div>

      {/* Status */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.40)", marginBottom: 4 }}>
          Repository Status
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
          <span>No repository detected</span>
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", marginTop: 4 }}>
          Git integration is available in production builds.
        </div>
      </div>
    </div>
  );
}
