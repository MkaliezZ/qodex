export function SkillsView() {
  const skills = [
    { name: "General", enabled: true, builtin: true },
    { name: "TypeScript", enabled: true, builtin: true },
    { name: "React", enabled: false, builtin: true },
  ];

  const enabledCount = skills.filter((s) => s.enabled).length;
  const totalCount = skills.length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.30)", marginBottom: 8, letterSpacing: "0.05em" }}>
        Loaded Skills · {totalCount}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", marginBottom: 12 }}>
        {enabledCount} enabled
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {skills.map((skill) => (
          <div
            key={skill.name}
            className="skill-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12,
              cursor: "default",
              opacity: skill.enabled ? 1 : 0.45,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>
                {skill.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                {skill.enabled ? "Enabled" : "Disabled"} · Built-in
              </div>
            </div>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: skill.enabled ? "#4DFF9D" : "rgba(255,255,255,0.10)",
                flexShrink: 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
