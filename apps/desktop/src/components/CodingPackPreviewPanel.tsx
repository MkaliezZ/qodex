import {
  AlertTriangle,
  Check,
  FolderOpen,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CodingPackPurpose } from "@qodex/coding-pack-runtime";
import {
  createCodingPackDestinationCapabilityVerifier,
  hasCodingPackDestinationCapability,
} from "../platform/codingPackDestination";
import { useRuntimeContext } from "./AppShell";

const PURPOSE_OPTIONS: readonly {
  value: CodingPackPurpose;
  label: string;
}[] = [
  { value: "repository_orientation", label: "Repository orientation" },
  { value: "task_context", label: "Task context" },
  { value: "review_handoff", label: "Review handoff" },
];

const ERROR_COPY = {
  coding_pack_no_selection: "Select at least one project file before creating a preview.",
  coding_pack_project_changed: "The open project changed. Select files in the active project and try again.",
  coding_pack_read_failed: "One selected file could not be read. No partial preview was created.",
  coding_pack_source_too_large: "One selected file exceeds the 512 KB preview read limit.",
  coding_pack_selection_failed: "The selected files could not produce a valid Coding Pack preview.",
  coding_pack_preview_stale: "This preview is stale. Refresh it before confirming.",
  coding_pack_confirmation_mismatch: "The confirmation did not match this exact preview.",
} as const;

const STORE_ERROR_COPY = {
  coding_pack_store_unavailable: "The local Coding Pack store is unavailable.",
  coding_pack_proposal_invalid: "The export proposal no longer matches this exact preview.",
  coding_pack_proposal_expired: "The export proposal expired. Create a new proposal.",
  coding_pack_approval_mismatch: "The approval did not match this exact export proposal.",
  coding_pack_destination_unavailable: "Choose an available destination again.",
  coding_pack_decision_in_progress: "This export policy is already being evaluated.",
  coding_pack_persistence_failed: "The lifecycle update was not persisted. No files were written.",
} as const;

