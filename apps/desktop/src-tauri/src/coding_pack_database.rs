use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const CODING_PACK_DATABASE_SCHEMA_VERSION: i64 = 3;
pub const CODING_PACK_STORE_SCHEMA_VERSION: &str = "kerniq.coding-pack.store.v3";
const DATABASE_FILE_NAME: &str = "kerniq-coding-pack.sqlite3";
const MAX_EVENT_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_ID_BYTES: usize = 256;
const MAX_LABEL_BYTES: usize = 256;
const MAX_PROPOSAL_LIFETIME_MS: i64 = 86_400_000;
const MAX_APPROVAL_LIFETIME_MS: i64 = 86_400_000;
const EXPORT_PROPOSAL_SCHEMA: &str = "kerniq.coding-pack.export-proposal.v1";
const EXPORT_APPROVAL_SCHEMA: &str = "kerniq.coding-pack.export-approval.v1";
const EXPORT_FORMAT: &str = "kerniq-coding-pack-bundle-v1";
const AGENTFUSE_SOURCE_COMMIT: &str = "ec4b5842339dccfba0db62df7541920759203bc9";
const AGENTFUSE_PACKAGE_VERSION: &str = "3.6.0";
const AGENTFUSE_BRIDGE_PROTOCOL: &str = "kerniq.agentfuse.bridge.v1";
const CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL: &str = "kerniq.coding-pack.agentfuse-export.v1";
const CODING_PACK_AGENTFUSE_EXPORT_TOOL: &str = "kerniq.coding_pack.export";
const CODING_PACK_EXPORT_POLICY_ID: &str = "kerniq-coding-pack-export-v1";
const CODING_PACK_EXPORT_POLICY_DIGEST: &str =
    "sha256:752a8bf1f251e5c05f07ddd8d820af3c5554fb37e3a47fbcf41933f614167d07";

