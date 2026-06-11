import { useRuntimeContext } from "./AppShell";

export function DiffViewer() {
  const { currentProposal, applyProposal, rejectProposal, pendingProposal } =
    useRuntimeContext();

  if (!pendingProposal && !currentProposal) {
    return (
      <div className="glass-panel-subtle" style={{ padding: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div
            className="section-title"
            style={{ padding: 0, border: "none", fontSize: 11 }}
          >
            Diff Preview
          </div>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 16px 32px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(255,255,255,0.35)",
            letterSpacing: "0.01em",
          }}>
            No changes to review.
          </div>
          <div style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.18)",
            marginTop: 4,
          }}>
            Diffs will appear here after agent actions.
          </div>
        </div>
      </div>
    );
  }

  const proposal = pendingProposal ?? currentProposal!;
  const isPending = pendingProposal !== null;

  return (
    <div className="glass-panel-subtle" style={{ padding: 12 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          className="section-title"
          style={{ padding: 0, border: "none", fontSize: 11 }}
        >
          Diff Preview — {proposal.files.length} file
          {proposal.files.length !== 1 ? "s" : ""}
        </div>
        {isPending && (
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="qodex-button qodex-button-secondary"
              onClick={rejectProposal}
              style={{
                height: 24,
                padding: "0 10px",
                fontSize: 11,
                borderRadius: 6,
                gap: 4,
              }}
            >
              ✕ Reject
            </button>
            <button
              className="qodex-button"
              onClick={applyProposal}
              style={{
                height: 24,
                padding: "0 10px",
                fontSize: 11,
                borderRadius: 6,
                gap: 4,
              }}
            >
              ✓ Apply
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div
        className="text-caption"
        style={{
          fontSize: 11,
          marginBottom: 8,
          padding: "6px 8px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 6,
        }}
      >
        {proposal.summary}
      </div>

      {/* File diffs */}
      {proposal.files.map((file) => (
        <div key={file.path} style={{ marginBottom: 8 }}>
          <div
            className="text-code"
            style={{
              fontSize: 11,
              padding: "4px 8px",
              background: "rgba(91, 140, 255, 0.06)",
              borderRadius: 6,
              marginBottom: 4,
              color: "#5B8CFF",
              fontWeight: 600,
            }}
          >
            {file.path}
          </div>

          {/* Diff lines */}
          {(() => {
            const oldLines = file.oldContent.split("\n");
            const newLines = file.newContent.split("\n");
            const maxLen = Math.max(oldLines.length, newLines.length);
            const lines: { type: "same" | "add" | "del"; text: string }[] = [];

            for (let i = 0; i < maxLen; i++) {
              if (
                i < oldLines.length &&
                i < newLines.length &&
                oldLines[i] === newLines[i]
              ) {
                lines.push({ type: "same", text: oldLines[i] });
              } else {
                if (i < oldLines.length)
                  lines.push({ type: "del", text: oldLines[i] });
                if (i < newLines.length)
                  lines.push({ type: "add", text: newLines[i] });
              }
            }

            const adds = lines.filter((l) => l.type === "add").length;
            const dels = lines.filter((l) => l.type === "del").length;

            return (
              <>
                <div
                  className="text-caption"
                  style={{ fontSize: 10, marginBottom: 4, display: "flex", gap: 12 }}
                >
                  <span style={{ color: "#4DFF9D" }}>+{adds}</span>
                  <span style={{ color: "#FF5C7A" }}>-{dels}</span>
                </div>
                <div
                  className="text-code"
                  style={{
                    background: "rgba(0,0,0,0.15)",
                    borderRadius: 6,
                    padding: "4px 0",
                    maxHeight: 200,
                    overflow: "auto",
                    fontSize: 11,
                    lineHeight: 1.5,
                  }}
                >
                  {lines.slice(0, 50).map((l, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "1px 8px",
                        background:
                          l.type === "add"
                            ? "rgba(77, 255, 157, 0.06)"
                            : l.type === "del"
                              ? "rgba(255, 92, 122, 0.06)"
                              : "transparent",
                        color:
                          l.type === "add"
                            ? "#4DFF9D"
                            : l.type === "del"
                              ? "#FF5C7A"
                              : "rgba(255,255,255,0.45)",
                      }}
                    >
                      {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
                      {l.text}
                    </div>
                  ))}
                  {lines.length > 50 && (
                    <div
                      className="text-caption"
                      style={{
                        padding: "4px 8px",
                        textAlign: "center",
                        fontSize: 10,
                      }}
                    >
                      ... {lines.length - 50} more lines
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      ))}

      {/* Applied status */}
      {!isPending && currentProposal && (
        <div
          className="text-caption"
          style={{
            fontSize: 11,
            textAlign: "center",
            padding: 6,
            color: "#4FFFC2",
          }}
        >
          ✓ Applied
        </div>
      )}
    </div>
  );
}
