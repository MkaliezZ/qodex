use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const CODING_PACK_DATABASE_SCHEMA_VERSION: i64 = 1;
pub const CODING_PACK_STORE_SCHEMA_VERSION: &str = "kerniq.coding-pack.store.v1";
const DATABASE_FILE_NAME: &str = "kerniq-coding-pack.sqlite3";
const MAX_EVENT_PAYLOAD_BYTES: usize = 64 * 1024;

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
        if created_at.trim().is_empty() || created_at.len() > 64 {
            return Err(destination_unavailable());
        }
        let private_path = canonical.to_string_lossy().into_owned();
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

        self.lock()?
            .execute(
                "INSERT INTO coding_pack_destination_bindings (
                    destination_binding_id, destination_fingerprint, display_label,
                    created_at, restart_available, private_absolute_path
                 ) VALUES (?1, ?2, ?3, ?4, 1, ?5)
                 ON CONFLICT(destination_binding_id) DO UPDATE SET
                    destination_fingerprint = excluded.destination_fingerprint,
                    display_label = excluded.display_label,
                    restart_available = 1,
                    private_absolute_path = excluded.private_absolute_path",
                params![
                    destination_binding_id,
                    destination_fingerprint,
                    display_label,
                    created_at,
                    private_path,
                ],
            )
            .map_err(|_| persistence_failed())?;
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
        validate_proposed_pair(&operation, &event)?;
        let payload_json = bounded_payload_json(&event.payload)?;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| persistence_failed())?;
        let destination_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM coding_pack_destination_bindings
                    WHERE destination_binding_id = ?1
                 )",
                [&operation.destination_binding_id],
                |row| row.get(0),
            )
            .map_err(|_| persistence_failed())?;
        if !destination_exists {
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
        validate_confirmed_pair(&operation, &event)?;
        let payload_json = bounded_payload_json(&event.payload)?;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| persistence_failed())?;
        let current = select_operation(&transaction, &operation.operation_id)?
            .ok_or_else(persistence_failed)?;
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

    pub fn get_operation(&self, operation_id: &str) -> Result<Option<CodingPackOperation>, String> {
        let connection = self.lock()?;
        select_operation(&connection, operation_id)
    }

    pub fn list_operations(&self) -> Result<Vec<CodingPackOperation>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT operation_id, state, project_binding_id, project_generation,
                        candidate_paths_digest, source_fingerprint, pack_id, manifest_digest,
                        destination_binding_id, proposal_digest, created_at, expires_at,
                        last_event_sequence
                 FROM coding_pack_operations
                 ORDER BY created_at DESC, operation_id ASC",
            )
            .map_err(|_| store_unavailable())?;
        let rows = statement
            .query_map([], operation_from_row)
            .map_err(|_| store_unavailable())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| store_unavailable())
    }

    pub fn list_events(&self, operation_id: &str) -> Result<Vec<CodingPackEvent>, String> {
        let connection = self.lock()?;
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

    pub fn get_destination(
        &self,
        destination_binding_id: &str,
    ) -> Result<Option<CodingPackDestinationBinding>, String> {
        self.lock()?
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
             PRAGMA synchronous = NORMAL;",
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

fn validate_proposed_pair(
    operation: &CodingPackOperation,
    event: &CodingPackEvent,
) -> Result<(), String> {
    if operation.state != "proposed"
        || operation.last_event_sequence != 1
        || event.operation_id != operation.operation_id
        || event.event_sequence != 1
        || event.event_type != "PACK_PROPOSED"
        || event.event_version != 1
    {
        return Err(persistence_failed());
    }
    Ok(())
}

fn validate_confirmed_pair(
    operation: &CodingPackOperation,
    event: &CodingPackEvent,
) -> Result<(), String> {
    if operation.state != "confirmed"
        || operation.last_event_sequence != 2
        || event.operation_id != operation.operation_id
        || event.event_sequence != 2
        || event.event_type != "PACK_CONFIRMED"
        || event.event_version != 1
    {
        return Err(persistence_failed());
    }
    Ok(())
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
        let proposed_operation = operation(&binding.destination_binding_id, "proposed", 1);
        database
            .create_operation(CreateCodingPackOperationRequest {
                operation: proposed_operation,
                proposed_event: event("event-1", "PACK_PROPOSED", 1),
            })
            .unwrap();
        drop(database);

        let restarted = CodingPackDatabase::open_path(&database_path).unwrap();
        assert_eq!(
            restarted
                .get_operation("operation-1")
                .unwrap()
                .unwrap()
                .state,
            "proposed"
        );
        assert_eq!(restarted.list_operations().unwrap().len(), 1);
        restarted
            .append_confirmation(ConfirmCodingPackOperationRequest {
                operation: operation(&binding.destination_binding_id, "confirmed", 2),
                confirmed_event: event("event-2", "PACK_CONFIRMED", 2),
            })
            .unwrap();
        let stored = restarted.get_operation("operation-1").unwrap().unwrap();
        assert_eq!(stored.state, "confirmed");
        assert_eq!(stored.last_event_sequence, 2);
        assert_eq!(restarted.list_events("operation-1").unwrap().len(), 2);
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
        database
            .create_operation(CreateCodingPackOperationRequest {
                operation: operation(&binding.destination_binding_id, "proposed", 1),
                proposed_event: event("event-1", "PACK_PROPOSED", 1),
            })
            .unwrap();
        assert!(database
            .append_confirmation(ConfirmCodingPackOperationRequest {
                operation: operation(&binding.destination_binding_id, "confirmed", 2),
                confirmed_event: event("event-1", "PACK_CONFIRMED", 2),
            })
            .is_err());
        assert_eq!(
            database
                .get_operation("operation-1")
                .unwrap()
                .unwrap()
                .state,
            "proposed"
        );
        assert!(database
            .append_confirmation(ConfirmCodingPackOperationRequest {
                operation: operation(&binding.destination_binding_id, "confirmed", 2),
                confirmed_event: event("event-2", "PACK_CONFIRMED", 3),
            })
            .is_err());
        assert_eq!(database.list_events("operation-1").unwrap().len(), 1);
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
            .create_operation(CreateCodingPackOperationRequest {
                operation: operation(&binding.destination_binding_id, "proposed", 1),
                proposed_event: event("event-1", "PACK_PROPOSED", 1),
            })
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
        assert!(database.list_events("operation-1").is_err());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    fn operation(
        destination_binding_id: &str,
        state: &str,
        last_event_sequence: i64,
    ) -> CodingPackOperation {
        CodingPackOperation {
            operation_id: "operation-1".into(),
            state: state.into(),
            project_binding_id: "project-1".into(),
            project_generation: 1,
            candidate_paths_digest: digest('1'),
            source_fingerprint: digest('2'),
            pack_id: digest('3'),
            manifest_digest: digest('4'),
            destination_binding_id: destination_binding_id.into(),
            proposal_digest: digest('5'),
            created_at: "2026-07-30T00:00:00.000Z".into(),
            expires_at: "2026-07-30T00:10:00.000Z".into(),
            last_event_sequence,
        }
    }

    fn event(event_id: &str, event_type: &str, sequence: i64) -> CodingPackEvent {
        CodingPackEvent {
            event_id: event_id.into(),
            operation_id: "operation-1".into(),
            event_sequence: sequence,
            event_type: event_type.into(),
            event_version: 1,
            recorded_at: "2026-07-30T00:00:00.000Z".into(),
            payload_digest: digest('6'),
            payload: serde_json::json!({"bounded": true}),
        }
    }

    fn digest(character: char) -> String {
        format!("sha256:{}", character.to_string().repeat(64))
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