pub struct CodingPackDatabase {
    connection: Mutex<Connection>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodingPackOperation {
    pub operation_id: String,
    pub state: String,
    pub project_binding_id: String,
    pub project_generation: i64,
    pub candidate_paths_digest: String,
    pub source_fingerprint: String,
    pub pack_id: String,
    pub manifest_digest: String,
    pub destination_binding_id: String,
    pub proposal_digest: String,
    pub created_at: String,
    pub expires_at: String,
    pub last_event_sequence: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodingPackEvent {
    pub event_id: String,
    pub operation_id: String,
    pub event_sequence: i64,
    pub event_type: String,
    pub event_version: i64,
    pub recorded_at: String,
    pub payload_digest: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCodingPackOperationRequest {
    pub operation: CodingPackOperation,
    pub proposed_event: CodingPackEvent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfirmCodingPackOperationRequest {
    pub operation: CodingPackOperation,
    pub confirmed_event: CodingPackEvent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DecideCodingPackOperationRequest {
    pub operation: CodingPackOperation,
    pub decided_event: CodingPackEvent,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DestinationPickerRequest {
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingPackDestinationBinding {
    pub destination_binding_id: String,
    pub destination_fingerprint: String,
    pub display_label: String,
    pub created_at: String,
    pub restart_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodingPackStoredSnapshotData {
    pub operation: CodingPackOperation,
    pub events: Vec<CodingPackEvent>,
    pub destination: CodingPackDestinationBinding,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CodingPackExportProposal {
    schema_version: String,
    operation_id: String,
    project_binding_id: String,
    project_generation: i64,
    candidate_paths_digest: String,
    source_fingerprint: String,
    pack_id: String,
    manifest_digest: String,
    destination_binding_id: String,
    destination_fingerprint: String,
    export_format: String,
    created_at: String,
    expires_at: String,
    proposal_digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CodingPackExportApproval {
    schema_version: String,
    operation_id: String,
    proposal_digest: String,
    approved_at: String,
    expires_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ProposedPayload {
    proposal: CodingPackExportProposal,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ConfirmedPayload {
    approval: CodingPackExportApproval,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DecidedPayload {
    decision_id: String,
    request_digest: String,
    proposal_digest: String,
    approval_evidence_digest: String,
    agent_fuse_source_commit: String,
    agent_fuse_package_version: String,
    bridge_protocol: String,
    policy_id: String,
    policy_digest: String,
    decision: String,
    reason_code: String,
    evaluation_started_at: String,
    decided_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportStartedPayload {
    export_attempt_id: String,
    export_plan_digest: String,
    decision_id: String,
    request_digest: String,
    proposal_digest: String,
    manifest_digest: String,
    destination_binding_id: String,
    destination_fingerprint: String,
    target_name: String,
    source_file_count: usize,
    source_total_bytes: u64,
    started_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportCompletedPayload {
    export_attempt_id: String,
    export_plan_digest: String,
    manifest_digest: String,
    target_name: String,
    source_file_count: usize,
    source_total_bytes: u64,
    completed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportInterruptedPayload {
    export_attempt_id: String,
    export_plan_digest: String,
    phase_code: String,
    physical_state: String,
    reason_code: String,
    interrupted_at: String,
}

impl CodingPackDatabase {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let directory = app.path().app_data_dir().map_err(|_| store_unavailable())?;
        fs::create_dir_all(&directory).map_err(|_| store_unavailable())?;
        Self::open_path(&directory.join(DATABASE_FILE_NAME))
    }

    pub fn open_path(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|_| store_unavailable())?;
        configure_connection(&connection)?;
        migrate_database(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn bind_destination(
        &self,
        selected_path: &Path,
        created_at: String,
    ) -> Result<CodingPackDestinationBinding, String> {
        let canonical = canonical_destination(selected_path)?;
        parse_timestamp(&created_at).map_err(|_| destination_unavailable())?;
        let (private_path, destination_fingerprint, destination_binding_id) =
            destination_identity(&canonical)?;
        let display_label = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("Selected folder")
            .to_string();
        validate_display_label(&display_label)?;

        let connection = self.lock()?;
        if let Some(existing) = select_destination_private(&connection, &destination_binding_id)? {
            if existing.binding.destination_fingerprint != destination_fingerprint
                || existing.private_absolute_path != private_path
                || !existing.binding.restart_available
            {
                return Err(destination_unavailable());
            }
            return Ok(existing.binding);
        }
        connection
            .execute(
                "INSERT INTO coding_pack_destination_bindings (
                    destination_binding_id, destination_fingerprint, display_label,
                    created_at, restart_available, private_absolute_path
                 ) VALUES (?1, ?2, ?3, ?4, 1, ?5)
                 ON CONFLICT(destination_binding_id) DO NOTHING",
                params![
                    destination_binding_id,
                    destination_fingerprint,
                    display_label,
                    created_at,
                    private_path,
                ],
            )
            .map_err(|_| persistence_failed())
            .and_then(|changed| {
                if changed == 1 {
                    Ok(())
                } else {
                    Err(destination_unavailable())
                }
            })?;
        Ok(CodingPackDestinationBinding {
            destination_binding_id,
            destination_fingerprint,
            display_label,
            created_at,
            restart_available: true,
        })
    }

    pub fn create_operation(
        &self,
        request: CreateCodingPackOperationRequest,
    ) -> Result<(), String> {
        let operation = request.operation;
        let event = request.proposed_event;
        let proposal = validate_proposed_pair(&operation, &event)?;
        let payload_json = bounded_payload_json(&event.payload)?;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| persistence_failed())?;
        let destination: Option<(String, i64)> = transaction
            .query_row(
                "SELECT destination_fingerprint, restart_available
                 FROM coding_pack_destination_bindings
                 WHERE destination_binding_id = ?1",
                [&operation.destination_binding_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| persistence_failed())?;
        if !matches!(
            destination,
            Some((ref fingerprint, 1))
                if fingerprint == &proposal.destination_fingerprint
        ) {
            return Err(destination_unavailable());
        }
        insert_operation(&transaction, &operation)?;
        insert_event(&transaction, &event, &payload_json)?;
        transaction.commit().map_err(|_| persistence_failed())
    }

    pub fn append_confirmation(
        &self,
        request: ConfirmCodingPackOperationRequest,
    ) -> Result<(), String> {
        let operation = request.operation;
        let event = request.confirmed_event;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| persistence_failed())?;
        let current = select_operation(&transaction, &operation.operation_id)?
            .ok_or_else(persistence_failed)?;
        let proposed_events = select_events(&transaction, &operation.operation_id)?;
        if proposed_events.len() != 1 {
            return Err(persistence_failed());
        }
        let proposal = validate_proposed_pair(&current, &proposed_events[0])?;
        let approval = validate_confirmed_pair(&operation, &event, &proposal)?;
        let now = current_time_millis()?;
        if parse_timestamp(&proposal.expires_at)? <= now
            || parse_timestamp(&approval.expires_at)? <= now
        {
            return Err(persistence_failed());
        }
        let payload_json = bounded_payload_json(&event.payload)?;
        if !immutable_operation_fields_match(&current, &operation)
            || current.state != "proposed"
            || current.last_event_sequence != 1
        {
            return Err(persistence_failed());
        }
        insert_event(&transaction, &event, &payload_json)?;
        let changed = transaction
            .execute(
                "UPDATE coding_pack_operations
                 SET state = 'confirmed', last_event_sequence = 2
                 WHERE operation_id = ?1 AND state = 'proposed' AND last_event_sequence = 1",
                [&operation.operation_id],
            )
            .map_err(|_| persistence_failed())?;
        if changed != 1 {
            return Err(persistence_failed());
        }
        transaction.commit().map_err(|_| persistence_failed())
    }

    pub fn append_decision(&self, request: DecideCodingPackOperationRequest) -> Result<(), String> {
        let operation = request.operation;
        let event = request.decided_event;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| persistence_failed())?;
        let current = select_operation(&transaction, &operation.operation_id)?
            .ok_or_else(persistence_failed)?;
        let events = select_events(&transaction, &operation.operation_id)?;
        if events.len() != 2 {
            return Err(persistence_failed());
        }
        let proposal = validate_proposed_pair(
            &CodingPackOperation {
                state: "proposed".into(),
                last_event_sequence: 1,
                ..current.clone()
            },
            &events[0],
        )?;
        let approval = validate_confirmed_pair(
            &CodingPackOperation {
                state: "confirmed".into(),
                last_event_sequence: 2,
                ..current.clone()
            },
            &events[1],
            &proposal,
        )?;
        let decision = validate_decided_pair(&operation, &event, &proposal, &approval, &events[1])?;
        if !immutable_operation_fields_match(&current, &operation)
            || current.state != "confirmed"
            || current.last_event_sequence != 2
        {
            return Err(persistence_failed());
        }
        let destination: Option<(String, i64)> = transaction
            .query_row(
                "SELECT destination_fingerprint, restart_available
                 FROM coding_pack_destination_bindings
                 WHERE destination_binding_id = ?1",
                [&operation.destination_binding_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|_| persistence_failed())?;
        if !matches!(
            destination,
            Some((ref fingerprint, 1))
                if fingerprint == &proposal.destination_fingerprint
        ) {
            return Err(destination_unavailable());
        }
        let payload_json = bounded_payload_json(&event.payload)?;
        insert_event(&transaction, &event, &payload_json)?;
        let changed = transaction
            .execute(
                "UPDATE coding_pack_operations
                 SET state = ?2, last_event_sequence = 3
                 WHERE operation_id = ?1 AND state = 'confirmed' AND last_event_sequence = 2",
                params![operation.operation_id, decision_state(&decision.decision)?],
            )
            .map_err(|_| persistence_failed())?;
        if changed != 1 {
            return Err(persistence_failed());
        }
        transaction.commit().map_err(|_| persistence_failed())
    }

    pub fn get_operation_snapshot_data(
        &self,
        operation_id: &str,
    ) -> Result<Option<CodingPackStoredSnapshotData>, String> {
        validate_opaque_id(operation_id)?;
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|_| store_unavailable())?;
        let Some(operation) = select_operation(&transaction, operation_id)? else {
            transaction.commit().map_err(|_| store_unavailable())?;
            return Ok(None);
        };
        let events = select_events(&transaction, operation_id)?;
        let destination =
            select_destination_public(&transaction, &operation.destination_binding_id)?
                .ok_or_else(store_unavailable)?;
        transaction.commit().map_err(|_| store_unavailable())?;
        Ok(Some(CodingPackStoredSnapshotData {
            operation,
            events,
            destination,
        }))
    }

    pub fn list_operation_ids(&self) -> Result<Vec<String>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT operation_id
                 FROM coding_pack_operations
                 ORDER BY created_at DESC, operation_id ASC",
            )
            .map_err(|_| store_unavailable())?;
        let rows = statement
            .query_map([], |row| row.get(0))
            .map_err(|_| store_unavailable())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| store_unavailable())
    }

    pub fn get_destination(
        &self,
        destination_binding_id: &str,
    ) -> Result<Option<CodingPackDestinationBinding>, String> {
        let connection = self.lock()?;
        select_destination_public(&connection, destination_binding_id)
    }

    pub fn verify_destination_capability(
        &self,
        destination_binding_id: &str,
    ) -> Result<bool, String> {
        if !is_destination_binding_id(destination_binding_id) {
            return Ok(false);
        }
        let connection = self.lock()?;
        let Some(stored) = select_destination_private(&connection, destination_binding_id)? else {
            return Ok(false);
        };
        if !stored.binding.restart_available {
            return Ok(false);
        }
        let Ok(canonical) = canonical_destination(Path::new(&stored.private_absolute_path)) else {
            return Ok(false);
        };
        let Ok((private_path, fingerprint, binding_id)) = destination_identity(&canonical) else {
            return Ok(false);
        };
        Ok(private_path == stored.private_absolute_path
            && binding_id == stored.binding.destination_binding_id
            && fingerprint == stored.binding.destination_fingerprint)
    }

    pub(crate) fn begin_native_export(
        &self,
        request: &NativeExportRequest,
        project_root: &Path,
    ) -> Result<PreparedNativeExport, String> {
        self.begin_native_export_inner(request, project_root, None, false)
    }

    fn begin_native_export_inner(
        &self,
        request: &NativeExportRequest,
        project_root: &Path,
        started_at_override: Option<&str>,
        fail_start_persistence: bool,
    ) -> Result<PreparedNativeExport, String> {
        validate_opaque_id(&request.operation_id)?;
        validate_opaque_id(&request.export_attempt_id)?;
        validate_opaque_id(&request.project_binding_id)?;
        let manifest = validate_manifest(&request.canonical_manifest_json)?;
        let mut connection = self.lock().map_err(|_| export_start_failed())?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| export_start_failed())?;
        let current = select_operation(&transaction, &request.operation_id)?
            .ok_or_else(export_not_allowed)?;
        let events = select_events(&transaction, &request.operation_id)?;
        if current.state != "decided_allow"
            || current.last_event_sequence != 3
            || events.len() != 3
            || current.project_binding_id != request.project_binding_id
        {
            return Err(export_not_allowed());
        }
        let proposal = validate_proposed_pair(
            &CodingPackOperation {
                state: "proposed".into(),
                last_event_sequence: 1,
                ..current.clone()
            },
            &events[0],
        )?;
        let approval = validate_confirmed_pair(
            &CodingPackOperation {
                state: "confirmed".into(),
                last_event_sequence: 2,
                ..current.clone()
            },
            &events[1],
            &proposal,
        )?;
        let decision =
            validate_decided_pair(&current, &events[2], &proposal, &approval, &events[1])?;
        if decision.decision != "allow"
            || manifest.candidate_paths_digest != current.candidate_paths_digest
            || manifest.source_fingerprint != current.source_fingerprint
            || manifest.pack_id != current.pack_id
            || manifest.manifest_digest != current.manifest_digest
        {
            return Err(export_not_allowed());
        }

        let destination =
            select_destination_private(&transaction, &current.destination_binding_id)?
                .ok_or_else(destination_unavailable)?;
        let canonical_destination =
            canonical_destination(Path::new(&destination.private_absolute_path))?;
        let (private_path, destination_fingerprint, destination_binding_id) =
            destination_identity(&canonical_destination)?;
        if private_path != destination.private_absolute_path
            || destination_binding_id != destination.binding.destination_binding_id
            || destination_fingerprint != destination.binding.destination_fingerprint
            || destination_fingerprint != proposal.destination_fingerprint
        {
            return Err(destination_unavailable());
        }

        let target_name = format!(
            "kerniq-coding-pack-{}",
            &manifest.manifest_digest["sha256:".len()..]
        );
        let target_path = canonical_destination.join(&target_name);
        match fs::symlink_metadata(&target_path) {
            Ok(_) => return Err("coding_pack_export_target_exists".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(destination_unavailable()),
        }

        let sources = read_and_verify_sources(project_root, &manifest.sources)?;
        let source_total_bytes = sources.iter().try_fold(0_u64, |total, source| {
            total
                .checked_add(source.bytes.len() as u64)
                .ok_or_else(|| "coding_pack_source_changed_before_export".to_string())
        })?;
        let started_at = match started_at_override {
            Some(value) => value.to_string(),
            None => database_timestamp(&transaction).map_err(|_| export_start_failed())?,
        };
        let started_at_millis = parse_timestamp(&started_at).map_err(|_| export_start_failed())?;
        if started_at_millis < parse_timestamp(&decision.decided_at)?
            || started_at_millis >= parse_timestamp(&proposal.expires_at)?
            || started_at_millis >= parse_timestamp(&approval.expires_at)?
        {
            return Err("coding_pack_export_authority_expired".into());
        }

        let plan_without_digest = serde_json::json!({
            "schemaVersion": crate::coding_pack_export::EXPORT_PLAN_SCHEMA,
            "operationId": current.operation_id,
            "exportAttemptId": request.export_attempt_id,
            "decisionId": decision.decision_id,
            "requestDigest": decision.request_digest,
            "proposalDigest": proposal.proposal_digest,
            "candidatePathsDigest": current.candidate_paths_digest,
            "sourceFingerprint": current.source_fingerprint,
            "packId": current.pack_id,
            "manifestDigest": manifest.manifest_digest,
            "destinationBindingId": destination.binding.destination_binding_id,
            "destinationFingerprint": destination.binding.destination_fingerprint,
            "targetName": target_name,
            "manifestByteCount": manifest.canonical_bytes.len(),
            "sourceFileCount": sources.len(),
            "sourceTotalBytes": source_total_bytes,
            "exportStartedAt": started_at,
        });
        let export_plan_digest =
            sha256_canonical(&plan_without_digest).map_err(|_| export_start_failed())?;
        let plan = NativeExportPlan {
            schema_version: crate::coding_pack_export::EXPORT_PLAN_SCHEMA.into(),
            operation_id: current.operation_id.clone(),
            export_attempt_id: request.export_attempt_id.clone(),
            decision_id: decision.decision_id.clone(),
            request_digest: decision.request_digest.clone(),
            proposal_digest: proposal.proposal_digest.clone(),
            candidate_paths_digest: current.candidate_paths_digest.clone(),
            source_fingerprint: current.source_fingerprint.clone(),
            pack_id: current.pack_id.clone(),
            manifest_digest: manifest.manifest_digest.clone(),
            destination_binding_id: destination.binding.destination_binding_id.clone(),
            destination_fingerprint: destination.binding.destination_fingerprint.clone(),
            target_name,
            manifest_byte_count: manifest.canonical_bytes.len(),
            source_file_count: sources.len(),
            source_total_bytes,
            export_started_at: started_at.clone(),
            export_plan_digest: export_plan_digest.clone(),
        };
        let payload = ExportStartedPayload {
            export_attempt_id: plan.export_attempt_id.clone(),
            export_plan_digest,
            decision_id: plan.decision_id.clone(),
            request_digest: plan.request_digest.clone(),
            proposal_digest: plan.proposal_digest.clone(),
            manifest_digest: plan.manifest_digest.clone(),
            destination_binding_id: plan.destination_binding_id.clone(),
            destination_fingerprint: plan.destination_fingerprint.clone(),
            target_name: plan.target_name.clone(),
            source_file_count: plan.source_file_count,
            source_total_bytes: plan.source_total_bytes,
            started_at: started_at.clone(),
        };
        let event = lifecycle_event(
            &plan.operation_id,
            &plan.export_attempt_id,
            4,
            "PACK_EXPORT_STARTED",
            "started",
            &started_at,
            &payload,
        )
        .map_err(|_| export_start_failed())?;
        if fail_start_persistence {
            return Err(export_start_failed());
        }
        let payload_json =
            bounded_payload_json(&event.payload).map_err(|_| export_start_failed())?;
        insert_event(&transaction, &event, &payload_json).map_err(|_| export_start_failed())?;
        let changed = transaction
            .execute(
                "UPDATE coding_pack_operations
                 SET state = 'export_started', last_event_sequence = 4
                 WHERE operation_id = ?1
                   AND state = 'decided_allow'
                   AND last_event_sequence = 3",
                [&plan.operation_id],
            )
            .map_err(|_| export_start_failed())?;
        if changed != 1 {
            return Err(export_start_failed());
        }
        transaction.commit().map_err(|_| export_start_failed())?;

        Ok(PreparedNativeExport {
            plan,
            destination_root: canonical_destination,
            manifest_bytes: manifest.canonical_bytes,
            sources,
        })
    }

    pub(crate) fn record_native_export_completed(
        &self,
        plan: &NativeExportPlan,
    ) -> Result<String, String> {
        self.record_native_export_completed_inner(plan, None, false)
    }

    fn record_native_export_completed_inner(
        &self,
        plan: &NativeExportPlan,
        completed_at_override: Option<&str>,
        fail_persistence: bool,
    ) -> Result<String, String> {
        let mut connection = self.lock().map_err(|_| completion_persistence_failed())?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| completion_persistence_failed())?;
        validate_started_plan(&transaction, plan).map_err(|_| completion_persistence_failed())?;
        let completed_at = match completed_at_override {
            Some(value) => value.to_string(),
            None => {
                database_timestamp(&transaction).map_err(|_| completion_persistence_failed())?
            }
        };
        if parse_timestamp(&completed_at).map_err(|_| completion_persistence_failed())?
            < parse_timestamp(&plan.export_started_at)
                .map_err(|_| completion_persistence_failed())?
        {
            return Err(completion_persistence_failed());
        }
        let payload = ExportCompletedPayload {
            export_attempt_id: plan.export_attempt_id.clone(),
            export_plan_digest: plan.export_plan_digest.clone(),
            manifest_digest: plan.manifest_digest.clone(),
            target_name: plan.target_name.clone(),
            source_file_count: plan.source_file_count,
            source_total_bytes: plan.source_total_bytes,
            completed_at: completed_at.clone(),
        };
        let event = lifecycle_event(
            &plan.operation_id,
            &plan.export_attempt_id,
            5,
            "PACK_EXPORT_COMPLETED",
            "completed",
            &completed_at,
            &payload,
        )
        .map_err(|_| completion_persistence_failed())?;
        if fail_persistence {
            return Err(completion_persistence_failed());
        }
        let payload_json =
            bounded_payload_json(&event.payload).map_err(|_| completion_persistence_failed())?;
        insert_event(&transaction, &event, &payload_json)
            .map_err(|_| completion_persistence_failed())?;
        let changed = transaction
            .execute(
                "UPDATE coding_pack_operations
                 SET state = 'export_completed', last_event_sequence = 5
                 WHERE operation_id = ?1
                   AND state = 'export_started'
                   AND last_event_sequence = 4",
                [&plan.operation_id],
            )
            .map_err(|_| completion_persistence_failed())?;
        if changed != 1 {
            return Err(completion_persistence_failed());
        }
        transaction
            .commit()
            .map_err(|_| completion_persistence_failed())?;
        Ok(completed_at)
    }

    pub(crate) fn record_native_export_interrupted(
        &self,
        plan: &NativeExportPlan,
        phase_code: &str,
        reason_code: &str,
    ) -> Result<String, String> {
        self.record_native_export_interrupted_inner(plan, phase_code, reason_code, None)
    }

    fn record_native_export_interrupted_inner(
        &self,
        plan: &NativeExportPlan,
        phase_code: &str,
        reason_code: &str,
        interrupted_at_override: Option<&str>,
    ) -> Result<String, String> {
        if !matches!(
            phase_code,
            "staging_create"
                | "manifest_write"
                | "source_write"
                | "flush"
                | "promotion"
                | "cleanup"
        ) || !is_reason_code(reason_code)
        {
            return Err("coding_pack_export_interrupted_persistence_failed".into());
        }
        let mut connection = self
            .lock()
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        validate_started_plan(&transaction, plan)
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        let interrupted_at = match interrupted_at_override {
            Some(value) => value.to_string(),
            None => database_timestamp(&transaction)
                .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?,
        };
        if parse_timestamp(&interrupted_at)
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?
            < parse_timestamp(&plan.export_started_at)
                .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?
        {
            return Err("coding_pack_export_interrupted_persistence_failed".into());
        }
        let payload = ExportInterruptedPayload {
            export_attempt_id: plan.export_attempt_id.clone(),
            export_plan_digest: plan.export_plan_digest.clone(),
            phase_code: phase_code.into(),
            physical_state: "not_promoted".into(),
            reason_code: reason_code.into(),
            interrupted_at: interrupted_at.clone(),
        };
        let event = lifecycle_event(
            &plan.operation_id,
            &plan.export_attempt_id,
            5,
            "PACK_EXPORT_INTERRUPTED",
            "interrupted",
            &interrupted_at,
            &payload,
        )
        .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        let payload_json = bounded_payload_json(&event.payload)
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        insert_event(&transaction, &event, &payload_json)
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        let changed = transaction
            .execute(
                "UPDATE coding_pack_operations
                 SET state = 'export_interrupted', last_event_sequence = 5
                 WHERE operation_id = ?1
                   AND state = 'export_started'
                   AND last_event_sequence = 4",
                [&plan.operation_id],
            )
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        if changed != 1 {
            return Err("coding_pack_export_interrupted_persistence_failed".into());
        }
        transaction
            .commit()
            .map_err(|_| "coding_pack_export_interrupted_persistence_failed".to_string())?;
        Ok(interrupted_at)
    }

    #[cfg(test)]
    pub(crate) fn begin_native_export_for_test(
        &self,
        request: &NativeExportRequest,
        project_root: &Path,
        started_at: &str,
        fail_start_persistence: bool,
    ) -> Result<PreparedNativeExport, String> {
        self.begin_native_export_inner(
            request,
            project_root,
            Some(started_at),
            fail_start_persistence,
        )
    }

    #[cfg(test)]
    pub(crate) fn fail_native_completion_for_test(
        &self,
        plan: &NativeExportPlan,
    ) -> Result<String, String> {
        self.record_native_export_completed_inner(plan, Some("2099-07-30T00:00:04.000Z"), true)
    }

    #[cfg(test)]
    pub(crate) fn record_native_completion_for_test(
        &self,
        plan: &NativeExportPlan,
    ) -> Result<String, String> {
        self.record_native_export_completed_inner(plan, Some("2099-07-30T00:00:04.000Z"), false)
    }

    #[cfg(test)]
    pub(crate) fn record_native_interruption_for_test(
        &self,
        plan: &NativeExportPlan,
        phase_code: &str,
        reason_code: &str,
    ) -> Result<String, String> {
        self.record_native_export_interrupted_inner(
            plan,
            phase_code,
            reason_code,
            Some("2099-07-30T00:00:04.000Z"),
        )
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection.lock().map_err(|_| store_unavailable())
    }
}

fn database_timestamp(connection: &Connection) -> Result<String, String> {
    let value: String = connection
        .query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })
        .map_err(|_| persistence_failed())?;
    parse_timestamp(&value)?;
    Ok(value)
}

fn lifecycle_event<T: Serialize>(
    operation_id: &str,
    export_attempt_id: &str,
    sequence: i64,
    event_type: &str,
    identity_suffix: &str,
    recorded_at: &str,
    payload: &T,
) -> Result<CodingPackEvent, String> {
    let payload = serde_json::to_value(payload).map_err(|_| persistence_failed())?;
    let payload_digest = sha256_canonical(&payload)?;
    let mut hasher = Sha256::new();
    hasher.update(operation_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(export_attempt_id.as_bytes());
    hasher.update(b"\0");
    hasher.update(identity_suffix.as_bytes());
    let event_identity = format!("{:x}", hasher.finalize());
    Ok(CodingPackEvent {
        event_id: format!("coding-pack-event-{}", &event_identity[..24]),
        operation_id: operation_id.into(),
        event_sequence: sequence,
        event_type: event_type.into(),
        event_version: 1,
        recorded_at: recorded_at.into(),
        payload_digest,
        payload,
    })
}

fn validate_started_plan(connection: &Connection, plan: &NativeExportPlan) -> Result<(), String> {
    let operation = select_operation(connection, &plan.operation_id)?
        .ok_or_else(completion_persistence_failed)?;
    let events = select_events(connection, &plan.operation_id)?;
    if operation.state != "export_started"
        || operation.last_event_sequence != 4
        || events.len() != 4
        || events[3].event_type != "PACK_EXPORT_STARTED"
        || events[3].event_sequence != 4
    {
        return Err(completion_persistence_failed());
    }
    let proposal = validate_proposed_pair(
        &CodingPackOperation {
            state: "proposed".into(),
            last_event_sequence: 1,
            ..operation.clone()
        },
        &events[0],
    )
    .map_err(|_| completion_persistence_failed())?;
    let approval = validate_confirmed_pair(
        &CodingPackOperation {
            state: "confirmed".into(),
            last_event_sequence: 2,
            ..operation.clone()
        },
        &events[1],
        &proposal,
    )
    .map_err(|_| completion_persistence_failed())?;
    let decision = validate_decided_pair(
        &CodingPackOperation {
            state: "decided_allow".into(),
            last_event_sequence: 3,
            ..operation.clone()
        },
        &events[2],
        &proposal,
        &approval,
        &events[1],
    )
    .map_err(|_| completion_persistence_failed())?;
    validate_event_envelope(&events[3]).map_err(|_| completion_persistence_failed())?;
    let started: ExportStartedPayload = serde_json::from_value(events[3].payload.clone())
        .map_err(|_| completion_persistence_failed())?;
    if decision.decision != "allow"
        || events[3].operation_id != operation.operation_id
        || events[3].event_version != 1
        || events[3].recorded_at != started.started_at
        || events[3].payload_digest != sha256_canonical(&events[3].payload)?
        || plan.schema_version != crate::coding_pack_export::EXPORT_PLAN_SCHEMA
        || plan.operation_id != operation.operation_id
        || plan.decision_id != decision.decision_id
        || plan.request_digest != decision.request_digest
        || plan.proposal_digest != proposal.proposal_digest
        || plan.candidate_paths_digest != proposal.candidate_paths_digest
        || plan.source_fingerprint != proposal.source_fingerprint
        || plan.pack_id != proposal.pack_id
        || plan.manifest_digest != proposal.manifest_digest
        || plan.destination_binding_id != proposal.destination_binding_id
        || plan.destination_fingerprint != proposal.destination_fingerprint
        || started.export_attempt_id != plan.export_attempt_id
        || started.export_plan_digest != plan.export_plan_digest
        || started.decision_id != plan.decision_id
        || started.request_digest != plan.request_digest
        || started.proposal_digest != plan.proposal_digest
        || started.manifest_digest != plan.manifest_digest
        || started.destination_binding_id != plan.destination_binding_id
        || started.destination_fingerprint != plan.destination_fingerprint
        || started.target_name != plan.target_name
        || started.source_file_count != plan.source_file_count
        || started.source_total_bytes != plan.source_total_bytes
        || started.started_at != plan.export_started_at
        || parse_timestamp(&started.started_at)? < parse_timestamp(&decision.decided_at)?
        || parse_timestamp(&started.started_at)? >= parse_timestamp(&proposal.expires_at)?
        || parse_timestamp(&started.started_at)? >= parse_timestamp(&approval.expires_at)?
    {
        return Err(completion_persistence_failed());
    }
    let mut plan_value = serde_json::to_value(plan).map_err(|_| completion_persistence_failed())?;
    plan_value
        .as_object_mut()
        .ok_or_else(completion_persistence_failed)?
        .remove("exportPlanDigest");
    if sha256_canonical(&plan_value)? != plan.export_plan_digest {
        return Err(completion_persistence_failed());
    }
    Ok(())
}

fn is_reason_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().enumerate().all(|(index, byte)| {
            matches!(byte, b'a'..=b'z' | b'0'..=b'9' | b'_')
                && (index > 0 || byte.is_ascii_lowercase())
        })
}

fn export_not_allowed() -> String {
    "coding_pack_export_not_allowed".into()
}

fn export_start_failed() -> String {
    "coding_pack_export_start_persistence_failed".into()
}

fn completion_persistence_failed() -> String {
    "coding_pack_export_completion_persistence_failed".into()
}

fn configure_connection(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|_| store_unavailable())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = FULL;",
        )
        .map_err(|_| store_unavailable())
}

pub fn migrate_database(connection: &Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|_| store_unavailable())?;
    if version > CODING_PACK_DATABASE_SCHEMA_VERSION {
        return Err(store_unavailable());
    }
    if version == 0 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|_| persistence_failed())?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS coding_pack_store_metadata (
                    schema_version TEXT PRIMARY KEY NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS coding_pack_destination_bindings (
                    destination_binding_id TEXT PRIMARY KEY NOT NULL,
                    destination_fingerprint TEXT NOT NULL,
                    display_label TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    restart_available INTEGER NOT NULL,
                    private_absolute_path TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS coding_pack_operations (
                    operation_id TEXT PRIMARY KEY NOT NULL,
                    state TEXT NOT NULL,
                    project_binding_id TEXT NOT NULL,
                    project_generation INTEGER NOT NULL,
                    candidate_paths_digest TEXT NOT NULL,
                    source_fingerprint TEXT NOT NULL,
                    pack_id TEXT NOT NULL,
                    manifest_digest TEXT NOT NULL,
                    destination_binding_id TEXT NOT NULL
                        REFERENCES coding_pack_destination_bindings(destination_binding_id),
                    proposal_digest TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_event_sequence INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS coding_pack_events (
                    event_id TEXT PRIMARY KEY NOT NULL,
                    operation_id TEXT NOT NULL
                        REFERENCES coding_pack_operations(operation_id) ON DELETE CASCADE,
                    event_sequence INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    event_version INTEGER NOT NULL,
                    recorded_at TEXT NOT NULL,
                    payload_digest TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    UNIQUE(operation_id, event_sequence)
                 );
                 CREATE INDEX IF NOT EXISTS idx_coding_pack_events_operation_sequence
                    ON coding_pack_events(operation_id, event_sequence);
                 INSERT INTO coding_pack_store_metadata(schema_version)
                    VALUES ('kerniq.coding-pack.store.v3');
                 PRAGMA user_version = 3;",
            )
            .map_err(|_| persistence_failed())?;
        transaction.commit().map_err(|_| persistence_failed())?;
    }
    if version == 1 || version == 2 {
        let previous_schema = if version == 1 {
            "kerniq.coding-pack.store.v1"
        } else {
            "kerniq.coding-pack.store.v2"
        };
        let transaction = connection
            .unchecked_transaction()
            .map_err(|_| persistence_failed())?;
        transaction
            .execute(
                "UPDATE coding_pack_store_metadata
                 SET schema_version = 'kerniq.coding-pack.store.v3'
                 WHERE schema_version = ?1",
                [previous_schema],
            )
            .map_err(|_| persistence_failed())
            .and_then(|changed| {
                if changed == 1 {
                    Ok(())
                } else {
                    Err(persistence_failed())
                }
            })?;
        transaction
            .execute_batch("PRAGMA user_version = 3;")
            .map_err(|_| persistence_failed())?;
        transaction.commit().map_err(|_| persistence_failed())?;
    }
    let schema: String = connection
        .query_row(
            "SELECT schema_version FROM coding_pack_store_metadata LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| store_unavailable())?;
    if schema != CODING_PACK_STORE_SCHEMA_VERSION {
        return Err(store_unavailable());
    }
    Ok(())
}

fn insert_operation(
    transaction: &rusqlite::Transaction<'_>,
    operation: &CodingPackOperation,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO coding_pack_operations (
                operation_id, state, project_binding_id, project_generation,
                candidate_paths_digest, source_fingerprint, pack_id, manifest_digest,
                destination_binding_id, proposal_digest, created_at, expires_at,
                last_event_sequence
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                operation.operation_id,
                operation.state,
                operation.project_binding_id,
                operation.project_generation,
                operation.candidate_paths_digest,
                operation.source_fingerprint,
                operation.pack_id,
                operation.manifest_digest,
                operation.destination_binding_id,
                operation.proposal_digest,
                operation.created_at,
                operation.expires_at,
                operation.last_event_sequence,
            ],
        )
        .map_err(|_| persistence_failed())?;
    Ok(())
}

fn insert_event(
    transaction: &rusqlite::Transaction<'_>,
    event: &CodingPackEvent,
    payload_json: &str,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO coding_pack_events (
                event_id, operation_id, event_sequence, event_type, event_version,
                recorded_at, payload_digest, payload_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                event.event_id,
                event.operation_id,
                event.event_sequence,
                event.event_type,
                event.event_version,
                event.recorded_at,
                event.payload_digest,
                payload_json,
            ],
        )
        .map_err(|_| persistence_failed())?;
    Ok(())
}

fn select_operation(
    connection: &Connection,
    operation_id: &str,
) -> Result<Option<CodingPackOperation>, String> {
    connection
        .query_row(
            "SELECT operation_id, state, project_binding_id, project_generation,
                    candidate_paths_digest, source_fingerprint, pack_id, manifest_digest,
                    destination_binding_id, proposal_digest, created_at, expires_at,
                    last_event_sequence
             FROM coding_pack_operations
             WHERE operation_id = ?1",
            [operation_id],
            operation_from_row,
        )
        .optional()
        .map_err(|_| store_unavailable())
}

fn operation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CodingPackOperation> {
    Ok(CodingPackOperation {
        operation_id: row.get(0)?,
        state: row.get(1)?,
        project_binding_id: row.get(2)?,
        project_generation: row.get(3)?,
        candidate_paths_digest: row.get(4)?,
        source_fingerprint: row.get(5)?,
        pack_id: row.get(6)?,
        manifest_digest: row.get(7)?,
        destination_binding_id: row.get(8)?,
        proposal_digest: row.get(9)?,
        created_at: row.get(10)?,
        expires_at: row.get(11)?,
        last_event_sequence: row.get(12)?,
    })
}

fn select_events(
    connection: &Connection,
    operation_id: &str,
) -> Result<Vec<CodingPackEvent>, String> {
    let mut statement = connection
        .prepare(
            "SELECT event_id, operation_id, event_sequence, event_type, event_version,
                    recorded_at, payload_digest, payload_json
             FROM coding_pack_events
             WHERE operation_id = ?1
             ORDER BY event_sequence ASC",
        )
        .map_err(|_| store_unavailable())?;
    let rows = statement
        .query_map([operation_id], |row| {
            let payload_json: String = row.get(7)?;
            let payload = serde_json::from_str(&payload_json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    payload_json.len(),
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
            Ok(CodingPackEvent {
                event_id: row.get(0)?,
                operation_id: row.get(1)?,
                event_sequence: row.get(2)?,
                event_type: row.get(3)?,
                event_version: row.get(4)?,
                recorded_at: row.get(5)?,
                payload_digest: row.get(6)?,
                payload,
            })
        })
        .map_err(|_| store_unavailable())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| store_unavailable())
}

fn select_destination_public(
    connection: &Connection,
    destination_binding_id: &str,
) -> Result<Option<CodingPackDestinationBinding>, String> {
    connection
        .query_row(
            "SELECT destination_binding_id, destination_fingerprint, display_label,
                    created_at, restart_available
             FROM coding_pack_destination_bindings
             WHERE destination_binding_id = ?1",
            [destination_binding_id],
            |row| {
                Ok(CodingPackDestinationBinding {
                    destination_binding_id: row.get(0)?,
                    destination_fingerprint: row.get(1)?,
                    display_label: row.get(2)?,
                    created_at: row.get(3)?,
                    restart_available: row.get::<_, i64>(4)? == 1,
                })
            },
        )
        .optional()
        .map_err(|_| store_unavailable())
}

struct PrivateDestinationBinding {
    binding: CodingPackDestinationBinding,
    private_absolute_path: String,
}

fn select_destination_private(
    connection: &Connection,
    destination_binding_id: &str,
) -> Result<Option<PrivateDestinationBinding>, String> {
    connection
        .query_row(
            "SELECT destination_binding_id, destination_fingerprint, display_label,
                    created_at, restart_available, private_absolute_path
             FROM coding_pack_destination_bindings
             WHERE destination_binding_id = ?1",
            [destination_binding_id],
            |row| {
                Ok(PrivateDestinationBinding {
                    binding: CodingPackDestinationBinding {
                        destination_binding_id: row.get(0)?,
                        destination_fingerprint: row.get(1)?,
                        display_label: row.get(2)?,
                        created_at: row.get(3)?,
                        restart_available: row.get::<_, i64>(4)? == 1,
                    },
                    private_absolute_path: row.get(5)?,
                })
            },
        )
        .optional()
        .map_err(|_| store_unavailable())
}

fn validate_proposed_pair(
    operation: &CodingPackOperation,
    event: &CodingPackEvent,
) -> Result<CodingPackExportProposal, String> {
    validate_operation(operation)?;
    validate_event_envelope(event)?;
    if operation.state != "proposed"
        || operation.last_event_sequence != 1
        || event.operation_id != operation.operation_id
        || event.event_sequence != 1
        || event.event_type != "PACK_PROPOSED"
        || event.event_version != 1
    {
        return Err(persistence_failed());
    }
    let payload: ProposedPayload =
        serde_json::from_value(event.payload.clone()).map_err(|_| persistence_failed())?;
    validate_proposal(&payload.proposal)?;
    if event.recorded_at != payload.proposal.created_at
        || event.payload_digest != sha256_canonical(&event.payload)?
        || !operation_matches_proposal(operation, &payload.proposal)
    {
        return Err(persistence_failed());
    }
    Ok(payload.proposal)
}

fn validate_confirmed_pair(
    operation: &CodingPackOperation,
    event: &CodingPackEvent,
    proposal: &CodingPackExportProposal,
) -> Result<CodingPackExportApproval, String> {
    validate_operation(operation)?;
    validate_event_envelope(event)?;
    if operation.state != "confirmed"
        || operation.last_event_sequence != 2
        || event.operation_id != operation.operation_id
        || event.event_sequence != 2
        || event.event_type != "PACK_CONFIRMED"
        || event.event_version != 1
    {
        return Err(persistence_failed());
    }
    let payload: ConfirmedPayload =
        serde_json::from_value(event.payload.clone()).map_err(|_| persistence_failed())?;
    validate_approval(&payload.approval, proposal)?;
    if event.recorded_at != payload.approval.approved_at
        || parse_timestamp(&event.recorded_at)? < parse_timestamp(&proposal.created_at)?
        || event.payload_digest != sha256_canonical(&event.payload)?
    {
        return Err(persistence_failed());
    }
    Ok(payload.approval)
}

fn validate_decided_pair(
    operation: &CodingPackOperation,
    event: &CodingPackEvent,
    proposal: &CodingPackExportProposal,
    approval: &CodingPackExportApproval,
    confirmed_event: &CodingPackEvent,
) -> Result<DecidedPayload, String> {
    validate_operation(operation)?;
    validate_event_envelope(event)?;
    let payload: DecidedPayload =
        serde_json::from_value(event.payload.clone()).map_err(|_| persistence_failed())?;
    validate_decided_payload(&payload)?;
    if operation.state != decision_state(&payload.decision)?
        || operation.last_event_sequence != 3
        || event.operation_id != operation.operation_id
        || event.event_sequence != 3
        || event.event_type != "PACK_DECIDED"
        || event.event_version != 1
        || payload.request_digest
            != coding_pack_agentfuse_request_digest(proposal, &confirmed_event.payload_digest)?
        || payload.proposal_digest != proposal.proposal_digest
        || payload.approval_evidence_digest != confirmed_event.payload_digest
        || event.recorded_at != payload.decided_at
        || parse_timestamp(&payload.evaluation_started_at)?
            < parse_timestamp(&approval.approved_at)?
        || parse_timestamp(&payload.evaluation_started_at)?
            >= parse_timestamp(&approval.expires_at)?
        || parse_timestamp(&payload.evaluation_started_at)?
            >= parse_timestamp(&proposal.expires_at)?
        || parse_timestamp(&payload.decided_at)? < parse_timestamp(&payload.evaluation_started_at)?
        || (payload.decision != "error"
            && (parse_timestamp(&payload.decided_at)? >= parse_timestamp(&approval.expires_at)?
                || parse_timestamp(&payload.decided_at)? >= parse_timestamp(&proposal.expires_at)?))
        || event.payload_digest != sha256_canonical(&event.payload)?
        || !operation_matches_proposal(operation, proposal)
    {
        return Err(persistence_failed());
    }
    Ok(payload)
}

fn validate_decided_payload(payload: &DecidedPayload) -> Result<(), String> {
    validate_opaque_id(&payload.decision_id)?;
    if !is_digest(&payload.request_digest)
        || !is_digest(&payload.proposal_digest)
        || !is_digest(&payload.approval_evidence_digest)
        || payload.agent_fuse_source_commit != AGENTFUSE_SOURCE_COMMIT
        || payload.agent_fuse_package_version != AGENTFUSE_PACKAGE_VERSION
        || payload.bridge_protocol != AGENTFUSE_BRIDGE_PROTOCOL
        || payload.policy_id != CODING_PACK_EXPORT_POLICY_ID
        || payload.policy_digest != CODING_PACK_EXPORT_POLICY_DIGEST
        || !matches!(payload.decision.as_str(), "allow" | "deny" | "error")
        || !valid_reason_code(&payload.reason_code)
    {
        return Err(persistence_failed());
    }
    parse_timestamp(&payload.evaluation_started_at)?;
    parse_timestamp(&payload.decided_at)?;
    Ok(())
}

fn validate_operation(operation: &CodingPackOperation) -> Result<(), String> {
    validate_opaque_id(&operation.operation_id)?;
    validate_opaque_id(&operation.project_binding_id)?;
    if !matches!(
        operation.state.as_str(),
        "proposed"
            | "confirmed"
            | "decided_allow"
            | "decided_deny"
            | "decided_error"
            | "export_started"
            | "export_completed"
            | "export_interrupted"
    ) {
        return Err(persistence_failed());
    }
    if operation.project_generation < 1
        || operation.last_event_sequence < 1
        || !is_digest(&operation.candidate_paths_digest)
        || !is_digest(&operation.source_fingerprint)
        || !is_pack_id(&operation.pack_id)
        || !is_digest(&operation.manifest_digest)
        || !is_destination_binding_id(&operation.destination_binding_id)
        || !is_digest(&operation.proposal_digest)
    {
        return Err(persistence_failed());
    }
    validate_lifetime(
        &operation.created_at,
        &operation.expires_at,
        MAX_PROPOSAL_LIFETIME_MS,
    )
}

fn decision_state(decision: &str) -> Result<&'static str, String> {
    match decision {
        "allow" => Ok("decided_allow"),
        "deny" => Ok("decided_deny"),
        "error" => Ok("decided_error"),
        _ => Err(persistence_failed()),
    }
}

fn valid_reason_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

fn validate_event_envelope(event: &CodingPackEvent) -> Result<(), String> {
    validate_opaque_id(&event.event_id)?;
    validate_opaque_id(&event.operation_id)?;
    if event.event_sequence < 1 || event.event_version != 1 || !is_digest(&event.payload_digest) {
        return Err(persistence_failed());
    }
    parse_timestamp(&event.recorded_at)?;
    Ok(())
}

fn validate_proposal(proposal: &CodingPackExportProposal) -> Result<(), String> {
    validate_opaque_id(&proposal.operation_id)?;
    validate_opaque_id(&proposal.project_binding_id)?;
    if proposal.schema_version != EXPORT_PROPOSAL_SCHEMA
        || proposal.export_format != EXPORT_FORMAT
        || proposal.project_generation < 1
        || !is_digest(&proposal.candidate_paths_digest)
        || !is_digest(&proposal.source_fingerprint)
        || !is_pack_id(&proposal.pack_id)
        || !is_digest(&proposal.manifest_digest)
        || !is_destination_binding_id(&proposal.destination_binding_id)
        || !is_digest(&proposal.destination_fingerprint)
        || !is_digest(&proposal.proposal_digest)
    {
        return Err(persistence_failed());
    }
    validate_lifetime(
        &proposal.created_at,
        &proposal.expires_at,
        MAX_PROPOSAL_LIFETIME_MS,
    )?;
    if proposal.proposal_digest != proposal_digest(proposal)? {
        return Err(persistence_failed());
    }
    Ok(())
}

fn validate_approval(
    approval: &CodingPackExportApproval,
    proposal: &CodingPackExportProposal,
) -> Result<(), String> {
    validate_opaque_id(&approval.operation_id)?;
    if approval.schema_version != EXPORT_APPROVAL_SCHEMA
        || !is_digest(&approval.proposal_digest)
        || approval.operation_id != proposal.operation_id
        || approval.proposal_digest != proposal.proposal_digest
    {
        return Err(persistence_failed());
    }
    validate_lifetime(
        &approval.approved_at,
        &approval.expires_at,
        MAX_APPROVAL_LIFETIME_MS,
    )?;
    let approved_at = parse_timestamp(&approval.approved_at)?;
    let approval_expires_at = parse_timestamp(&approval.expires_at)?;
    let proposal_expires_at = parse_timestamp(&proposal.expires_at)?;
    if approved_at >= proposal_expires_at || approval_expires_at > proposal_expires_at {
        return Err(persistence_failed());
    }
    Ok(())
}

fn operation_matches_proposal(
    operation: &CodingPackOperation,
    proposal: &CodingPackExportProposal,
) -> bool {
    operation.operation_id == proposal.operation_id
        && operation.project_binding_id == proposal.project_binding_id
        && operation.project_generation == proposal.project_generation
        && operation.candidate_paths_digest == proposal.candidate_paths_digest
        && operation.source_fingerprint == proposal.source_fingerprint
        && operation.pack_id == proposal.pack_id
        && operation.manifest_digest == proposal.manifest_digest
        && operation.destination_binding_id == proposal.destination_binding_id
        && operation.proposal_digest == proposal.proposal_digest
        && operation.created_at == proposal.created_at
        && operation.expires_at == proposal.expires_at
}

fn immutable_operation_fields_match(
    current: &CodingPackOperation,
    next: &CodingPackOperation,
) -> bool {
    current.operation_id == next.operation_id
        && current.project_binding_id == next.project_binding_id
        && current.project_generation == next.project_generation
        && current.candidate_paths_digest == next.candidate_paths_digest
        && current.source_fingerprint == next.source_fingerprint
        && current.pack_id == next.pack_id
        && current.manifest_digest == next.manifest_digest
        && current.destination_binding_id == next.destination_binding_id
        && current.proposal_digest == next.proposal_digest
        && current.created_at == next.created_at
        && current.expires_at == next.expires_at
}

fn bounded_payload_json(payload: &Value) -> Result<String, String> {
    let serialized = serde_json::to_string(payload).map_err(|_| persistence_failed())?;
    if serialized.len() > MAX_EVENT_PAYLOAD_BYTES {
        return Err(persistence_failed());
    }
    Ok(serialized)
}

fn proposal_digest(proposal: &CodingPackExportProposal) -> Result<String, String> {
    let mut value = serde_json::to_value(proposal).map_err(|_| persistence_failed())?;
    let object = value.as_object_mut().ok_or_else(persistence_failed)?;
    object.remove("proposalDigest");
    sha256_canonical(&value)
}

fn coding_pack_agentfuse_request_digest(
    proposal: &CodingPackExportProposal,
    approval_evidence_digest: &str,
) -> Result<String, String> {
    if absolute_path_like(&proposal.operation_id) {
        return Err(persistence_failed());
    }
    sha256_canonical(&serde_json::json!({
        "toolIdentity": CODING_PACK_AGENTFUSE_EXPORT_TOOL,
        "request": {
            "protocolVersion": CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
            "operationId": proposal.operation_id,
            "proposalDigest": proposal.proposal_digest,
            "approvalEvidenceDigest": approval_evidence_digest,
            "candidatePathsDigest": proposal.candidate_paths_digest,
            "sourceFingerprint": proposal.source_fingerprint,
            "packId": proposal.pack_id,
            "manifestDigest": proposal.manifest_digest,
            "destinationBindingId": proposal.destination_binding_id,
            "destinationFingerprint": proposal.destination_fingerprint,
            "exportFormat": EXPORT_FORMAT,
        },
    }))
}

pub(crate) fn sha256_canonical(value: &Value) -> Result<String, String> {
    let canonical = canonical_json(value)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

pub(crate) fn canonical_json(value: &Value) -> Result<String, String> {
    match value {
        Value::Null => Ok("null".into()),
        Value::Bool(boolean) => Ok(boolean.to_string()),
        Value::String(string) => serde_json::to_string(string).map_err(|_| persistence_failed()),
        Value::Number(number) => {
            const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
            if let Some(value) = number.as_i64() {
                if value.unsigned_abs() > MAX_SAFE_INTEGER {
                    return Err(persistence_failed());
                }
                Ok(value.to_string())
            } else if let Some(value) = number.as_u64() {
                if value > MAX_SAFE_INTEGER {
                    return Err(persistence_failed());
                }
                Ok(value.to_string())
            } else {
                Err(persistence_failed())
            }
        }
        Value::Array(items) => Ok(format!(
            "[{}]",
            items
                .iter()
                .map(canonical_json)
                .collect::<Result<Vec<_>, _>>()?
                .join(",")
        )),
        Value::Object(object) => {
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by(|(left, _), (right, _)| left.as_bytes().cmp(right.as_bytes()));
            let serialized = entries
                .into_iter()
                .map(|(key, item)| {
                    let key = serde_json::to_string(key).map_err(|_| persistence_failed())?;
                    Ok(format!("{key}:{}", canonical_json(item)?))
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(format!("{{{}}}", serialized.join(",")))
        }
    }
}

fn validate_lifetime(created_at: &str, expires_at: &str, maximum: i64) -> Result<(), String> {
    let created = parse_timestamp(created_at)?;
    let expires = parse_timestamp(expires_at)?;
    if expires <= created || expires - created > maximum {
        return Err(persistence_failed());
    }
    Ok(())
}

pub(crate) fn parse_timestamp(value: &str) -> Result<i64, String> {
    validate_external_string(value, 64, false)?;
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
    {
        return Err(persistence_failed());
    }
    let year = parse_digits(bytes, 0, 4)?;
    let month = parse_digits(bytes, 5, 2)?;
    let day = parse_digits(bytes, 8, 2)?;
    let hour = parse_digits(bytes, 11, 2)?;
    let minute = parse_digits(bytes, 14, 2)?;
    let second = parse_digits(bytes, 17, 2)?;
    let millis = parse_digits(bytes, 20, 3)?;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => return Err(persistence_failed()),
    };
    if day < 1 || day > days_in_month || hour > 23 || minute > 59 || second > 59 {
        return Err(persistence_failed());
    }
    let days = days_from_civil(year, month, day);
    Ok((((days * 24 + hour) * 60 + minute) * 60 + second) * 1000 + millis)
}

fn parse_digits(bytes: &[u8], start: usize, length: usize) -> Result<i64, String> {
    let mut value = 0_i64;
    for byte in &bytes[start..start + length] {
        if !byte.is_ascii_digit() {
            return Err(persistence_failed());
        }
        value = value * 10 + i64::from(byte - b'0');
    }
    Ok(value)
}

fn is_leap_year(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let adjusted_year = year - i64::from(month <= 2);
    let era = if adjusted_year >= 0 {
        adjusted_year
    } else {
        adjusted_year - 399
    } / 400;
    let year_of_era = adjusted_year - era * 400;
    let adjusted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * adjusted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn current_time_millis() -> Result<i64, String> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| persistence_failed())?;
    i64::try_from(duration.as_millis()).map_err(|_| persistence_failed())
}

fn validate_opaque_id(value: &str) -> Result<(), String> {
    validate_external_string(value, MAX_ID_BYTES, true)
}

fn absolute_path_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.starts_with('/')
        || value.starts_with('\\')
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'))
        || value
            .get(..7)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("file://"))
}

fn validate_external_string(
    value: &str,
    maximum_bytes: usize,
    reject_controls: bool,
) -> Result<(), String> {
    if value.is_empty()
        || value.len() > maximum_bytes
        || (reject_controls && value.chars().any(char::is_control))
    {
        return Err(persistence_failed());
    }
    Ok(())
}

fn validate_display_label(value: &str) -> Result<(), String> {
    if value.trim().is_empty() || validate_external_string(value, MAX_LABEL_BYTES, true).is_err() {
        return Err(destination_unavailable());
    }
    Ok(())
}

fn is_digest(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_pack_id(value: &str) -> bool {
    value.len() == 69
        && value.starts_with("pack-")
        && value[5..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn is_destination_binding_id(value: &str) -> bool {
    value.len() == 36
        && value.starts_with("destination-")
        && value[12..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn canonical_destination(path: &Path) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| destination_unavailable())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(destination_unavailable());
    }
    fs::canonicalize(path).map_err(|_| destination_unavailable())
}

fn destination_identity(canonical: &Path) -> Result<(String, String, String), String> {
    let private_path = canonical
        .to_str()
        .ok_or_else(destination_unavailable)?
        .to_string();
    validate_external_string(&private_path, 16 * 1024, false)
        .map_err(|_| destination_unavailable())?;
    let mut hasher = Sha256::new();
    hasher.update(b"tauri\0");
    hasher.update(private_path.as_bytes());
    let fingerprint_hex = format!("{:x}", hasher.finalize());
    Ok((
        private_path,
        format!("sha256:{fingerprint_hex}"),
        format!("destination-{}", &fingerprint_hex[..24]),
    ))
}

fn store_unavailable() -> String {
    "coding_pack_store_unavailable".into()
}

fn destination_unavailable() -> String {
    "coding_pack_destination_unavailable".into()
}

fn persistence_failed() -> String {
    "coding_pack_persistence_failed".into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::coding_pack_export::{
        safely_remove_owned_staging, write_atomic_bundle, write_atomic_bundle_with_fault,
        ExportFault,
    };

    #[test]
    fn fresh_schema_creation_and_migration_are_idempotent() {
        let connection = Connection::open_in_memory().unwrap();
        configure_connection(&connection).unwrap();
        migrate_database(&connection).unwrap();
        migrate_database(&connection).unwrap();
        assert_eq!(schema_version(&connection), 3);
        assert!(table_exists(&connection, "coding_pack_operations"));
        assert!(table_exists(&connection, "coding_pack_events"));
        assert!(table_exists(
            &connection,
            "coding_pack_destination_bindings"
        ));
        let schema: String = connection
            .query_row(
                "SELECT schema_version FROM coding_pack_store_metadata",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(schema, CODING_PACK_STORE_SCHEMA_VERSION);
        let synchronous: i64 = connection
            .query_row("PRAGMA synchronous", [], |row| row.get(0))
            .unwrap();
        assert_eq!(synchronous, 2);
    }

    #[test]
    fn v1_and_v2_records_migrate_without_automatic_export() {
        let root = test_root();
        for (version, confirmed) in [(1, false), (1, true), (2, true)] {
            let suffix = format!(
                "v{version}-{}",
                if confirmed { "confirmed" } else { "proposed" }
            );
            let destination = root.join(format!("exports-{suffix}"));
            fs::create_dir_all(&destination).unwrap();
            let database_path = root.join(format!("{suffix}.sqlite3"));
            let database = CodingPackDatabase::open_path(&database_path).unwrap();
            let binding = database
                .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
                .unwrap();
            let proposed = proposed_request(&binding);
            database.create_operation(proposed.clone()).unwrap();
            if confirmed {
                database
                    .append_confirmation(confirmation_request(&proposed))
                    .unwrap();
            }
            drop(database);

            let legacy = Connection::open(&database_path).unwrap();
            configure_connection(&legacy).unwrap();
            legacy
                .execute(
                    "UPDATE coding_pack_store_metadata
                         SET schema_version = ?1",
                    [format!("kerniq.coding-pack.store.v{version}")],
                )
                .unwrap();
            legacy
                .execute_batch(&format!("PRAGMA user_version = {version};"))
                .unwrap();
            drop(legacy);

            let migrated = CodingPackDatabase::open_path(&database_path).unwrap();
            let snapshot = migrated
                .get_operation_snapshot_data("operation-1")
                .unwrap()
                .unwrap();
            assert_eq!(
                snapshot.operation.state,
                if confirmed { "confirmed" } else { "proposed" }
            );
            assert_eq!(snapshot.events.len(), if confirmed { 2 } else { 1 });
            assert!(snapshot
                .events
                .iter()
                .all(|event| !event.event_type.starts_with("PACK_EXPORT_")));
            let connection = migrated.lock().unwrap();
            assert_eq!(schema_version(&connection), 3);
            let schema: String = connection
                .query_row(
                    "SELECT schema_version FROM coding_pack_store_metadata",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(schema, CODING_PACK_STORE_SCHEMA_VERSION);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn canonical_vectors_match_the_typescript_implementation() {
        let proposal_without_digest = serde_json::json!({
            "schemaVersion": EXPORT_PROPOSAL_SCHEMA,
            "operationId": "operation-vector-🌟",
            "projectBindingId": "project-vector",
            "projectGeneration": 7,
            "candidatePathsDigest": digest('1'),
            "sourceFingerprint": digest('2'),
            "packId": pack_id('3'),
            "manifestDigest": digest('4'),
            "destinationBindingId": format!("destination-{}", "a".repeat(24)),
            "destinationFingerprint": digest('5'),
            "exportFormat": EXPORT_FORMAT,
            "createdAt": "2026-07-30T00:00:00.000Z",
            "expiresAt": "2026-07-30T00:10:00.000Z"
        });
        let proposal_digest = sha256_canonical(&proposal_without_digest).unwrap();
        assert_eq!(
            proposal_digest,
            "sha256:50d56ad331620d45c343d10b4df06192ebdc94cfd7d1df1637debc857cc331a2"
        );
        let mut proposal = proposal_without_digest;
        proposal
            .as_object_mut()
            .unwrap()
            .insert("proposalDigest".into(), proposal_digest.into());
        assert_eq!(
            sha256_canonical(&serde_json::json!({ "proposal": proposal.clone() })).unwrap(),
            "sha256:24dcd9be102988d7e00e373b07afe8c02d768f260c393430dcb4896bea76f66a"
        );
        let mut hasher = Sha256::new();
        hasher.update(b"tauri\0/fixture/Exports");
        assert_eq!(
            format!("sha256:{:x}", hasher.finalize()),
            "sha256:1d742926433865d0d7a3e5f69c6f989a1a86b89aa045f0b78b1be4862b8a4214"
        );
        assert_eq!(
            sha256_canonical(&serde_json::json!({
                "toolIdentity": CODING_PACK_AGENTFUSE_EXPORT_TOOL,
                "request": {
                    "protocolVersion": CODING_PACK_AGENTFUSE_EXPORT_PROTOCOL,
                    "operationId": "operation-1",
                    "proposalDigest": digest('a'),
                    "approvalEvidenceDigest": digest('b'),
                    "candidatePathsDigest": digest('c'),
                    "sourceFingerprint": digest('a'),
                    "packId": pack_id('b'),
                    "manifestDigest": digest('c'),
                    "destinationBindingId": format!("destination-{}", "c".repeat(24)),
                    "destinationFingerprint": digest('b'),
                    "exportFormat": EXPORT_FORMAT,
                },
            }))
            .unwrap(),
            "sha256:28c7e50774a4b51e62a476a73567886b94b52367d7cc1b534ce6426d4762f917"
        );
        let mut absolute_operation: CodingPackExportProposal =
            serde_json::from_value(proposal).unwrap();
        absolute_operation.operation_id = "/private/export".into();
        assert!(coding_pack_agentfuse_request_digest(&absolute_operation, &digest('b')).is_err());
    }

    #[test]
    fn native_manifest_rejects_portable_project_labels_that_look_absolute() {
        let root = test_root();
        let project = root.join("project");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::write(
            project.join("src/main.ts"),
            b"export const kerniq = true;\n",
        )
        .unwrap();

        for label in [
            "/Users/private/project",
            r"C:\Users\private\project",
            r"\\server\private\project",
            "file:///Users/private/project",
        ] {
            let mut manifest: Value = serde_json::from_str(&manifest_fixture(&project)).unwrap();
            manifest["project"] = serde_json::json!({ "projectLabel": label });
            manifest.as_object_mut().unwrap().remove("manifestDigest");
            let manifest_digest = sha256_canonical(&manifest).unwrap();
            manifest["manifestDigest"] = manifest_digest.into();
            assert_eq!(
                validate_manifest(&canonical_json(&manifest).unwrap()).unwrap_err(),
                "coding_pack_manifest_mismatch"
            );
        }

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn durable_lifecycle_is_transactional_and_restart_readable() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database_path = root.join("coding-pack.sqlite3");
        let database = CodingPackDatabase::open_path(&database_path).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let proposed = proposed_request(&binding);
        database.create_operation(proposed.clone()).unwrap();
        drop(database);

        let restarted = CodingPackDatabase::open_path(&database_path).unwrap();
        let snapshot = restarted
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "proposed");
        assert_eq!(restarted.list_operation_ids().unwrap(), ["operation-1"]);
        restarted
            .append_confirmation(confirmation_request(&proposed))
            .unwrap();
        let stored = restarted
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(stored.operation.state, "confirmed");
        assert_eq!(stored.operation.last_event_sequence, 2);
        assert_eq!(stored.events.len(), 2);
        let decided = decision_request(&stored);
        restarted.append_decision(decided.clone()).unwrap();
        assert!(restarted.append_decision(decided).is_err());
        drop(restarted);

        let decided_restart = CodingPackDatabase::open_path(&database_path).unwrap();
        let durable_decision = decided_restart
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(durable_decision.operation.state, "decided_allow");
        assert_eq!(durable_decision.operation.last_event_sequence, 3);
        assert_eq!(durable_decision.events.len(), 3);
        drop(decided_restart);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicate_and_out_of_sequence_confirmation_fail_without_state_change() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let proposed = proposed_request(&binding);
        database.create_operation(proposed.clone()).unwrap();
        let mut duplicate = confirmation_request(&proposed);
        duplicate.confirmed_event.event_id = "event-1".into();
        assert!(database.append_confirmation(duplicate).is_err());
        assert_eq!(
            database
                .get_operation_snapshot_data("operation-1")
                .unwrap()
                .unwrap()
                .operation
                .state,
            "proposed"
        );
        let mut out_of_sequence = confirmation_request(&proposed);
        out_of_sequence.confirmed_event.event_sequence = 3;
        assert!(database.append_confirmation(out_of_sequence).is_err());
        assert_eq!(
            database
                .get_operation_snapshot_data("operation-1")
                .unwrap()
                .unwrap()
                .events
                .len(),
            1
        );
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_absolute_path_is_private_and_corrupt_event_json_fails_closed() {
        let root = test_root();
        let destination = root.join("private-exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        assert!(!serde_json::to_string(&binding)
            .unwrap()
            .contains(&destination.to_string_lossy().to_string()));
        database
            .create_operation(proposed_request(&binding))
            .unwrap();
        database
            .lock()
            .unwrap()
            .execute(
                "UPDATE coding_pack_events SET payload_json = 'not-json'
                 WHERE event_id = 'event-1'",
                [],
            )
            .unwrap();
        assert!(database.get_operation_snapshot_data("operation-1").is_err());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_binding_is_idempotent_and_never_rebound() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let first = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let again = database
            .bind_destination(&destination, "2026-07-30T00:01:00.000Z".into())
            .unwrap();
        assert_eq!(again.created_at, first.created_at);
        database
            .lock()
            .unwrap()
            .execute(
                "UPDATE coding_pack_destination_bindings
                 SET private_absolute_path = '/different/private/path'
                 WHERE destination_binding_id = ?1",
                [&first.destination_binding_id],
            )
            .unwrap();
        assert!(database
            .bind_destination(&destination, "2026-07-30T00:02:00.000Z".into())
            .is_err());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_capability_verification_is_read_only_and_fails_closed() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();

        assert!(database
            .verify_destination_capability(&binding.destination_binding_id)
            .unwrap());
        let row_count = database
            .lock()
            .unwrap()
            .query_row(
                "SELECT COUNT(*) FROM coding_pack_destination_bindings",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap();
        fs::remove_dir_all(&destination).unwrap();
        assert!(!database
            .verify_destination_capability(&binding.destination_binding_id)
            .unwrap());
        fs::create_dir_all(&destination).unwrap();
        database
            .lock()
            .unwrap()
            .execute(
                "UPDATE coding_pack_destination_bindings
                 SET destination_fingerprint = ?2
                 WHERE destination_binding_id = ?1",
                params![binding.destination_binding_id, digest('9')],
            )
            .unwrap();
        assert!(!database
            .verify_destination_capability(&binding.destination_binding_id)
            .unwrap());
        assert_eq!(
            database
                .lock()
                .unwrap()
                .query_row(
                    "SELECT COUNT(*) FROM coding_pack_destination_bindings",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .unwrap(),
            row_count
        );
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_boundary_rejects_invalid_proposal_and_event_identity_before_write() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();

        let mut invalid_proposal = proposed_request(&binding);
        invalid_proposal.operation.proposal_digest = digest('9');
        invalid_proposal.proposed_event.payload["proposal"]["proposalDigest"] =
            Value::String(digest('9'));
        invalid_proposal.proposed_event.payload_digest =
            sha256_canonical(&invalid_proposal.proposed_event.payload).unwrap();
        assert!(database.create_operation(invalid_proposal).is_err());
        assert!(database.list_operation_ids().unwrap().is_empty());

        let mut invalid_payload_digest = proposed_request(&binding);
        invalid_payload_digest.proposed_event.payload_digest = digest('8');
        assert!(database.create_operation(invalid_payload_digest).is_err());
        assert!(database.list_operation_ids().unwrap().is_empty());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_boundary_rejects_invalid_approval_and_chronology_without_state_change() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let proposed = proposed_request(&binding);
        database.create_operation(proposed.clone()).unwrap();

        let mut invalid = confirmation_request(&proposed);
        invalid.confirmed_event.payload["approval"]["proposalDigest"] = Value::String(digest('9'));
        invalid.confirmed_event.payload_digest =
            sha256_canonical(&invalid.confirmed_event.payload).unwrap();
        assert!(database.append_confirmation(invalid).is_err());

        let mut chronology = confirmation_request(&proposed);
        chronology.confirmed_event.recorded_at = "2099-07-29T23:59:59.999Z".into();
        assert!(database.append_confirmation(chronology).is_err());

        let snapshot = database
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "proposed");
        assert_eq!(snapshot.events.len(), 1);
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_boundary_rejects_invalid_decision_identity_without_state_change() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let proposed = proposed_request(&binding);
        database.create_operation(proposed.clone()).unwrap();
        database
            .append_confirmation(confirmation_request(&proposed))
            .unwrap();
        let confirmed = database
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        let mut invalid = decision_request(&confirmed);
        invalid.decided_event.payload["policyDigest"] = Value::String(digest('9'));
        invalid.decided_event.payload_digest =
            sha256_canonical(&invalid.decided_event.payload).unwrap();
        assert!(database.append_decision(invalid).is_err());

        let mut wrong_approval = decision_request(&confirmed);
        wrong_approval.decided_event.payload["approvalEvidenceDigest"] = Value::String(digest('8'));
        wrong_approval.decided_event.payload_digest =
            sha256_canonical(&wrong_approval.decided_event.payload).unwrap();
        assert!(database.append_decision(wrong_approval).is_err());

        let mut wrong_request = decision_request(&confirmed);
        wrong_request.decided_event.payload["requestDigest"] = Value::String(digest('7'));
        wrong_request.decided_event.payload_digest =
            sha256_canonical(&wrong_request.decided_event.payload).unwrap();
        assert!(database.append_decision(wrong_request).is_err());

        let mut expired_decision = decision_request(&confirmed);
        expired_decision.decided_event.payload["decidedAt"] =
            Value::String("2099-07-30T00:05:00.000Z".into());
        expired_decision.decided_event.recorded_at = "2099-07-30T00:05:00.000Z".into();
        expired_decision.decided_event.payload_digest =
            sha256_canonical(&expired_decision.decided_event.payload).unwrap();
        assert!(database.append_decision(expired_decision).is_err());

        let snapshot = database
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "confirmed");
        assert_eq!(snapshot.events.len(), 2);
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn late_error_decision_persists_truthful_terminal_evidence() {
        let root = test_root();
        let destination = root.join("exports");
        fs::create_dir_all(&destination).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2026-07-30T00:00:00.000Z".into())
            .unwrap();
        let proposed = proposed_request(&binding);
        database.create_operation(proposed.clone()).unwrap();
        database
            .append_confirmation(confirmation_request(&proposed))
            .unwrap();
        let confirmed = database
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        let mut late_error = decision_request(&confirmed);
        late_error.operation.state = "decided_error".into();
        late_error.decided_event.payload["decision"] = Value::String("error".into());
        late_error.decided_event.payload["reasonCode"] = Value::String("bridge_timeout".into());
        late_error.decided_event.payload["evaluationStartedAt"] =
            Value::String("2099-07-30T00:04:59.999Z".into());
        late_error.decided_event.payload["decidedAt"] =
            Value::String("2099-07-30T00:05:00.001Z".into());
        late_error.decided_event.recorded_at = "2099-07-30T00:05:00.001Z".into();
        late_error.decided_event.payload_digest =
            sha256_canonical(&late_error.decided_event.payload).unwrap();

        database.append_decision(late_error).unwrap();
        let decided = database
            .get_operation_snapshot_data("operation-1")
            .unwrap()
            .unwrap();
        assert_eq!(decided.operation.state, "decided_error");
        assert_eq!(decided.events.len(), 3);
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn exact_lifetime_boundaries_are_enforced_natively() {
        assert!(validate_lifetime(
            "2026-07-30T00:00:00.000Z",
            "2026-07-31T00:00:00.000Z",
            MAX_PROPOSAL_LIFETIME_MS
        )
        .is_ok());
        assert!(validate_lifetime(
            "2026-07-30T00:00:00.000Z",
            "2026-07-31T00:00:00.001Z",
            MAX_PROPOSAL_LIFETIME_MS
        )
        .is_err());
    }

    #[test]
    fn native_export_persists_start_before_writes_and_completes_exact_bundle() {
        let root = test_root();
        let (database, project, destination, request, manifest_json) = export_fixture(&root);

        let prepared = database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false)
            .unwrap();
        let started = database
            .get_operation_snapshot_data(&request.operation_id)
            .unwrap()
            .unwrap();
        assert_eq!(started.operation.state, "export_started");
        assert_eq!(started.events.len(), 4);
        assert_eq!(started.events[3].event_type, "PACK_EXPORT_STARTED");
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);

        write_atomic_bundle(&prepared).unwrap();
        let target = destination.join(&prepared.plan.target_name);
        assert_eq!(
            fs::read(target.join("manifest.json")).unwrap(),
            manifest_json.as_bytes()
        );
        assert_eq!(
            fs::read(target.join("sources/src/main.ts")).unwrap(),
            fs::read(project.join("src/main.ts")).unwrap()
        );
        assert!(!target.join("sources/notes.bin").exists());
        let portable = fs::read_to_string(target.join("manifest.json")).unwrap();
        for private_key in [
            "operationId",
            "projectBindingId",
            "destinationBindingId",
            "privateRootPath",
            "approvalEvidenceDigest",
        ] {
            assert!(!portable.contains(private_key));
        }

        database
            .record_native_completion_for_test(&prepared.plan)
            .unwrap();
        let completed = database
            .get_operation_snapshot_data(&request.operation_id)
            .unwrap()
            .unwrap();
        assert_eq!(completed.operation.state, "export_completed");
        assert_eq!(completed.events.len(), 5);
        assert_eq!(completed.events[4].event_type, "PACK_EXPORT_COMPLETED");
        assert!(database
            .record_native_completion_for_test(&prepared.plan)
            .is_err());
        assert!(database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.001Z", false,)
            .is_err());
        assert!(fs::read_dir(&destination).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".kerniq-coding-pack-staging-")));

        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_export_revalidation_failures_write_nothing_and_do_not_start() {
        for case in [
            "changed",
            "missing",
            "manifest",
            "destination",
            "destination_fingerprint",
            "target",
        ] {
            let root = test_root().join(case);
            fs::create_dir_all(&root).unwrap();
            let (database, project, destination, mut request, _) = export_fixture(&root);
            match case {
                "changed" => fs::write(project.join("src/main.ts"), b"changed\n").unwrap(),
                "missing" => fs::remove_file(project.join("src/main.ts")).unwrap(),
                "manifest" => request.canonical_manifest_json.push(' '),
                "destination" => fs::remove_dir_all(&destination).unwrap(),
                "destination_fingerprint" => {
                    database
                        .lock()
                        .unwrap()
                        .execute(
                            "UPDATE coding_pack_destination_bindings
                             SET destination_fingerprint = ?1",
                            [digest('f')],
                        )
                        .unwrap();
                }
                "target" => {
                    let manifest = validate_manifest(&request.canonical_manifest_json).unwrap();
                    let target = destination.join(format!(
                        "kerniq-coding-pack-{}",
                        &manifest.manifest_digest["sha256:".len()..]
                    ));
                    fs::create_dir(&target).unwrap();
                    fs::write(target.join("untouched"), b"existing").unwrap();
                }
                _ => unreachable!(),
            }

            assert!(
                database
                    .begin_native_export_for_test(
                        &request,
                        &project,
                        "2099-07-30T00:00:03.000Z",
                        false,
                    )
                    .is_err()
            );
            let snapshot = database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.operation.state, "decided_allow");
            assert_eq!(snapshot.events.len(), 3);
            if case == "target" {
                let marker = fs::read_dir(&destination)
                    .unwrap()
                    .next()
                    .unwrap()
                    .unwrap()
                    .path()
                    .join("untouched");
                assert_eq!(fs::read(marker).unwrap(), b"existing");
            } else if destination.exists() {
                assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
            }
            drop(database);
            fs::remove_dir_all(&root).unwrap();
        }
    }

    #[test]
    fn non_allow_and_expired_authority_never_start_or_write() {
        for decision in ["deny", "error"] {
            let root = test_root().join(decision);
            fs::create_dir_all(&root).unwrap();
            let (database, project, destination, request, _) =
                export_fixture_with_decision(&root, decision);
            assert!(
                database
                    .begin_native_export_for_test(
                        &request,
                        &project,
                        "2099-07-30T00:00:03.000Z",
                        false,
                    )
                    .is_err()
            );
            assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
            let snapshot = database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.operation.state, format!("decided_{decision}"));
            assert_eq!(snapshot.events.len(), 3);
            drop(database);
            fs::remove_dir_all(root).unwrap();
        }

        let root = test_root().join("confirmed");
        fs::create_dir_all(&root).unwrap();
        let (database, project, destination, request, _) = export_fixture(&root);
        {
            let connection = database.lock().unwrap();
            connection
                .execute(
                    "DELETE FROM coding_pack_events
                     WHERE operation_id = ?1 AND event_sequence = 3",
                    [&request.operation_id],
                )
                .unwrap();
            connection
                .execute(
                    "UPDATE coding_pack_operations
                     SET state = 'confirmed', last_event_sequence = 2
                     WHERE operation_id = ?1",
                    [&request.operation_id],
                )
                .unwrap();
        }
        assert!(database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false,)
            .is_err());
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
        let snapshot = database
            .get_operation_snapshot_data(&request.operation_id)
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "confirmed");
        assert_eq!(snapshot.events.len(), 2);
        drop(database);
        fs::remove_dir_all(root).unwrap();

        for (case, started_at) in [
            ("approval_expired", "2099-07-30T00:05:00.000Z"),
            ("proposal_expired", "2099-07-30T00:10:00.000Z"),
        ] {
            let root = test_root().join(case);
            fs::create_dir_all(&root).unwrap();
            let (database, project, destination, request, _) = export_fixture(&root);
            assert_eq!(
                database
                    .begin_native_export_for_test(&request, &project, started_at, false)
                    .unwrap_err(),
                "coding_pack_export_authority_expired"
            );
            assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
            let snapshot = database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.operation.state, "decided_allow");
            assert_eq!(snapshot.events.len(), 3);
            drop(database);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[cfg(unix)]
    #[test]
    fn native_export_rejects_source_symlink_before_start() {
        use std::os::unix::fs::symlink;
        let root = test_root();
        let (database, project, destination, request, _) = export_fixture(&root);
        let source = project.join("src/main.ts");
        fs::remove_file(&source).unwrap();
        fs::write(
            project.join("outside.ts"),
            b"export const outside = true;\n",
        )
        .unwrap();
        symlink(project.join("outside.ts"), source).unwrap();

        assert!(database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false,)
            .is_err());
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
        assert_eq!(
            database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap()
                .operation
                .state,
            "decided_allow"
        );

        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn start_persistence_failure_performs_zero_destination_writes() {
        let root = test_root();
        let (database, project, destination, request, _) = export_fixture(&root);
        assert_eq!(
            database
                .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", true,)
                .unwrap_err(),
            "coding_pack_export_start_persistence_failed"
        );
        assert_eq!(fs::read_dir(&destination).unwrap().count(), 0);
        let snapshot = database
            .get_operation_snapshot_data(&request.operation_id)
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "decided_allow");
        assert_eq!(snapshot.events.len(), 3);
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn staged_failures_persist_interruption_and_clean_only_owned_staging() {
        for fault in [
            ExportFault::StagingCreate,
            ExportFault::ManifestWrite,
            ExportFault::SourceWrite,
            ExportFault::Flush,
            ExportFault::Promotion,
        ] {
            let root = test_root().join(format!("{fault:?}"));
            fs::create_dir_all(&root).unwrap();
            let (database, project, destination, request, _) = export_fixture(&root);
            fs::write(destination.join("unrelated"), b"keep").unwrap();
            let prepared = database
                .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false)
                .unwrap();
            let failure = write_atomic_bundle_with_fault(&prepared, fault).unwrap_err();
            if let Some(staging) = &failure.staging_path {
                safely_remove_owned_staging(&prepared.destination_root, staging).unwrap();
            }
            database
                .record_native_interruption_for_test(
                    &prepared.plan,
                    failure.phase_code,
                    failure.reason_code,
                )
                .unwrap();
            let snapshot = database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.operation.state, "export_interrupted");
            assert_eq!(snapshot.events[4].event_type, "PACK_EXPORT_INTERRUPTED");
            assert_eq!(fs::read(destination.join("unrelated")).unwrap(), b"keep");
            assert!(!destination.join(&prepared.plan.target_name).exists());
            assert!(fs::read_dir(&destination).unwrap().all(|entry| {
                !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".kerniq-coding-pack-staging-")
            }));
            drop(database);
            fs::remove_dir_all(&root).unwrap();
        }
    }

