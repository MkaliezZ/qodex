use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub const CODING_PACK_DATABASE_SCHEMA_VERSION: i64 = 1;
pub const CODING_PACK_STORE_SCHEMA_VERSION: &str = "kerniq.coding-pack.store.v1";
const DATABASE_FILE_NAME: &str = "kerniq-coding-pack.sqlite3";
const MAX_EVENT_PAYLOAD_BYTES: usize = 64 * 1024;
const MAX_ID_BYTES: usize = 256;
const MAX_LABEL_BYTES: usize = 256;
const MAX_PROPOSAL_LIFETIME_MS: i64 = 86_400_000;
const MAX_APPROVAL_LIFETIME_MS: i64 = 86_400_000;
const EXPORT_PROPOSAL_SCHEMA: &str = "kerniq.coding-pack.export-proposal.v1";
const EXPORT_APPROVAL_SCHEMA: &str = "kerniq.coding-pack.export-approval.v1";
const EXPORT_FORMAT: &str = "kerniq-coding-pack-bundle-v1";

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
        let destination_fingerprint = format!("sha256:{fingerprint_hex}");
        let destination_binding_id = format!("destination-{}", &fingerprint_hex[..24]);
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

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection.lock().map_err(|_| store_unavailable())
    }
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
                    VALUES ('kerniq.coding-pack.store.v1');
                 PRAGMA user_version = 1;",
            )
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

fn validate_operation(operation: &CodingPackOperation) -> Result<(), String> {
    validate_opaque_id(&operation.operation_id)?;
    validate_opaque_id(&operation.project_binding_id)?;
    if operation.state != "proposed" && operation.state != "confirmed" {
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

fn sha256_canonical(value: &Value) -> Result<String, String> {
    let canonical = canonical_json(value)?;
    let mut hasher = Sha256::new();
    hasher.update(canonical.as_bytes());
    Ok(format!("sha256:{:x}", hasher.finalize()))
}

fn canonical_json(value: &Value) -> Result<String, String> {
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

fn parse_timestamp(value: &str) -> Result<i64, String> {
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

    #[test]
    fn fresh_schema_creation_and_migration_are_idempotent() {
        let connection = Connection::open_in_memory().unwrap();
        configure_connection(&connection).unwrap();
        migrate_database(&connection).unwrap();
        migrate_database(&connection).unwrap();
        assert_eq!(schema_version(&connection), 1);
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
            sha256_canonical(&serde_json::json!({ "proposal": proposal })).unwrap(),
            "sha256:24dcd9be102988d7e00e373b07afe8c02d768f260c393430dcb4896bea76f66a"
        );
        let mut hasher = Sha256::new();
        hasher.update(b"tauri\0/fixture/Exports");
        assert_eq!(
            format!("sha256:{:x}", hasher.finalize()),
            "sha256:1d742926433865d0d7a3e5f69c6f989a1a86b89aa045f0b78b1be4862b8a4214"
        );
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
        drop(restarted);
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
