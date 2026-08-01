use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

pub const DATABASE_SCHEMA_VERSION: i64 = 2;
const DATABASE_FILE_NAME: &str = "kerniq-sessions.sqlite3";

pub struct SessionDatabase {
    connection: Mutex<Connection>,
    path: PathBuf,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredSession {
    pub id: String,
    pub schema_version: i64,
    pub title: String,
    pub status: String,
    pub active_leaf_id: String,
    pub project_binding_id: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredEntry {
    pub id: String,
    pub session_id: String,
    pub parent_entry_id: Option<String>,
    pub sequence: i64,
    #[serde(rename = "type")]
    pub entry_type: String,
    pub payload_version: i64,
    pub payload: Value,
    pub safe_metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionMutation {
    pub active_leaf_id: String,
    pub status: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSessionRequest {
    pub session: StoredSession,
    pub first_entry: StoredEntry,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppendEntryRequest {
    pub entry: StoredEntry,
    pub mutation: SessionMutation,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBindingInput {
    pub binding_id: String,
    pub display_name: String,
    pub private_root_path: String,
    pub project_fingerprint: String,
    pub last_opened_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectBindingCandidate {
    pub private_root_path: String,
    pub project_fingerprint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBinding {
    pub binding_id: String,
    pub display_name: String,
    pub project_fingerprint: String,
    pub last_opened_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistenceInfo {
    kind: &'static str,
    persistent: bool,
    location: String,
    schema_version: i64,
    message: &'static str,
}

impl SessionDatabase {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|_| "KerniQ application data directory is unavailable.")?;
        fs::create_dir_all(&directory)
            .map_err(|_| "KerniQ application data directory could not be created.")?;
        Self::open_path(&directory.join(DATABASE_FILE_NAME))
    }

    pub fn open_path(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(database_open_error)?;
        configure_connection(&connection)?;
        migrate_database(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            path: path.to_path_buf(),
        })
    }

    pub fn create_session(&self, request: CreateSessionRequest) -> Result<(), String> {
        let session = request.session;
        let entry = request.first_entry;
        if session.id != entry.session_id
            || entry.sequence != 1
            || entry.parent_entry_id.is_some()
            || entry.entry_type != "SESSION_CREATED"
            || session.active_leaf_id != entry.id
        {
            return Err("The initial session ledger transaction is invalid.".into());
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_write_error)?;
        transaction
            .execute(
                "INSERT INTO sessions (
                    id, schema_version, title, status, active_leaf_id, project_binding_id,
                    provider_id, model_id, created_at, updated_at, completed_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![
                    session.id,
                    session.schema_version,
                    session.title,
                    session.status,
                    session.active_leaf_id,
                    session.project_binding_id,
                    session.provider_id,
                    session.model_id,
                    session.created_at,
                    session.updated_at,
                    session.completed_at,
                ],
            )
            .map_err(database_write_error)?;
        insert_entry(&transaction, &entry)?;
        transaction.commit().map_err(database_write_error)
    }

    pub fn append_entry(&self, request: AppendEntryRequest) -> Result<(), String> {
        let entry = request.entry;
        let mutation = request.mutation;
        if mutation.active_leaf_id != entry.id {
            return Err("The session active leaf must be the appended entry.".into());
        }
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(database_write_error)?;
        let expected_sequence: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM session_entries WHERE session_id = ?1",
                [&entry.session_id],
                |row| row.get(0),
            )
            .map_err(database_read_error)?;
        if entry.sequence != expected_sequence {
            return Err("The ledger sequence is not append-only.".into());
        }
        if let Some(parent) = &entry.parent_entry_id {
            let parent_exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_entries WHERE id = ?1 AND session_id = ?2)",
                    params![parent, entry.session_id],
                    |row| row.get(0),
                )
                .map_err(database_read_error)?;
            if !parent_exists {
                return Err("The ledger parent does not exist in this session.".into());
            }
        }
        insert_entry(&transaction, &entry)?;
        let updated = transaction
            .execute(
                "UPDATE sessions
                 SET active_leaf_id = ?1, status = ?2, updated_at = ?3, completed_at = ?4
                 WHERE id = ?5",
                params![
                    mutation.active_leaf_id,
                    mutation.status,
                    mutation.updated_at,
                    mutation.completed_at,
                    entry.session_id,
                ],
            )
            .map_err(database_write_error)?;
        if updated != 1 {
            return Err("Session not found for ledger append.".into());
        }
        transaction.commit().map_err(database_write_error)
    }

    pub fn get_session(&self, id: &str) -> Result<Option<StoredSession>, String> {
        self.lock()?
            .query_row(&session_select("WHERE id = ?1"), [id], session_from_row)
            .optional()
            .map_err(database_read_error)
    }

    pub fn list_sessions(&self) -> Result<Vec<StoredSession>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(&session_select("ORDER BY updated_at DESC, id ASC"))
            .map_err(database_read_error)?;
        let rows = statement
            .query_map([], session_from_row)
            .map_err(database_read_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(database_read_error)
    }

    pub fn list_entries(&self, session_id: &str) -> Result<Vec<StoredEntry>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT id, session_id, parent_entry_id, sequence, type, payload_version,
                        payload_json, safe_metadata_json, created_at
                 FROM session_entries WHERE session_id = ?1 ORDER BY sequence ASC",
            )
            .map_err(database_read_error)?;
        let rows = statement
            .query_map([session_id], |row| {
                let payload: String = row.get(6)?;
                let metadata: String = row.get(7)?;
                Ok(StoredEntry {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    parent_entry_id: row.get(2)?,
                    sequence: row.get(3)?,
                    entry_type: row.get(4)?,
                    payload_version: row.get(5)?,
                    payload: serde_json::from_str(&payload).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            payload.len(),
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?,
                    safe_metadata: serde_json::from_str(&metadata).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            metadata.len(),
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(database_read_error)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(database_read_error)
    }

    pub fn delete_session(&self, id: &str) -> Result<bool, String> {
        let changed = self
            .lock()?
            .execute("DELETE FROM sessions WHERE id = ?1", [id])
            .map_err(database_write_error)?;
        Ok(changed == 1)
    }

    pub fn upsert_binding(&self, binding: ProjectBindingInput) -> Result<ProjectBinding, String> {
        let canonical = canonical_project_root(&binding.private_root_path)?;
        self.lock()?
            .execute(
                "INSERT INTO project_bindings (
                    binding_id, display_name, private_root_path, project_fingerprint, last_opened_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(binding_id) DO UPDATE SET
                    display_name = excluded.display_name,
                    private_root_path = excluded.private_root_path,
                    project_fingerprint = excluded.project_fingerprint,
                    last_opened_at = excluded.last_opened_at",
                params![
                    binding.binding_id,
                    binding.display_name,
                    canonical.to_string_lossy(),
                    binding.project_fingerprint,
                    binding.last_opened_at,
                ],
            )
            .map_err(database_write_error)?;
        Ok(ProjectBinding {
            binding_id: binding.binding_id,
            display_name: binding.display_name,
            project_fingerprint: binding.project_fingerprint,
            last_opened_at: binding.last_opened_at,
        })
    }

    pub fn get_binding(&self, binding_id: &str) -> Result<Option<ProjectBinding>, String> {
        self.lock()?
            .query_row(
                "SELECT binding_id, display_name, project_fingerprint, last_opened_at
                 FROM project_bindings WHERE binding_id = ?1",
                [binding_id],
                |row| {
                    Ok(ProjectBinding {
                        binding_id: row.get(0)?,
                        display_name: row.get(1)?,
                        project_fingerprint: row.get(2)?,
                        last_opened_at: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(database_read_error)
    }

    pub fn verify_binding(
        &self,
        binding_id: &str,
        candidate: ProjectBindingCandidate,
    ) -> Result<bool, String> {
        let candidate_path = canonical_project_root(&candidate.private_root_path)?;
        let stored: Option<(String, String)> = self
            .lock()?
            .query_row(
                "SELECT private_root_path, project_fingerprint
                 FROM project_bindings WHERE binding_id = ?1",
                [binding_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(database_read_error)?;
        Ok(stored.is_some_and(|(root, fingerprint)| {
            PathBuf::from(root) == candidate_path && fingerprint == candidate.project_fingerprint
        }))
    }

    pub(crate) fn resolve_private_project_root(
        &self,
        binding_id: &str,
    ) -> Result<Option<PathBuf>, String> {
        let stored: Option<(String, String)> = self
            .lock()?
            .query_row(
                "SELECT private_root_path, project_fingerprint
                 FROM project_bindings WHERE binding_id = ?1",
                [binding_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(database_read_error)?;
        let Some((private_root_path, stored_fingerprint)) = stored else {
            return Ok(None);
        };
        let canonical = canonical_project_root(&private_root_path)?;
        let canonical_text = canonical
            .to_str()
            .ok_or_else(|| "The selected project root is not UTF-8 addressable.".to_string())?;
        let (expected_binding_id, expected_fingerprint) = project_binding_identity(canonical_text);
        if binding_id != expected_binding_id
            || stored_fingerprint != expected_fingerprint
            || private_root_path != canonical_text
        {
            return Ok(None);
        }
        Ok(Some(canonical))
    }

    pub fn persistence_info(&self) -> PersistenceInfo {
        PersistenceInfo {
            kind: "sqlite",
            persistent: true,
            location: self.path.to_string_lossy().into_owned(),
            schema_version: DATABASE_SCHEMA_VERSION,
            message: "Sessions are stored locally in KerniQ's application-data directory.",
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "The KerniQ session database is temporarily unavailable.".into())
    }
}

fn configure_connection(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(database_open_error)?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(database_open_error)
}

pub fn migrate_database(connection: &Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_read_error)?;
    if version > DATABASE_SCHEMA_VERSION {
        return Err(
            "The session database was created by a newer KerniQ version; no data was changed."
                .into(),
        );
    }
    if version == 0 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(database_write_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY NOT NULL,
                    schema_version INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    active_leaf_id TEXT NOT NULL,
                    project_binding_id TEXT,
                    provider_id TEXT,
                    model_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                 );
                 CREATE TABLE IF NOT EXISTS session_entries (
                    id TEXT PRIMARY KEY NOT NULL,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    parent_entry_id TEXT REFERENCES session_entries(id),
                    sequence INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    payload_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    safe_metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(session_id, sequence)
                 );
                 PRAGMA user_version = 1;",
            )
            .map_err(database_write_error)?;
        transaction.commit().map_err(database_write_error)?;
    }
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(database_read_error)?;
    if version == 1 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(database_write_error)?;
        transaction
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS project_bindings (
                    binding_id TEXT PRIMARY KEY NOT NULL,
                    display_name TEXT NOT NULL,
                    private_root_path TEXT NOT NULL,
                    project_fingerprint TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
                 CREATE INDEX IF NOT EXISTS idx_entries_session_sequence
                    ON session_entries(session_id, sequence);
                 PRAGMA user_version = 2;",
            )
            .map_err(database_write_error)?;
        transaction.commit().map_err(database_write_error)?;
    }
    Ok(())
}

fn insert_entry(
    transaction: &rusqlite::Transaction<'_>,
    entry: &StoredEntry,
) -> Result<(), String> {
    let payload = serde_json::to_string(&entry.payload)
        .map_err(|_| "Session entry payload could not be serialized.")?;
    let metadata = serde_json::to_string(&entry.safe_metadata)
        .map_err(|_| "Session entry metadata could not be serialized.")?;
    transaction
        .execute(
            "INSERT INTO session_entries (
                id, session_id, parent_entry_id, sequence, type, payload_version,
                payload_json, safe_metadata_json, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                entry.id,
                entry.session_id,
                entry.parent_entry_id,
                entry.sequence,
                entry.entry_type,
                entry.payload_version,
                payload,
                metadata,
                entry.created_at,
            ],
        )
        .map_err(database_write_error)?;
    Ok(())
}

fn session_select(suffix: &str) -> String {
    format!(
        "SELECT id, schema_version, title, status, active_leaf_id, project_binding_id,
                provider_id, model_id, created_at, updated_at, completed_at
         FROM sessions {suffix}"
    )
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredSession> {
    Ok(StoredSession {
        id: row.get(0)?,
        schema_version: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        active_leaf_id: row.get(4)?,
        project_binding_id: row.get(5)?,
        provider_id: row.get(6)?,
        model_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        completed_at: row.get(10)?,
    })
}

fn canonical_project_root(root: &str) -> Result<PathBuf, String> {
    let metadata = fs::symlink_metadata(root)
        .map_err(|_| "The selected project root is unavailable for binding verification.")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The selected project root is not a regular directory.".into());
    }
    fs::canonicalize(root).map_err(|_| "The selected project root could not be normalized.".into())
}

fn project_binding_identity(canonical_root: &str) -> (String, String) {
    let mut hasher = Sha256::new();
    hasher.update(b"tauri\0");
    hasher.update(canonical_root.as_bytes());
    let fingerprint_hex = format!("{:x}", hasher.finalize());
    (
        format!("project-{}", &fingerprint_hex[..24]),
        format!("sha256:{fingerprint_hex}"),
    )
}

fn database_open_error(_: rusqlite::Error) -> String {
    "KerniQ could not initialize its local session database; no user data was deleted.".into()
}

fn database_read_error(_: rusqlite::Error) -> String {
    "KerniQ could not read the local session database.".into()
}

fn database_write_error(_: rusqlite::Error) -> String {
    "KerniQ could not commit the local session ledger transaction.".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_database_initializes_and_migration_is_idempotent() {
        let connection = Connection::open_in_memory().unwrap();
        configure_connection(&connection).unwrap();
        migrate_database(&connection).unwrap();
        migrate_database(&connection).unwrap();
        assert_eq!(schema_version(&connection), DATABASE_SCHEMA_VERSION);
        assert!(table_exists(&connection, "sessions"));
        assert!(table_exists(&connection, "session_entries"));
        assert!(table_exists(&connection, "project_bindings"));
    }

    #[test]
    fn supported_previous_schema_migrates_forward_without_losing_rows() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 CREATE TABLE sessions (
                    id TEXT PRIMARY KEY NOT NULL, schema_version INTEGER NOT NULL,
                    title TEXT NOT NULL, status TEXT NOT NULL, active_leaf_id TEXT NOT NULL,
                    project_binding_id TEXT, provider_id TEXT, model_id TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
                 );
                 CREATE TABLE session_entries (
                    id TEXT PRIMARY KEY NOT NULL,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    parent_entry_id TEXT REFERENCES session_entries(id), sequence INTEGER NOT NULL,
                    type TEXT NOT NULL, payload_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL, safe_metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL, UNIQUE(session_id, sequence)
                 );
                 INSERT INTO sessions VALUES (
                    'session-1', 1, 'Preserved', 'Active', 'entry-1', NULL, NULL, NULL,
                    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', NULL
                 );
                 INSERT INTO session_entries VALUES (
                    'entry-1', 'session-1', NULL, 1, 'SESSION_CREATED', 1, '{}', '{}',
                    '2026-01-01T00:00:00Z'
                 );
                 PRAGMA user_version = 1;",
            )
            .unwrap();
        migrate_database(&connection).unwrap();
        assert_eq!(schema_version(&connection), 2);
        let title: String = connection
            .query_row(
                "SELECT title FROM sessions WHERE id = 'session-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "Preserved");
    }

    #[test]
    fn unsupported_future_schema_fails_without_changing_data() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE sentinel(value TEXT NOT NULL);
                 INSERT INTO sentinel VALUES ('preserved');
                 PRAGMA user_version = 99;",
            )
            .unwrap();
        assert!(migrate_database(&connection).is_err());
        assert_eq!(schema_version(&connection), 99);
        let value: String = connection
            .query_row("SELECT value FROM sentinel", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
    }

    #[test]
    fn append_is_transactional_ordered_and_delete_is_isolated() {
        let root = test_root();
        let database = SessionDatabase::open_path(&root.join("sessions.sqlite3")).unwrap();
        database
            .create_session(create_request("session-1", "entry-1"))
            .unwrap();
        database
            .create_session(create_request("session-2", "entry-2"))
            .unwrap();
        database
            .append_entry(AppendEntryRequest {
                entry: StoredEntry {
                    id: "message-1".into(),
                    session_id: "session-1".into(),
                    parent_entry_id: Some("entry-1".into()),
                    sequence: 2,
                    entry_type: "USER_MESSAGE".into(),
                    payload_version: 1,
                    payload: serde_json::json!({"text": "hello"}),
                    safe_metadata: serde_json::json!({}),
                    created_at: "2026-01-01T00:00:01Z".into(),
                },
                mutation: SessionMutation {
                    active_leaf_id: "message-1".into(),
                    status: "Active".into(),
                    updated_at: "2026-01-01T00:00:01Z".into(),
                    completed_at: None,
                },
            })
            .unwrap();
        let entries = database.list_entries("session-1").unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.sequence)
                .collect::<Vec<_>>(),
            vec![1, 2]
        );
        assert!(database.delete_session("session-1").unwrap());
        assert!(database.get_session("session-1").unwrap().is_none());
        assert!(database.get_session("session-2").unwrap().is_some());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn private_binding_is_verified_exactly_and_never_returned() {
        let root = test_root();
        let project = root.join("project");
        fs::create_dir_all(&project).unwrap();
        let database = SessionDatabase::open_path(&root.join("sessions.sqlite3")).unwrap();
        let binding = database
            .upsert_binding(ProjectBindingInput {
                binding_id: "binding-1".into(),
                display_name: "Project".into(),
                private_root_path: project.to_string_lossy().into_owned(),
                project_fingerprint: "fingerprint".into(),
                last_opened_at: "2026-01-01T00:00:00Z".into(),
            })
            .unwrap();
        assert_eq!(binding.display_name, "Project");
        let serialized = serde_json::to_string(&binding).unwrap();
        assert!(!serialized.contains(&project.to_string_lossy().to_string()));
        assert!(database
            .verify_binding(
                "binding-1",
                ProjectBindingCandidate {
                    private_root_path: project.to_string_lossy().into_owned(),
                    project_fingerprint: "fingerprint".into(),
                },
            )
            .unwrap());
        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn native_project_root_resolver_requires_recomputed_private_identity() {
        let root = test_root();
        let project = root.join("project");
        fs::create_dir_all(&project).unwrap();
        let canonical = fs::canonicalize(&project).unwrap();
        let canonical_text = canonical.to_str().unwrap();
        let (binding_id, fingerprint) = project_binding_identity(canonical_text);
        let database = SessionDatabase::open_path(&root.join("sessions.sqlite3")).unwrap();
        database
            .upsert_binding(ProjectBindingInput {
                binding_id: binding_id.clone(),
                display_name: "Project".into(),
                private_root_path: canonical_text.into(),
                project_fingerprint: fingerprint,
                last_opened_at: "2026-01-01T00:00:00Z".into(),
            })
            .unwrap();

        assert_eq!(
            database.resolve_private_project_root(&binding_id).unwrap(),
            Some(canonical)
        );
        assert!(database
            .resolve_private_project_root("project-000000000000000000000000")
            .unwrap()
            .is_none());
        database
            .lock()
            .unwrap()
            .execute(
                "UPDATE project_bindings SET project_fingerprint = 'tampered'
                 WHERE binding_id = ?1",
                [&binding_id],
            )
            .unwrap();
        assert!(database
            .resolve_private_project_root(&binding_id)
            .unwrap()
            .is_none());

        drop(database);
        fs::remove_dir_all(root).unwrap();
    }

    fn schema_version(connection: &Connection) -> i64 {
        connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    fn table_exists(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
                [name],
                |row| row.get(0),
            )
            .unwrap()
    }

    fn create_request(session_id: &str, entry_id: &str) -> CreateSessionRequest {
        CreateSessionRequest {
            session: StoredSession {
                id: session_id.into(),
                schema_version: 1,
                title: session_id.into(),
                status: "Active".into(),
                active_leaf_id: entry_id.into(),
                project_binding_id: None,
                provider_id: None,
                model_id: None,
                created_at: "2026-01-01T00:00:00Z".into(),
                updated_at: "2026-01-01T00:00:00Z".into(),
                completed_at: None,
            },
            first_entry: StoredEntry {
                id: entry_id.into(),
                session_id: session_id.into(),
                parent_entry_id: None,
                sequence: 1,
                entry_type: "SESSION_CREATED".into(),
                payload_version: 1,
                payload: serde_json::json!({}),
                safe_metadata: serde_json::json!({}),
                created_at: "2026-01-01T00:00:00Z".into(),
            },
        }
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
            "kerniq-session-db-test-{}-{}",
            std::process::id(),
            thread_name
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        root
    }
}