    #[test]
    fn concurrent_target_is_never_overwritten() {
        let root = test_root();
        let (database, project, destination, request, _) = export_fixture(&root);
        let prepared = database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false)
            .unwrap();
        let target = destination.join(&prepared.plan.target_name);
        fs::create_dir(&target).unwrap();
        fs::write(target.join("untouched"), b"concurrent").unwrap();

        let failure = write_atomic_bundle(&prepared).unwrap_err();
        assert_eq!(failure.phase_code, "promotion");
        safely_remove_owned_staging(
            &prepared.destination_root,
            failure.staging_path.as_ref().unwrap(),
        )
        .unwrap();
        database
            .record_native_interruption_for_test(
                &prepared.plan,
                failure.phase_code,
                failure.reason_code,
            )
            .unwrap();
        assert_eq!(fs::read(target.join("untouched")).unwrap(), b"concurrent");
        assert_eq!(
            database
                .get_operation_snapshot_data(&request.operation_id)
                .unwrap()
                .unwrap()
                .operation
                .state,
            "export_interrupted"
        );
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn completion_persistence_failure_keeps_promoted_target_and_started_state() {
        let root = test_root();
        let (database, project, destination, request, _) = export_fixture(&root);
        let prepared = database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.000Z", false)
            .unwrap();
        write_atomic_bundle(&prepared).unwrap();
        let target = destination.join(&prepared.plan.target_name);
        assert!(target.is_dir());

        assert_eq!(
            database
                .fail_native_completion_for_test(&prepared.plan)
                .unwrap_err(),
            "coding_pack_export_completion_persistence_failed"
        );
        assert!(target.is_dir());
        let snapshot = database
            .get_operation_snapshot_data(&request.operation_id)
            .unwrap()
            .unwrap();
        assert_eq!(snapshot.operation.state, "export_started");
        assert_eq!(snapshot.events.len(), 4);
        assert!(database
            .begin_native_export_for_test(&request, &project, "2099-07-30T00:00:03.001Z", false,)
            .is_err());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    fn proposed_request(
        binding: &CodingPackDestinationBinding,
    ) -> CreateCodingPackOperationRequest {
        let mut proposal = CodingPackExportProposal {
            schema_version: EXPORT_PROPOSAL_SCHEMA.into(),
            operation_id: "operation-1".into(),
            project_binding_id: "project-1".into(),
            project_generation: 1,
            candidate_paths_digest: digest('1'),
            source_fingerprint: digest('2'),
            pack_id: pack_id('3'),
            manifest_digest: digest('4'),
            destination_binding_id: binding.destination_binding_id.clone(),
            destination_fingerprint: binding.destination_fingerprint.clone(),
            export_format: EXPORT_FORMAT.into(),
            created_at: "2099-07-30T00:00:00.000Z".into(),
            expires_at: "2099-07-30T00:10:00.000Z".into(),
            proposal_digest: String::new(),
        };
        proposal.proposal_digest = proposal_digest(&proposal).unwrap();
        let payload = serde_json::to_value(ProposedPayload {
            proposal: proposal.clone(),
        })
        .unwrap();
        let operation = CodingPackOperation {
            operation_id: proposal.operation_id.clone(),
            state: "proposed".into(),
            project_binding_id: proposal.project_binding_id.clone(),
            project_generation: proposal.project_generation,
            candidate_paths_digest: proposal.candidate_paths_digest.clone(),
            source_fingerprint: proposal.source_fingerprint.clone(),
            pack_id: proposal.pack_id.clone(),
            manifest_digest: proposal.manifest_digest.clone(),
            destination_binding_id: proposal.destination_binding_id.clone(),
            proposal_digest: proposal.proposal_digest.clone(),
            created_at: proposal.created_at.clone(),
            expires_at: proposal.expires_at.clone(),
            last_event_sequence: 1,
        };
        let proposed_event = CodingPackEvent {
            event_id: "event-1".into(),
            operation_id: proposal.operation_id,
            event_sequence: 1,
            event_type: "PACK_PROPOSED".into(),
            event_version: 1,
            recorded_at: proposal.created_at,
            payload_digest: sha256_canonical(&payload).unwrap(),
            payload,
        };
        CreateCodingPackOperationRequest {
            operation,
            proposed_event,
        }
    }

    fn export_fixture(
        root: &Path,
    ) -> (
        CodingPackDatabase,
        PathBuf,
        PathBuf,
        NativeExportRequest,
        String,
    ) {
        export_fixture_with_decision(root, "allow")
    }

    fn export_fixture_with_decision(
        root: &Path,
        decision: &str,
    ) -> (
        CodingPackDatabase,
        PathBuf,
        PathBuf,
        NativeExportRequest,
        String,
    ) {
        let project = root.join("project");
        let destination = root.join("exports");
        fs::create_dir_all(project.join("src")).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(
            project.join("src/main.ts"),
            b"export const kerniq = true;\n",
        )
        .unwrap();
        let manifest_json = manifest_fixture(&project);
        let manifest = validate_manifest(&manifest_json).unwrap();
        let database = CodingPackDatabase::open_path(&root.join("store.sqlite3")).unwrap();
        let binding = database
            .bind_destination(&destination, "2099-07-30T00:00:00.000Z".into())
            .unwrap();
        let mut proposed = proposed_request(&binding);
        let mut payload: ProposedPayload =
            serde_json::from_value(proposed.proposed_event.payload.clone()).unwrap();
        payload.proposal.candidate_paths_digest = manifest.candidate_paths_digest.clone();
        payload.proposal.source_fingerprint = manifest.source_fingerprint.clone();
        payload.proposal.pack_id = manifest.pack_id.clone();
        payload.proposal.manifest_digest = manifest.manifest_digest.clone();
        payload.proposal.proposal_digest = proposal_digest(&payload.proposal).unwrap();
        proposed.operation.candidate_paths_digest = manifest.candidate_paths_digest;
        proposed.operation.source_fingerprint = manifest.source_fingerprint;
        proposed.operation.pack_id = manifest.pack_id;
        proposed.operation.manifest_digest = manifest.manifest_digest;
        proposed.operation.proposal_digest = payload.proposal.proposal_digest.clone();
        proposed.proposed_event.payload = serde_json::to_value(payload).unwrap();
        proposed.proposed_event.payload_digest =
            sha256_canonical(&proposed.proposed_event.payload).unwrap();
        database.create_operation(proposed.clone()).unwrap();
        database
            .append_confirmation(confirmation_request(&proposed))
            .unwrap();
        let confirmed = database
            .get_operation_snapshot_data(&proposed.operation.operation_id)
            .unwrap()
            .unwrap();
        database
            .append_decision(decision_request_with_result(&confirmed, decision))
            .unwrap();
        let request = NativeExportRequest {
            operation_id: proposed.operation.operation_id,
            export_attempt_id: "export-attempt-1".into(),
            canonical_manifest_json: manifest_json.clone(),
            project_binding_id: proposed.operation.project_binding_id,
        };
        (database, project, destination, request, manifest_json)
    }

    fn manifest_fixture(project: &Path) -> String {
        let source_bytes = fs::read(project.join("src/main.ts")).unwrap();
        let source = serde_json::json!({
            "relativePath": "src/main.ts",
            "sourceDigest": bytes_digest(&source_bytes),
            "byteCount": source_bytes.len(),
            "encoding": "utf-8",
            "inclusionReasonCode": "explicit_selection",
        });
        let exclusion = serde_json::json!({
            "relativePath": "notes.bin",
            "reasonCode": "binary_like_extension",
        });
        let identity = serde_json::json!({
            "schemaVersion": "kerniq.coding-pack.manifest.v1",
            "packVersion": "0.7",
            "purpose": "task_context",
            "selectionRulesVersion": "kerniq-coding-pack-selection-v1",
            "sources": [source.clone()],
            "exclusions": [exclusion.clone()],
        });
        let source_fingerprint = sha256_canonical(&identity).unwrap();
        let pack_id = format!("pack-{}", &source_fingerprint["sha256:".len()..]);
        let without_digest = serde_json::json!({
            "schemaVersion": "kerniq.coding-pack.manifest.v1",
            "packVersion": "0.7",
            "packId": pack_id,
            "purpose": "task_context",
            "project": {},
            "selectionRulesVersion": "kerniq-coding-pack-selection-v1",
            "sources": [source],
            "exclusions": [exclusion],
            "sourceFingerprint": source_fingerprint,
            "generatedAt": "2099-07-30T00:00:00.000Z",
        });
        let manifest_digest = sha256_canonical(&without_digest).unwrap();
        let mut manifest = without_digest;
        manifest
            .as_object_mut()
            .unwrap()
            .insert("manifestDigest".into(), manifest_digest.into());
        canonical_json(&manifest).unwrap()
    }

    fn bytes_digest(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("sha256:{:x}", hasher.finalize())
    }

    fn confirmation_request(
        proposed: &CreateCodingPackOperationRequest,
    ) -> ConfirmCodingPackOperationRequest {
        let proposal: ProposedPayload =
            serde_json::from_value(proposed.proposed_event.payload.clone()).unwrap();
        let approval = CodingPackExportApproval {
            schema_version: EXPORT_APPROVAL_SCHEMA.into(),
            operation_id: proposal.proposal.operation_id.clone(),
            proposal_digest: proposal.proposal.proposal_digest,
            approved_at: "2099-07-30T00:00:01.000Z".into(),
            expires_at: "2099-07-30T00:05:00.000Z".into(),
        };
        let payload = serde_json::to_value(ConfirmedPayload {
            approval: approval.clone(),
        })
        .unwrap();
        let mut operation = proposed.operation.clone();
        operation.state = "confirmed".into();
        operation.last_event_sequence = 2;
        ConfirmCodingPackOperationRequest {
            operation,
            confirmed_event: CodingPackEvent {
                event_id: "event-2".into(),
                operation_id: approval.operation_id,
                event_sequence: 2,
                event_type: "PACK_CONFIRMED".into(),
                event_version: 1,
                recorded_at: approval.approved_at,
                payload_digest: sha256_canonical(&payload).unwrap(),
                payload,
            },
        }
    }

    fn decision_request(
        confirmed: &CodingPackStoredSnapshotData,
    ) -> DecideCodingPackOperationRequest {
        decision_request_with_result(confirmed, "allow")
    }

    fn decision_request_with_result(
        confirmed: &CodingPackStoredSnapshotData,
        decision: &str,
    ) -> DecideCodingPackOperationRequest {
        let (state, reason_code) = match decision {
            "allow" => ("decided_allow", "policy_allowed"),
            "deny" => ("decided_deny", "policy_blocked"),
            "error" => ("decided_error", "bridge_protocol_error"),
            _ => panic!("unsupported test decision"),
        };
        let confirmed_event = &confirmed.events[1];
        let proposed_payload: ProposedPayload =
            serde_json::from_value(confirmed.events[0].payload.clone()).unwrap();
        let payload = DecidedPayload {
            decision_id: "decision-1".into(),
            request_digest: coding_pack_agentfuse_request_digest(
                &proposed_payload.proposal,
                &confirmed_event.payload_digest,
            )
            .unwrap(),
            proposal_digest: confirmed.operation.proposal_digest.clone(),
            approval_evidence_digest: confirmed_event.payload_digest.clone(),
            agent_fuse_source_commit: AGENTFUSE_SOURCE_COMMIT.into(),
            agent_fuse_package_version: AGENTFUSE_PACKAGE_VERSION.into(),
            bridge_protocol: AGENTFUSE_BRIDGE_PROTOCOL.into(),
            policy_id: CODING_PACK_EXPORT_POLICY_ID.into(),
            policy_digest: CODING_PACK_EXPORT_POLICY_DIGEST.into(),
            decision: decision.into(),
            reason_code: reason_code.into(),
            evaluation_started_at: "2099-07-30T00:00:01.000Z".into(),
            decided_at: "2099-07-30T00:00:02.000Z".into(),
        };
        let payload = serde_json::to_value(payload).unwrap();
        let mut operation = confirmed.operation.clone();
        operation.state = state.into();
        operation.last_event_sequence = 3;
        DecideCodingPackOperationRequest {
            operation,
            decided_event: CodingPackEvent {
                event_id: "event-3".into(),
                operation_id: confirmed.operation.operation_id.clone(),
                event_sequence: 3,
                event_type: "PACK_DECIDED".into(),
                event_version: 1,
                recorded_at: "2099-07-30T00:00:02.000Z".into(),
                payload_digest: sha256_canonical(&payload).unwrap(),
                payload,
            },
        }
    }

    fn digest(character: char) -> String {
        format!("sha256:{}", character.to_string().repeat(64))
    }

    fn pack_id(character: char) -> String {
        format!("pack-{}", character.to_string().repeat(64))
    }

    fn schema_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    fn table_exists(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1
                 )",
                [name],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn test_root() -> PathBuf {
        let thread_name = std::thread::current()
            .name()
            .unwrap_or("thread")
            .chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                    character
                } else {
                    '_'
                }
            })
            .collect::<String>();
        let root = std::env::temp_dir().join(format!(
            "kerniq-coding-pack-db-test-{}-{}",
            std::process::id(),
            thread_name
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }
}
use crate::coding_pack_export::{
    read_and_verify_sources, validate_manifest, NativeExportPlan, NativeExportRequest,
    PreparedNativeExport,
};