export function CodingPackPreviewPanel() {
  const {
    projectName,
    selectedFileCount,
    codingPackPurpose,
    setCodingPackPurpose,
    codingPackPreview,
    codingPackConfirmation,
    codingPackPreviewError,
    codingPackPreviewStale,
    isCodingPackPreviewLoading,
    refreshCodingPackPreview,
    confirmCurrentCodingPackPreview,
    codingPackDestination,
    codingPackOperation,
    codingPackRecoveredOperation,
    codingPackStoreError,
    isCodingPackExportLoading,
    chooseCurrentCodingPackDestination,
    createCurrentCodingPackExportProposal,
    confirmCurrentCodingPackExportProposal,
    evaluateCurrentCodingPackExportPolicy,
    codingPackNativeExportAvailable,
    codingPackNativeExportError,
    exportCurrentCodingPack,
  } = useRuntimeContext();

  const [authorityNow, setAuthorityNow] = useState(() => Date.now());
  const [isExportDestinationVerified, setIsExportDestinationVerified] = useState(false);

  useEffect(() => {
    if (!codingPackOperation) return;
    const interval = window.setInterval(() => setAuthorityNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [codingPackOperation]);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    setIsExportDestinationVerified(false);
    if (
      !codingPackNativeExportAvailable
      || codingPackOperation?.operation.state !== "decided_allow"
      || !codingPackDestination
    ) {
      return () => { active = false; };
    }
    const verifier = createCodingPackDestinationCapabilityVerifier();
    const verify = async () => {
      const verified = await verifier.verifyDestinationCapability(codingPackDestination)
        .catch(() => false);
      if (!active) return;
      setIsExportDestinationVerified(verified);
      timeout = window.setTimeout(() => void verify(), 2_000);
    };
    void verify();
    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [
    codingPackDestination,
    codingPackNativeExportAvailable,
    codingPackOperation?.operation.state,
  ]);

  const canPreview = Boolean(projectName) && selectedFileCount > 0;
  const isConfirmed = codingPackConfirmation !== null && !codingPackPreviewStale;
  const canEvaluatePolicy = codingPackOperation?.operation.state === "confirmed"
    && codingPackOperation.approval !== null
    && codingPackDestination !== null
    && hasCodingPackDestinationCapability(codingPackDestination)
    && Date.parse(codingPackOperation.proposal.expiresAt) > authorityNow
    && Date.parse(codingPackOperation.approval.expiresAt) > authorityNow;
  const canExport = codingPackNativeExportAvailable
    && codingPackOperation?.operation.state === "decided_allow"
    && codingPackOperation.approval !== null
    && codingPackConfirmation !== null
    && !codingPackPreviewStale
    && codingPackDestination !== null
    && hasCodingPackDestinationCapability(codingPackDestination)
    && isExportDestinationVerified
    && Date.parse(codingPackOperation.proposal.expiresAt) > authorityNow
    && Date.parse(codingPackOperation.approval.expiresAt) > authorityNow;

  return (
    <section
      className="coding-pack-preview"
      aria-labelledby="coding-pack-preview-heading"
      data-testid="coding-pack-preview"
    >
      <header className="coding-pack-preview-header">
        <div>
          <div className="coding-pack-preview-eyebrow">
            <PackageCheck size={14} aria-hidden="true" />
            <span>Read-only evidence</span>
          </div>
          <h2 id="coding-pack-preview-heading">Coding Pack preview</h2>
          <p>
            Review only the files you explicitly select before any export.
          </p>
        </div>
        <span
          className={`coding-pack-state ${
            codingPackPreviewStale
              ? "is-stale"
              : isConfirmed
                ? "is-confirmed"
                : codingPackPreview
                  ? "is-current"
                  : ""
          }`}
          aria-live="polite"
          data-testid="coding-pack-state"
        >
          {codingPackPreviewStale
            ? "Stale"
            : isConfirmed
              ? "Confirmed"
              : codingPackPreview
                ? "Current"
                : "Not created"}
        </span>
      </header>

      <div className="coding-pack-controls">
        <label className="coding-pack-purpose">
          <span>Purpose</span>
          <select
            className="qodex-input"
            value={codingPackPurpose}
            onChange={(event) => setCodingPackPurpose(event.target.value as CodingPackPurpose)}
            aria-describedby="coding-pack-purpose-note"
            disabled={!projectName || isCodingPackPreviewLoading}
            data-testid="coding-pack-purpose"
          >
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="coding-pack-candidate-count">
          <span>Selected candidates</span>
          <strong>{selectedFileCount}</strong>
        </div>
        <button
          type="button"
          className="qodex-button qodex-button-secondary"
          disabled={!canPreview || isCodingPackPreviewLoading}
          onClick={() => void refreshCodingPackPreview()}
          aria-label={isCodingPackPreviewLoading
            ? "Reading selected files"
            : codingPackPreview
              ? "Refresh Coding Pack preview"
              : "Create Coding Pack preview"}
        >
          <RefreshCw
            size={13}
            className={isCodingPackPreviewLoading ? "is-spinning" : ""}
            aria-hidden="true"
          />
          {isCodingPackPreviewLoading
            ? "Reading selected files"
            : codingPackPreview
              ? "Refresh preview"
              : "Create preview"}
        </button>
      </div>
      <p id="coding-pack-purpose-note" className="coding-pack-purpose-note">
        Purpose changes preview identity. It does not discover or add files automatically.
      </p>

      {!projectName ? (
        <div className="coding-pack-inline-state">
          Open an authorized project to create a selected-file preview.
        </div>
      ) : selectedFileCount === 0 ? (
        <div className="coding-pack-inline-state">
          Select files in the project tree. No files are read until you create a preview.
        </div>
      ) : null}

      {codingPackPreviewError ? (
        <div className="coding-pack-error" role="alert" data-testid="coding-pack-error">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{ERROR_COPY[codingPackPreviewError]}</span>
        </div>
      ) : null}

      {codingPackPreview ? (
        <div className="coding-pack-result" aria-live="polite">
          {codingPackPreviewStale ? (
            <div className="coding-pack-stale-note" role="status">
              The project binding, selected file set, or purpose changed. Refresh before confirming.
            </div>
          ) : null}

          <dl className="coding-pack-totals" aria-label="Coding Pack preview totals">
            <div><dt>Included</dt><dd>{codingPackPreview.selection.totals.includedCount}</dd></div>
            <div><dt>Excluded</dt><dd>{codingPackPreview.selection.totals.excludedCount}</dd></div>
            <div>
              <dt>Included bytes</dt>
              <dd>{formatBytes(codingPackPreview.selection.totals.includedBytes)}</dd>
            </div>
          </dl>

          <div className="coding-pack-file-columns">
            <section aria-labelledby="coding-pack-included-heading">
              <h3 id="coding-pack-included-heading">
                Included files
                <span>{codingPackPreview.selection.included.length}</span>
              </h3>
              {codingPackPreview.selection.included.length > 0 ? (
                <ul className="coding-pack-file-list" data-testid="coding-pack-included">
                  {codingPackPreview.selection.included.map((file) => (
                    <li key={file.relativePath}>
                      <code>{file.relativePath}</code>
                      <span>{formatBytes(file.byteCount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="coding-pack-empty-list">No selected files met the portable rules.</p>
              )}
            </section>

            <section aria-labelledby="coding-pack-excluded-heading">
              <h3 id="coding-pack-excluded-heading">
                Exclusions
                <span>{codingPackPreview.selection.exclusions.length}</span>
              </h3>
              {codingPackPreview.selection.exclusions.length > 0 ? (
                <ul className="coding-pack-file-list" data-testid="coding-pack-exclusions">
                  {codingPackPreview.selection.exclusions.map((exclusion) => (
                    <li key={exclusion.relativePath}>
                      <code>{exclusion.relativePath}</code>
                      <span className="coding-pack-reason">{exclusion.reasonCode}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="coding-pack-empty-list">No exclusions.</p>
              )}
            </section>
          </div>

          <dl className="coding-pack-identity">
            <IdentityRow
              label="Source fingerprint"
              value={codingPackPreview.selection.sourceFingerprint}
            />
            <IdentityRow label="Pack ID" value={codingPackPreview.selection.packId} />
            <IdentityRow
              label="Manifest digest"
              value={codingPackPreview.manifest.manifestDigest}
            />
            <div>
              <dt>Created</dt>
              <dd>
                <time dateTime={codingPackPreview.createdAt}>
                  {new Date(codingPackPreview.createdAt).toLocaleString()}
                </time>
              </dd>
            </div>
          </dl>

          <div className="coding-pack-confirmation">
            <div>
              <strong>
                {isConfirmed ? (
                  <><Check size={13} aria-hidden="true" />Exact preview confirmed</>
                ) : "Exact confirmation"}
              </strong>
              <span>
                Stored in memory only. Confirmation does not authorize export.
              </span>
            </div>
            <button
              type="button"
              className="qodex-button"
              disabled={codingPackPreviewStale || isCodingPackPreviewLoading || isConfirmed}
              onClick={() => void confirmCurrentCodingPackPreview()}
              aria-label="Confirm exact Coding Pack preview"
              data-testid="coding-pack-confirm"
            >
              {isConfirmed ? "Confirmed" : "Confirm exact preview"}
            </button>
          </div>

          <section
            className="coding-pack-export-intent"
            aria-labelledby="coding-pack-export-heading"
            data-testid="coding-pack-export-intent"
          >
            <header>
              <div>
                <span className="coding-pack-export-kicker">Durable local intent</span>
                <h3 id="coding-pack-export-heading">Export proposal</h3>
              </div>
              <span className="coding-pack-no-write" role="status">
                {codingPackOperation?.operation.state === "export_completed"
                  ? "Bundle written"
                  : codingPackOperation?.operation.state === "export_started"
                    ? "Evidence uncertain"
                    : codingPackOperation?.operation.state === "export_interrupted"
                      ? "No final target"
                      : "No files written"}
              </span>
            </header>
            <p>
              {exportLifecycleCopy(codingPackOperation?.operation.state)}
            </p>

            <div className="coding-pack-export-actions">
              <button
                type="button"
                className="qodex-button qodex-button-secondary"
                disabled={!isConfirmed || isCodingPackExportLoading}
                onClick={() => void chooseCurrentCodingPackDestination()}
                aria-label="Choose Coding Pack export destination"
                data-testid="coding-pack-destination"
              >
                <FolderOpen size={13} aria-hidden="true" />
                {codingPackDestination ? "Change destination" : "Choose destination"}
              </button>
              <div className="coding-pack-destination-label" aria-live="polite">
                <span>Destination</span>
                <strong>{codingPackDestination?.displayLabel ?? "Not selected"}</strong>
              </div>
              <button
                type="button"
                className="qodex-button"
                disabled={
                  !isConfirmed
                  || !codingPackDestination
                  || codingPackOperation !== null
                  || isCodingPackExportLoading
                }
                onClick={() => void createCurrentCodingPackExportProposal()}
                aria-label="Create exact Coding Pack export proposal"
                data-testid="coding-pack-create-proposal"
              >
                Create export proposal
              </button>
            </div>

            {codingPackStoreError ? (
              <div className="coding-pack-error" role="alert" data-testid="coding-pack-store-error">
                <AlertTriangle size={14} aria-hidden="true" />
                <span>{STORE_ERROR_COPY[codingPackStoreError]}</span>
              </div>
            ) : null}

            {codingPackOperation ? (
              <div className="coding-pack-proposal-result" aria-live="polite">
                <div className="coding-pack-proposal-status">
                  <strong>
                    <Check size={13} aria-hidden="true" />
                    {operationStatus(codingPackOperation.operation.state)}
                  </strong>
                  <span>{codingPackOperation.operation.state}</span>
                </div>
                <dl>
                  <IdentityRow
                    label="Proposal digest"
                    value={codingPackOperation.proposal.proposalDigest}
                  />
                  <div>
                    <dt>Expires</dt>
                    <dd>
                      <time dateTime={codingPackOperation.proposal.expiresAt}>
                        {new Date(codingPackOperation.proposal.expiresAt).toLocaleString()}
                      </time>
                    </dd>
                  </div>
                </dl>
                {codingPackOperation.operation.state === "proposed"
                  || codingPackOperation.operation.state === "confirmed" ? (
                    <button
                      type="button"
                      className="qodex-button"
                      disabled={
                        codingPackOperation.operation.state !== "proposed"
                        || isCodingPackExportLoading
                      }
                      onClick={() => void confirmCurrentCodingPackExportProposal()}
                      aria-label="Confirm exact Coding Pack export proposal"
                      data-testid="coding-pack-confirm-proposal"
                    >
                      {codingPackOperation.operation.state === "confirmed"
                        ? "Proposal confirmed"
                        : "Confirm export proposal"}
                    </button>
                  ) : null}
                {canEvaluatePolicy && !codingPackOperation.decision ? (
                  <button
                    type="button"
                    className="qodex-button"
                    disabled={isCodingPackExportLoading}
                    onClick={() => void evaluateCurrentCodingPackExportPolicy()}
                    aria-label="Evaluate Coding Pack export policy"
                    data-testid="coding-pack-evaluate-policy"
                  >
                    <ShieldCheck size={13} aria-hidden="true" />
                    Evaluate export policy
                  </button>
                ) : null}
                {codingPackOperation.decision ? (
                  <div
                    className={`coding-pack-policy-result is-${
                      codingPackOperation.decision.decision
                    }`}
                    role="status"
                    data-testid="coding-pack-policy-result"
                  >
                    <strong>{policyDecisionLabel(
                      codingPackOperation.decision.decision,
                    )}</strong>
                    <span>{codingPackOperation.decision.reasonCode}</span>
                    <small>{decisionWriteStatus(codingPackOperation.operation.state)}</small>
                  </div>
                ) : null}
                {codingPackOperation.operation.state === "decided_allow" ? (
                  codingPackNativeExportAvailable ? (
                    <button
                      type="button"
                      className="qodex-button coding-pack-export-button"
                      disabled={!canExport || isCodingPackExportLoading}
                      onClick={() => void exportCurrentCodingPack()}
                      aria-label="Export exact Coding Pack atomically"
                      data-testid="coding-pack-export"
                    >
                      <Upload size={13} aria-hidden="true" />
                      {isCodingPackExportLoading
                        ? "Preparing exact export"
                        : "Export exact Coding Pack"}
                    </button>
                  ) : (
                    <p className="coding-pack-native-required" role="status">
                      Native Desktop required for atomic export
                    </p>
                  )
                ) : null}
                {isCodingPackExportLoading
                  && codingPackOperation.operation.state === "decided_allow" ? (
                    <ol className="coding-pack-export-progress" aria-live="polite">
                      <li>Preparing exact export</li>
                      <li>Verifying source bytes</li>
                      <li>Writing atomic staging bundle</li>
                    </ol>
                  ) : null}
                {codingPackOperation.operation.state === "export_completed"
                  && codingPackOperation.exportCompleted ? (
                    <div
                      className="coding-pack-export-outcome is-complete"
                      role="status"
                      data-testid="coding-pack-export-completed"
                    >
                      <strong>Coding Pack exported</strong>
                      <dl>
                        <IdentityRow
                          label="Manifest digest"
                          value={codingPackOperation.exportCompleted.manifestDigest}
                        />
                        <div>
                          <dt>Target</dt>
                          <dd><code>{codingPackOperation.exportCompleted.targetName}</code></dd>
                        </div>
                        <div>
                          <dt>Files</dt>
                          <dd>{codingPackOperation.exportCompleted.sourceFileCount}</dd>
                        </div>
                        <div>
                          <dt>Total bytes</dt>
                          <dd>{formatBytes(codingPackOperation.exportCompleted.sourceTotalBytes)}</dd>
                        </div>
                      </dl>
                    </div>
                  ) : null}
                {codingPackNativeExportError
                  === "coding_pack_export_completion_persistence_failed"
                  || codingPackOperation.operation.state === "export_started" ? (
                    <div
                      className="coding-pack-export-outcome is-uncertain"
                      role="alert"
                      data-testid="coding-pack-export-uncertain"
                    >
                      <strong>Files may have been exported</strong>
                      <span>Completion evidence was not persisted</span>
                      <span>Check the selected destination</span>
                      <span>No automatic retry</span>
                    </div>
                  ) : null}
                {codingPackOperation.operation.state === "export_interrupted" ? (
                  <div className="coding-pack-export-outcome is-interrupted" role="alert">
                    <strong>Atomic export did not complete</strong>
                    <span>No final target was promoted</span>
                    <span>No automatic retry</span>
                  </div>
                ) : null}
                {codingPackNativeExportError
                  && codingPackNativeExportError
                    !== "coding_pack_export_completion_persistence_failed"
                  && codingPackOperation.operation.state !== "export_interrupted" ? (
                    <div className="coding-pack-error" role="alert">
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span>{nativeExportErrorCopy(codingPackNativeExportError)}</span>
                    </div>
                  ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {!codingPackPreview && codingPackRecoveredOperation ? (
        <section
          className="coding-pack-recovered-operation"
          aria-labelledby="coding-pack-recovered-heading"
          data-testid="coding-pack-recovered-operation"
        >
          <header>
            <div>
              <span>Recovered durable record</span>
              <h3 id="coding-pack-recovered-heading">
                Export proposal {codingPackRecoveredOperation.operation.state}
              </h3>
            </div>
            <span className="coding-pack-no-write">
              {recoveredWriteStatus(codingPackRecoveredOperation.operation.state)}
            </span>
          </header>
          <p>
            This is a historical record and may belong to a different project binding.
            No decision or export was resumed automatically.
            The previous preview confirmation was not restored.
          </p>
          {codingPackRecoveredOperation.decision ? (
            <p>
              Historical decision: {policyDecisionLabel(
                codingPackRecoveredOperation.decision.decision,
              )}. It is non-actionable after restart.
            </p>
          ) : null}
          {codingPackRecoveredOperation.operation.state === "export_started" ? (
            <div className="coding-pack-export-outcome is-uncertain" role="status">
              <strong>Files may have been exported</strong>
              <span>Completion evidence was not persisted</span>
              <span>Check the selected destination</span>
              <span>No automatic retry</span>
            </div>
          ) : null}
          {codingPackRecoveredOperation.exportCompleted ? (
            <p>
              Historical export completed as <code>{codingPackRecoveredOperation.exportCompleted.targetName}</code>.
              It is non-actionable after restart.
            </p>
          ) : null}
          {codingPackRecoveredOperation.exportInterrupted ? (
            <p>
              Historical export was interrupted before promotion. No automatic retry is available.
            </p>
          ) : null}
          {!codingPackRecoveredOperation.destination.restartAvailable ? (
            <p>
              The browser destination capability is unavailable after restart.
              Select a destination and create a new proposal from a newly confirmed preview.
            </p>
          ) : null}
          <dl>
            <IdentityRow
              label="Proposal digest"
              value={codingPackRecoveredOperation.proposal.proposalDigest}
            />
            <div>
              <dt>Destination</dt>
              <dd>{codingPackRecoveredOperation.destination.displayLabel}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </section>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd><code>{value}</code></dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function operationStatus(state: string): string {
  if (state === "confirmed") return "Export proposal confirmed";
  if (state === "decided_allow") return "Policy allowed";
  if (state === "decided_deny") return "Policy denied";
  if (state === "decided_error") return "Policy evaluation error";
  if (state === "export_started") return "Export evidence uncertain";
  if (state === "export_completed") return "Coding Pack exported";
  if (state === "export_interrupted") return "Atomic export interrupted";
  return "Export proposal created";
}

function exportLifecycleCopy(state: string | undefined): string {
  if (state === "export_completed") {
    return "The exact bundle was promoted and completion evidence was persisted.";
  }
  if (state === "export_started") {
    return "The physical result is uncertain because completion evidence is unavailable.";
  }
  if (state === "export_interrupted") {
    return "The attempt ended before final-target promotion. No automatic retry is available.";
  }
  return "This lifecycle records intent and policy evidence. Export has not started.";
}

function policyDecisionLabel(decision: "allow" | "deny" | "error"): string {
  if (decision === "allow") return "Policy allowed";
  if (decision === "deny") return "Policy denied";
  return "Policy evaluation error";
}

function decisionWriteStatus(state: string): string {
  if (state === "decided_deny" || state === "decided_error") return "No files written";
  if (state === "export_completed") return "Completion evidence persisted";
  if (state === "export_interrupted") return "No final target promoted";
  if (state === "export_started") return "Completion evidence unavailable";
  return "Export has not started";
}

function recoveredWriteStatus(state: string): string {
  if (state === "export_completed") return "Export completed";
  if (state === "export_interrupted") return "No final target";
  if (state === "export_started") return "State uncertain";
  return "No files written";
}

function nativeExportErrorCopy(code: string): string {
  if (code === "coding_pack_native_desktop_required") {
    return "Native Desktop required for atomic export";
  }
  if (code === "coding_pack_export_authority_invalid") {
    return "The current preview, confirmation, destination, or approval is no longer valid.";
  }
  return "Atomic export failed. No completion was reported.";
}
