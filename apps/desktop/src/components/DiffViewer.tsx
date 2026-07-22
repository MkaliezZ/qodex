import { DiffGenerator } from "@qodex/diff-engine";
import type { PatchFile } from "@qodex/diff-engine";
import { useRuntimeContext } from "./AppShell";

const diffGenerator = new DiffGenerator();

function FileDiff({ file }: { file: PatchFile }) {
  const stats = diffGenerator.generateDiff(file);
  const unifiedDiff = diffGenerator.generateUnifiedDiff(file);

  return (
    <div data-testid="patch-file" style={{ marginBottom: 10 }}>
      <div
        className="text-code"
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          padding: "6px 8px",
          background: "rgba(91, 140, 255, 0.06)",
          borderRadius: 6,
          marginBottom: 4,
          color: "#7ba3ff",
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>{file.path}</span>
        <span style={{ fontWeight: 500 }}>
          <span style={{ color: "#4DFF9D" }}>+{stats.additions}</span>{" "}
          <span style={{ color: "#FF7892" }}>-{stats.deletions}</span>
        </span>
      </div>
      <div
        className="text-code"
        data-testid="patch-diff"
        style={{
          background: "rgba(0,0,0,0.2)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 6,
          padding: "5px 0",
          maxHeight: 240,
          overflow: "auto",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {unifiedDiff.split("\n").map((line, index) => {
          const kind = line.startsWith("+") && !line.startsWith("+++")
            ? "add"
            : line.startsWith("-") && !line.startsWith("---")
              ? "delete"
              : "context";
          return (
            <div
              key={`${index}-${line}`}
              style={{
                minWidth: "max-content",
                padding: "1px 8px",
                whiteSpace: "pre",
                background: kind === "add"
                  ? "rgba(77, 255, 157, 0.07)"
                  : kind === "delete"
                    ? "rgba(255, 92, 122, 0.07)"
                    : "transparent",
                color: kind === "add"
                  ? "#4DFF9D"
                  : kind === "delete"
                    ? "#FF7892"
                    : "rgba(255,255,255,0.5)",
              }}
            >
              {line || " "}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DiffViewer() {
  const {
    currentProposal,
    applyProposal,
    rejectProposal,
    rollbackProposal,
    pendingProposal,
    patchErrors,
    applyResults,
    rollbackResults,
    isApplying,
    isRollingBack,
    agentTask,
    rollbackAllPatches,
  } = useRuntimeContext();

  const proposal = pendingProposal ?? currentProposal;
  const patchError = patchErrors[0] ?? null;
  const isPending = pendingProposal !== null;
  const applySucceeded = applyResults.length > 0 && applyResults.every((result) => result.success);
  const rollbackSucceeded = rollbackResults.length > 0 && rollbackResults.every((result) => result.success);

  return (
    <div className="glass-panel-subtle" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: proposal || patchError ? 8 : 0,
        }}
      >
        <div className="section-title" style={{ padding: 0, border: "none", fontSize: 11 }}>
          Diff Preview{proposal ? ` - ${proposal.files.length} file${proposal.files.length === 1 ? "" : "s"}` : ""}
        </div>
        {isPending ? (
          <div style={{ display: "flex", gap: 5 }}>
            <button
              className="qodex-button qodex-button-secondary"
              data-testid="reject-patch"
              onClick={rejectProposal}
              disabled={isApplying}
              style={{ height: 26, padding: "0 10px", fontSize: 11, borderRadius: 6 }}
            >
              Reject
            </button>
            <button
              className="qodex-button"
              data-testid="apply-patch"
              onClick={applyProposal}
              disabled={isApplying}
              style={{ height: 26, padding: "0 10px", fontSize: 11, borderRadius: 6 }}
            >
              {isApplying ? "Applying..." : "Apply changes"}
            </button>
          </div>
        ) : currentProposal ? (
          <div style={{ display: "flex", gap: 5 }}>
            {agentTask && agentTask.patchHistory.length > 1 ? (
              <button
                className="qodex-button qodex-button-secondary"
                data-testid="rollback-all-patches"
                onClick={rollbackAllPatches}
                disabled={isRollingBack}
                style={{ height: 26, padding: "0 10px", fontSize: 11, borderRadius: 6 }}
              >
                Rollback all ({agentTask.patchHistory.length})
              </button>
            ) : null}
            <button
              className="qodex-button qodex-button-secondary"
              data-testid="rollback-patch"
              onClick={rollbackProposal}
              disabled={isRollingBack}
              style={{ height: 26, padding: "0 10px", fontSize: 11, borderRadius: 6 }}
            >
              {isRollingBack ? "Rolling back..." : "Rollback latest"}
            </button>
          </div>
        ) : null}
      </div>

      {patchErrors.length > 0 ? (
        <div data-testid="patch-error" style={{ display: "grid", gap: 5, marginBottom: proposal ? 8 : 0 }}>
          {patchErrors.map((error, index) => (
            <div
              key={`${error.code}-${error.path ?? "proposal"}-${index}`}
              style={{
                padding: "8px 10px",
                border: `1px solid ${error.code === "patch_not_present" ? "rgba(91,140,255,0.16)" : "rgba(255,92,122,0.22)"}`,
                borderRadius: 7,
                color: error.code === "patch_not_present" ? "rgba(180,199,255,0.78)" : "#ff91a6",
                background: error.code === "patch_not_present" ? "rgba(91,140,255,0.06)" : "rgba(255,92,122,0.07)",
                fontSize: 11,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ marginRight: 6 }}>{error.code}</strong>
              {error.path ? <span className="text-code" style={{ marginRight: 6 }}>{error.path}</span> : null}
              {error.message}
            </div>
          ))}
        </div>
      ) : null}

      {!proposal && !patchError ? (
        <div style={{ padding: "32px 16px 26px", textAlign: "center" }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 500 }}>
            No changes to review.
          </div>
          <div style={{ marginTop: 4, color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
            Valid model patch proposals will appear here for approval.
          </div>
        </div>
      ) : null}

      {proposal ? (
        <div data-testid="patch-proposal">
          <div
            className="text-caption"
            data-testid="patch-summary"
            style={{
              marginBottom: 9,
              padding: "7px 9px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              fontSize: 11,
            }}
          >
            {proposal.summary}
          </div>
          {proposal.files.map((file) => <FileDiff key={file.path} file={file} />)}
        </div>
      ) : null}

      {applySucceeded && currentProposal ? (
        <div data-testid="apply-status" style={{ color: "#4FFFC2", fontSize: 11, textAlign: "center" }}>
          Applied and verified on disk. Rollback is available for this session.
        </div>
      ) : null}
      {rollbackSucceeded && !currentProposal ? (
        <div data-testid="rollback-status" style={{ color: "#4FFFC2", fontSize: 11, textAlign: "center" }}>
          Original file contents restored and verified.
        </div>
      ) : null}
    </div>
  );
}
