mod coding_pack_database;
mod managed_python;
mod session_database;

use coding_pack_database::{
    CodingPackDatabase, CodingPackDestinationBinding, CodingPackStoredSnapshotData,
    ConfirmCodingPackOperationRequest, CreateCodingPackOperationRequest,
    DecideCodingPackOperationRequest, DestinationPickerRequest,
};
use managed_python::ManagedPythonState;
use serde::{Deserialize, Serialize};
use session_database::{
    AppendEntryRequest, CreateSessionRequest, PersistenceInfo, ProjectBinding,
    ProjectBindingCandidate, ProjectBindingInput, SessionDatabase, StoredEntry, StoredSession,
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

const COMMAND_TIMEOUT: Duration = Duration::from_secs(120);
const OUTPUT_LIMIT: usize = 64 * 1024;

#[derive(Default)]
struct CommandRunState {
    cancellations: Mutex<HashMap<String, Arc<AtomicBool>>>,
    authorized_roots: Mutex<HashSet<PathBuf>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RunProjectCommandRequest {
    run_id: String,
    project_root: String,
    command_id: String,
    catalog_digest: String,
}

#[derive(Debug, Clone)]
struct CommandDefinition {
    id: String,
    executable: String,
    args: Vec<String>,
    cwd: PathBuf,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectCommandResult {
    command_id: String,
    approved: bool,
    started: bool,
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    cancelled: bool,
    stdout_truncated: bool,
    stderr_truncated: bool,
    duration_ms: u64,
}

#[derive(Debug)]
struct BoundedOutput {
    bytes: Vec<u8>,
    truncated: bool,
}

#[tauri::command]
async fn run_project_command(
    request: RunProjectCommandRequest,
    state: tauri::State<'_, CommandRunState>,
) -> Result<ProjectCommandResult, String> {
    if request.run_id.trim().is_empty() {
        return Err("A non-empty command run ID is required.".into());
    }
    let cancellation = Arc::new(AtomicBool::new(false));
    state
        .cancellations
        .lock()
        .map_err(|_| "Command cancellation state is unavailable.")?
        .insert(request.run_id.clone(), cancellation.clone());

    let root = validate_project_root(&request.project_root)?;
    let authorized = state
        .authorized_roots
        .lock()
        .map_err(|_| "Project authorization state is unavailable.")?
        .contains(&root);
    if !authorized {
        state
            .cancellations
            .lock()
            .map_err(|_| "Command cancellation state is unavailable.")?
            .remove(&request.run_id);
        return Err(
            "The project root is not authorized for native commands in this session.".into(),
        );
    }

    let run_id = request.run_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let definition = resolve_command(&root, &request.command_id, &request.catalog_digest)?;
        execute_command(definition, cancellation, COMMAND_TIMEOUT, OUTPUT_LIMIT)
    })
    .await
    .map_err(|error| format!("Native command worker failed: {error}"))?;

    state
        .cancellations
        .lock()
        .map_err(|_| "Command cancellation state is unavailable.")?
        .remove(&run_id);
    result
}

#[tauri::command]
async fn pick_project_directory(
    window: tauri::Window,
    state: tauri::State<'_, CommandRunState>,
) -> Result<Option<String>, String> {
    let dialog_window = window.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_window
            .dialog()
            .file()
            .set_title("Open KerniQ Project")
            .blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("Project directory picker failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "The selected directory is not a local filesystem path.")?;
    let root = validate_project_root(&path.to_string_lossy())?;
    window
        .try_fs_scope()
        .ok_or("The project filesystem scope is unavailable.")?
        .allow_directory(&root, true)
        .map_err(|_| "The selected project directory could not be authorized.")?;
    state
        .authorized_roots
        .lock()
        .map_err(|_| "Project authorization state is unavailable.")?
        .insert(root.clone());
    Ok(Some(root.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn coding_pack_destination_pick_and_bind(
    window: tauri::Window,
    request: DestinationPickerRequest,
    database: tauri::State<'_, CodingPackDatabase>,
) -> Result<Option<CodingPackDestinationBinding>, String> {
    let dialog_window = window.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_window
            .dialog()
            .file()
            .set_title("Choose Coding Pack Destination")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| "coding_pack_destination_unavailable".to_string())?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "coding_pack_destination_unavailable".to_string())?;
    database
        .bind_destination(&path, request.created_at)
        .map(Some)
}

#[tauri::command]
fn cancel_project_command(
    run_id: String,
    state: tauri::State<'_, CommandRunState>,
) -> Result<bool, String> {
    let cancellations = state
        .cancellations
        .lock()
        .map_err(|_| "Command cancellation state is unavailable.")?;
    if let Some(flag) = cancellations.get(&run_id) {
        flag.store(true, Ordering::SeqCst);
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
fn session_store_create(
    request: CreateSessionRequest,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<(), String> {
    state.create_session(request)
}

#[tauri::command]
fn session_store_append(
    request: AppendEntryRequest,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<(), String> {
    state.append_entry(request)
}

#[tauri::command]
fn session_store_get(
    session_id: String,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<Option<StoredSession>, String> {
    state.get_session(&session_id)
}

#[tauri::command]
fn session_store_list(
    state: tauri::State<'_, SessionDatabase>,
) -> Result<Vec<StoredSession>, String> {
    state.list_sessions()
}

#[tauri::command]
fn session_store_entries(
    session_id: String,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<Vec<StoredEntry>, String> {
    state.list_entries(&session_id)
}

#[tauri::command]
fn session_store_delete(
    session_id: String,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<bool, String> {
    state.delete_session(&session_id)
}

#[tauri::command]
fn session_binding_upsert(
    binding: ProjectBindingInput,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<ProjectBinding, String> {
    state.upsert_binding(binding)
}

#[tauri::command]
fn session_binding_get(
    binding_id: String,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<Option<ProjectBinding>, String> {
    state.get_binding(&binding_id)
}

#[tauri::command]
fn session_binding_verify(
    binding_id: String,
    candidate: ProjectBindingCandidate,
    state: tauri::State<'_, SessionDatabase>,
) -> Result<bool, String> {
    state.verify_binding(&binding_id, candidate)
}

#[tauri::command]
fn session_persistence_info(state: tauri::State<'_, SessionDatabase>) -> PersistenceInfo {
    state.persistence_info()
}

#[tauri::command]
fn coding_pack_store_create(
    request: CreateCodingPackOperationRequest,
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<(), String> {
    state.create_operation(request)
}

#[tauri::command]
fn coding_pack_store_confirm(
    request: ConfirmCodingPackOperationRequest,
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<(), String> {
    state.append_confirmation(request)
}

#[tauri::command]
fn coding_pack_store_decide(
    request: DecideCodingPackOperationRequest,
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<(), String> {
    state.append_decision(request)
}

#[tauri::command]
fn coding_pack_store_snapshot(
    operation_id: String,
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<Option<CodingPackStoredSnapshotData>, String> {
    state.get_operation_snapshot_data(&operation_id)
}

#[tauri::command]
fn coding_pack_store_operation_ids(
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<Vec<String>, String> {
    state.list_operation_ids()
}

#[tauri::command]
fn coding_pack_destination_get(
    destination_binding_id: String,
    state: tauri::State<'_, CodingPackDatabase>,
) -> Result<Option<CodingPackDestinationBinding>, String> {
    state.get_destination(&destination_binding_id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CommandRunState::default())
        .manage(ManagedPythonState::default())
        .setup(|app| {
            let database = SessionDatabase::open(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(database);
            let coding_pack_database = CodingPackDatabase::open(app.handle())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            app.manage(coding_pack_database);
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            pick_project_directory,
            coding_pack_destination_pick_and_bind,
            run_project_command,
            cancel_project_command,
            session_store_create,
            session_store_append,
            session_store_get,
            session_store_list,
            session_store_entries,
            session_store_delete,
            session_binding_upsert,
            session_binding_get,
            session_binding_verify,
            session_persistence_info,
            coding_pack_store_create,
            coding_pack_store_confirm,
            coding_pack_store_decide,
            coding_pack_store_snapshot,
            coding_pack_store_operation_ids,
            coding_pack_destination_get,
            managed_python::managed_python_inspect,
            managed_python::managed_python_provision,
            managed_python::managed_python_verify,
            managed_python::managed_python_remove,
            managed_python::managed_python_self_check,
            managed_python::agentfuse_decide
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn validate_project_root(root: &str) -> Result<PathBuf, String> {
    let metadata =
        fs::symlink_metadata(root).map_err(|_| "The selected project root is unavailable.")?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("The selected project root is not a regular directory.".into());
    }
    fs::canonicalize(root).map_err(|_| "The selected project root could not be normalized.".into())
}

fn resolve_command(
    root: &Path,
    command_id: &str,
    expected_catalog_digest: &str,
) -> Result<CommandDefinition, String> {
    if let Some(script) = command_id.strip_prefix("package-script:") {
        if !is_safe_script_name(script) {
            return Err("Unknown project command ID.".into());
        }
        let package_path = root.join("package.json");
        let raw = fs::read_to_string(package_path)
            .map_err(|_| "Project package metadata is unavailable.")?;
        let package: serde_json::Value =
            serde_json::from_str(&raw).map_err(|_| "Project package metadata is malformed.")?;
        let script_source = package
            .get("scripts")
            .and_then(|value| value.as_object())
            .and_then(|scripts| scripts.get(script))
            .and_then(|value| value.as_str());
        let Some(script_source) = script_source else {
            return Err("Unknown project command ID.".into());
        };
        if catalog_digest(&format!("package.json\0{script}\0{script_source}"))
            != expected_catalog_digest
        {
            return Err("The cataloged project command changed after approval.".into());
        }
        return Ok(CommandDefinition {
            id: command_id.into(),
            executable: "pnpm".into(),
            args: vec!["run".into(), script.into()],
            cwd: root.into(),
        });
    }

    if command_id == "cargo:test" || command_id == "cargo:check" {
        if !root.join("Cargo.toml").is_file() {
            return Err("Unknown project command ID.".into());
        }
        let action = command_id.strip_prefix("cargo:").unwrap_or_default();
        if catalog_digest(&format!("cargo\0{action}")) != expected_catalog_digest {
            return Err("The cataloged project command changed after approval.".into());
        }
        return Ok(CommandDefinition {
            id: command_id.into(),
            executable: "cargo".into(),
            args: vec![action.into()],
            cwd: root.into(),
        });
    }

    Err("Unknown project command ID.".into())
}

fn catalog_digest(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    format!("sha256:{digest:x}")
}

fn is_safe_script_name(name: &str) -> bool {
    let mut parts = name.split(':');
    let Some(category) = parts.next() else {
        return false;
    };
    if !matches!(category, "test" | "check" | "lint" | "typecheck" | "build") {
        return false;
    }
    parts.all(|part| {
        !part.is_empty()
            && part.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
            })
    })
}

fn execute_command(
    definition: CommandDefinition,
    cancellation: Arc<AtomicBool>,
    timeout: Duration,
    output_limit: usize,
) -> Result<ProjectCommandResult, String> {
    let started_at = Instant::now();
    let mut command = Command::new(&definition.executable);
    command
        .args(&definition.args)
        .current_dir(&definition.cwd)
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    copy_allowed_environment(&mut command);

    let mut child = command
        .spawn()
        .map_err(|_| "The cataloged executable could not be started.".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Command stdout could not be captured.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Command stderr could not be captured.")?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout, output_limit));
    let stderr_reader = thread::spawn(move || read_bounded(stderr, output_limit));
    let mut timed_out = false;
    let mut cancelled = false;

    let status = loop {
        if cancellation.load(Ordering::SeqCst) {
            cancelled = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|_| "Cancelled command could not be reaped.")?;
        }
        if started_at.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|_| "Timed out command could not be reaped.")?;
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err("Command status could not be inspected.".into()),
        }
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| "Command stdout reader failed.")?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Command stderr reader failed.")?;
    let root_display = definition.cwd.to_string_lossy();
    Ok(ProjectCommandResult {
        command_id: definition.id,
        approved: true,
        started: true,
        exit_code: status.code(),
        stdout: sanitize_output(&String::from_utf8_lossy(&stdout.bytes), &root_display),
        stderr: sanitize_output(&String::from_utf8_lossy(&stderr.bytes), &root_display),
        timed_out,
        cancelled,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
        duration_ms: started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    })
}

fn copy_allowed_environment(command: &mut Command) {
    const ALLOWED: &[&str] = &[
        "PATH",
        "HOME",
        "USERPROFILE",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "APPDATA",
        "LOCALAPPDATA",
        "LANG",
        "LC_ALL",
    ];
    for key in ALLOWED {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command.env("CI", "1");
}

fn read_bounded(mut reader: impl Read, limit: usize) -> BoundedOutput {
    let mut bytes = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        let count = match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => count,
        };
        let available = limit.saturating_sub(bytes.len());
        if available > 0 {
            bytes.extend_from_slice(&buffer[..count.min(available)]);
        }
        if count > available {
            truncated = true;
        }
    }
    BoundedOutput { bytes, truncated }
}

fn sanitize_output(output: &str, project_root: &str) -> String {
    let mut sanitized = output.replace(project_root, ".");
    let alternate = if project_root.contains('\\') {
        project_root.replace('\\', "/")
    } else {
        project_root.replace('/', "\\")
    };
    if alternate != project_root {
        sanitized = sanitized.replace(&alternate, ".");
    }
    sanitized
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn request_rejects_raw_commands_cwd_and_environment() {
        for forbidden in ["rawCommand", "executable", "args", "cwd", "environment"] {
            let mut value = serde_json::json!({
                "runId": "run-1",
                "projectRoot": "/tmp/project",
                "commandId": "cargo:test",
                "catalogDigest": "sha256:fixture"
            });
            value
                .as_object_mut()
                .unwrap()
                .insert(forbidden.into(), serde_json::json!("unsafe"));
            expect_deserialization_failure(value);
        }
    }

    #[test]
    fn command_catalog_rejects_unknown_ids_and_unsafe_script_names() {
        let root = test_project_root();
        fs::write(
            root.join("package.json"),
            r#"{"scripts":{"test":"node test.js","deploy":"curl example.test"}}"#,
        )
        .unwrap();
        let digest = catalog_digest("package.json\0test\0node test.js");
        assert!(resolve_command(&root, "package-script:test", &digest).is_ok());
        assert!(resolve_command(&root, "package-script:test", "sha256:changed").is_err());
        assert!(resolve_command(&root, "package-script:deploy", "sha256:any").is_err());
        assert!(resolve_command(&root, "package-script:test;rm", "sha256:any").is_err());
        assert!(resolve_command(&root, "raw:command", "sha256:any").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn project_roots_require_exact_session_authorization() {
        let root = test_project_root();
        let other = root.join("other");
        fs::create_dir_all(&other).unwrap();
        let mut authorized = HashSet::new();
        authorized.insert(root.clone());
        assert!(authorized.contains(&root));
        assert!(!authorized.contains(&fs::canonicalize(&other).unwrap()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn output_is_bounded_and_absolute_project_paths_are_sanitized() {
        let source = vec![b'x'; OUTPUT_LIMIT + 10];
        let output = read_bounded(source.as_slice(), OUTPUT_LIMIT);
        assert_eq!(output.bytes.len(), OUTPUT_LIMIT);
        assert!(output.truncated);
        assert_eq!(
            sanitize_output("failed at /safe/project/src/a.ts", "/safe/project"),
            "failed at ./src/a.ts"
        );
    }

    #[test]
    fn command_execution_captures_separate_streams_and_exit_code_without_stdin() {
        let definition = helper_definition("command_helper_outputs");
        let result = execute_command(
            definition,
            Arc::new(AtomicBool::new(false)),
            Duration::from_secs(5),
            OUTPUT_LIMIT,
        )
        .unwrap();
        assert_eq!(result.exit_code, Some(0));
        assert!(result.stdout.contains("helper stdout"));
        assert!(result.stderr.contains("helper stderr"));
        assert!(!result.timed_out);
    }

    #[test]
    fn timeout_terminates_the_child() {
        let definition = helper_definition("command_helper_sleeps");
        let result = execute_command(
            definition,
            Arc::new(AtomicBool::new(false)),
            Duration::from_millis(20),
            OUTPUT_LIMIT,
        )
        .unwrap();
        assert!(result.timed_out);
        assert!(result.started);
    }

    #[test]
    fn cancellation_terminates_the_child() {
        let cancellation = Arc::new(AtomicBool::new(true));
        let result = execute_command(
            helper_definition("command_helper_sleeps"),
            cancellation,
            Duration::from_secs(5),
            OUTPUT_LIMIT,
        )
        .unwrap();
        assert!(result.cancelled);
    }

    #[test]
    fn command_helper_outputs() {
        println!("helper stdout");
        writeln!(std::io::stderr(), "helper stderr").unwrap();
    }

    #[test]
    fn command_helper_sleeps() {
        thread::sleep(Duration::from_millis(250));
    }

    fn helper_definition(test_name: &str) -> CommandDefinition {
        CommandDefinition {
            id: "test-helper".into(),
            executable: std::env::current_exe()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            args: vec![
                "--exact".into(),
                format!("tests::{test_name}"),
                "--nocapture".into(),
            ],
            cwd: std::env::current_dir().unwrap(),
        }
    }

    fn expect_deserialization_failure(value: serde_json::Value) {
        assert!(serde_json::from_value::<RunProjectCommandRequest>(value).is_err());
    }

    fn test_project_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!("kerniq-command-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::canonicalize(root).unwrap()
    }
}
