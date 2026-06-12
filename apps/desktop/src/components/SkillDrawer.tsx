import { useState } from "react";
import { useRuntimeContext } from "./AppShell";

export function SkillDrawer() {
  const [open, setOpen] = useState(false);
  const { setActiveView } = useRuntimeContext();

  return (
    <div style={{ position: "relative" }}>
      <button
        className="qodex-button qodex-button-secondary"
        onClick={() => setOpen(!open)}
        style={{
          height: 26,
          padding: "0 8px",
          borderRadius: 6,
          fontSize: 11,
          gap: 3,
          color: "rgba(255,255,255,0.40)",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "transparent",
          cursor: "pointer",
        }}
        title="Insert skill"
      >
        <span style={{ fontSize: 12, opacity: 0.6 }}>/</span>
        <span>skill</span>
      </button>
      {open && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 4,
              minWidth: 200,
              background: "rgba(20, 24, 36, 0.95)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 10,
              padding: 4,
              zIndex: 100,
            }}
          >
            <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", cursor: "default" }}>
              Loaded Skills
            </div>
            <div style={{ padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.50)", cursor: "default", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4DFF9D", flexShrink: 0 }} />
              General
            </div>
            <div style={{ padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.50)", cursor: "default", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4DFF9D", flexShrink: 0 }} />
              TypeScript
            </div>
            <div style={{ padding: "6px 10px", fontSize: 12, color: "rgba(255,255,255,0.25)", cursor: "default", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.10)", flexShrink: 0 }} />
              React
            </div>
            <div
              onClick={() => {
                setOpen(false);
                setActiveView("skills");
              }}
              style={{
                padding: "6px 10px",
                fontSize: 11,
                color: "#5B8CFF",
                cursor: "pointer",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                marginTop: 4,
              }}
            >
              Manage skills →
            </div>
          </div>
        </>
      )}
    </div>
  );
}
