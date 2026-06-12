export function SessionsView() {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 32 }}>
      <div className="empty-state-icon">⌛</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.25)" }}>Session history coming soon</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.15)", textAlign: "center", maxWidth: 260 }}>
        Sessions, task history, and agent conversations will appear here in a future update.
      </div>
    </div>
  );
}
