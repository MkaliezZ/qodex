export function SkillDrawer() {
  return (
    <button
      className="qodex-button qodex-button-secondary"
      style={{
        height: 26,
        padding: "0 8px",
        borderRadius: 6,
        fontSize: 11,
        gap: 3,
        color: "rgba(255,255,255,0.40)",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "transparent",
      }}
      title="Insert skill"
    >
      <span style={{ fontSize: 12, opacity: 0.6 }}>/</span>
      <span>skill</span>
    </button>
  );
}
