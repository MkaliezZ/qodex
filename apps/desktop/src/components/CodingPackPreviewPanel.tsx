import {
  AlertTriangle,
  Check,
  FolderOpen,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import type { CodingPackPurpose } from "@qodex/coding-pack-runtime";
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
  } = useRuntimeContext();

  const canPreview = Boolean(projectName) && selectedFileCount > 0;
  const isConfirmed = codingPackConfirmation !== null && !codingPackPreviewStale;

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
            Preview only the files you explicitly select. Nothing is exported or written.
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
              <span className="coding-pack-no-write" role="status">No files written</span>
            </header>
            <p>
              Policy decision not yet evaluated. This records intent only and cannot export files.
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
                    {codingPackOperation.operation.state === "confirmed"
                      ? "Export proposal confirmed"
                      : "Export proposal created"}
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
            <span className="coding-pack-no-write">No files written</span>
          </header>
          <p>
            No decision or export was resumed. The previous preview confirmation was not restored.
          </p>
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
