import { DiffGenerator } from "@qodex/diff-engine";
import type { PatchFile } from "@qodex/diff-engine";
import { FileDiff as FileDiffIcon, ShieldCheck } from "lucide-react";
import { useRuntimeContext } from "./AppShell";

const diffGenerator = new DiffGenerator();

function FileDiff({ file }: { file: PatchFile }) {
  const stats = diffGenerator.generateDiff(file);
  const unifiedDiff = diffGenerator.generateUnifiedDiff(file);

  return (
    <div className="patch-file" data-testid="patch-file">
      <div className="patch-file-header">
        <span>{file.path}</span>
        <span className="patch-file-stats">
          <span className="diff-addition">+{stats.additions}</span>
          <span className="diff-deletion">-{stats.deletions}</span>
        </span>
      </div>
      <div className="patch-diff" data-testid="patch-diff">
        {unifiedDiff.split("\n").map((line, index) => {
          const kind = line.startsWith("+") && !line.startsWith("+++")
            ? "add"
            : line.startsWith("-") && !line.startsWith("---")
              ? "delete"
              : "context";
          return (
            <div
              key={`${index}-${line}`}
              className={`patch-diff-line patch-diff-line-${kind}`}
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
    proposalNotice,
    proposalActionsAvailable,
    patchErrors,
    applyResults,
    rollbackResults,
    isApplying,
    isRollingBack,
    agentTask,
    agentRollbackAvailable,
    agentRollbackReason,
    rollbackAllPatches,
  } = useRuntimeContext();

  const proposal = pendingProposal ?? currentProposal;
  const patchError = patchErrors[0] ?? null;
  const isPending = pendingProposal !== null && proposalActionsAvailable;
  const isAgentRollback = Boolean(agentTask && agentTask.patchHistory.length > 0);
  const rollbackDisabled = isRollingBack || (isAgentRollback && !agentRollbackAvailable);
  const applySucceeded = applyResults.length > 0 && applyResults.every((result) => result.success);
  const rollbackSucceeded = rollbackResults.length > 0 && rollbackResults.every((result) => result.success);

  return (
    <section className="diff-review-surface" aria-label="Diff review">
      <div className="diff-review-header">
        <div className="diff-review-title">
          <FileDiffIcon size={14} aria-hidden="true" />
          <span>Diff preview</span>
          {proposal ? <small>{proposal.files.length} file{proposal.files.length === 1 ? "" : "s"}</small> : null}
        </div>
        {isPending ? (
          <div className="diff-review-actions">
            <button
              className="qodex-button qodex-button-secondary"
              data-testid="reject-patch"
              onClick={rejectProposal}
              disabled={isApplying}
            >
              Reject
            </button>
            <button
              className="qodex-button"
              data-testid="apply-patch"
              onClick={applyProposal}
              disabled={isApplying}
            >
              {isApplying ? "Applying..." : "Apply changes"}
            </button>
          </div>
        ) : currentProposal ? (
          <div className="diff-review-actions">
            {agentTask && agentTask.patchHistory.length > 1 ? (
              <button
                className="qodex-button qodex-button-secondary"
                data-testid="rollback-all-patches"
                onClick={rollbackAllPatches}
                disabled={rollbackDisabled}
              >
                Rollback all ({agentTask.patchHistory.length})
              </button>
            ) : null}
            <button
              className="qodex-button qodex-button-secondary"
              data-testid="rollback-patch"
              onClick={rollbackProposal}
              disabled={rollbackDisabled}
            >
              {isRollingBack ? "Rolling back..." : "Rollback latest"}
            </button>
          </div>
        ) : null}
      </div>

      {proposalNotice ? (
        <div className="agent-mode-notice diff-review-notice" data-testid="proposal-disposition">
          {proposalNotice}
        </div>
      ) : null}

      {currentProposal && isAgentRollback && !agentRollbackAvailable && agentRollbackReason ? (
        <div className="rollback-unavailable" data-testid="rollback-unavailable">
          {agentRollbackReason}
        </div>
      ) : null}

      {patchErrors.length > 0 ? (
        <div className="patch-errors" data-testid="patch-error">
          {patchErrors.map((error, index) => (
            <div
              key={`${error.code}-${error.path ?? "proposal"}-${index}`}
              className={`patch-error${error.code === "patch_not_present" ? " is-informational" : ""}`}
            >
              <strong>{error.code}</strong>
              {error.path ? <span className="text-code">{error.path}</span> : null}
              {error.message}
            </div>
          ))}
        </div>
      ) : null}

      {!proposal && !patchError ? (
        <div className="diff-empty">
          <strong>No changes to review.</strong>
          <span>Valid model patch proposals will appear here for approval.</span>
        </div>
      ) : null}

      {proposal ? (
        <div data-testid="patch-proposal">
          <div
            className="patch-summary"
            data-testid="patch-summary"
          >
            {proposal.summary}
          </div>
          {proposal.files.map((file) => <FileDiff key={file.path} file={file} />)}
        </div>
      ) : null}

      {applySucceeded && currentProposal ? (
        <div className="diff-success" data-testid="apply-status">
          <ShieldCheck size={13} aria-hidden="true" /> Applied and verified on disk. Rollback is available for this session.
        </div>
      ) : null}
      {rollbackSucceeded && !currentProposal ? (
        <div className="diff-success" data-testid="rollback-status">
          <ShieldCheck size={13} aria-hidden="true" /> Original file contents restored and verified.
        </div>
      ) : null}
    </section>
  );
}
