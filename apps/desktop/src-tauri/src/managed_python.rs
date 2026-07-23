use flate2::read::GzDecoder;
use fs2::FileExt;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const TRUSTED_MANIFEST: &str = include_str!("../resources/python-runtime-manifest.json");
const BRIDGE_INIT: &str = include_str!("../../../../python/kerniq_agentfuse_bridge/__init__.py");
const BRIDGE_MAIN: &str = include_str!("../../../../python/kerniq_agentfuse_bridge/__main__.py");
const BRIDGE_SERVICE: &str = include_str!("../../../../python/kerniq_agentfuse_bridge/service.py");

const BRIDGE_PROTOCOL: &str = "kerniq.agentfuse.bridge.v1";
const MESSAGE_LIMIT: usize = 64 * 1024;
const STDOUT_LIMIT: usize = 256 * 1024;
const STDERR_LIMIT: usize = 64 * 1024;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(8);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const PYTHON_ARCHIVE_LIMIT: u64 = 256 * 1024 * 1024;
const AGENTFUSE_ARCHIVE_LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Default)]
pub(crate) struct ManagedPythonState {
    operation_active: Arc<AtomicBool>,
    bridge_active: Arc<AtomicBool>,
}

impl ManagedPythonState {
    fn operation_guard(&self) -> Result<ExclusiveGuard, String> {
        ExclusiveGuard::acquire(
            self.operation_active.clone(),
            "A managed Python runtime operation is already active.",
        )
    }

    fn bridge_guard(&self) -> Result<ExclusiveGuard, String> {
        ExclusiveGuard::acquire(
            self.bridge_active.clone(),
            "The managed AgentFuse bridge is already active.",
        )
    }
}

struct ExclusiveGuard {
    active: Arc<AtomicBool>,
}

impl ExclusiveGuard {
    fn acquire(active: Arc<AtomicBool>, message: &str) -> Result<Self, String> {
        active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| message.to_string())?;
        Ok(Self { active })
    }
}

impl Drop for ExclusiveGuard {
    fn drop(&mut self) {
        self.active.store(false, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeManifest {
    manifest_version: String,
    runtime_version: String,
    python_version: String,
    distribution: DistributionManifest,
    agent_fuse: AgentFuseManifest,
    bridge_protocol_version: String,
    decision_schema_version: String,
    installed_package_lock: InstalledPackageLock,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DistributionManifest {
    publisher: String,
    release: String,
    license: String,
    artifacts: Vec<RuntimeArtifact>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeArtifact {
    platform: String,
    architecture: String,
    url: String,
    sha256: String,
    archive_format: String,
    expected_executable: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentFuseManifest {
    repository: String,
    commit: String,
    url: String,
    sha256: String,
    archive_format: String,
    expected_module: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstalledPackageLock {
    mode: String,
    packages: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedPythonRuntimeInfo {
    state: String,
    runtime_version: String,
    python_version: Option<String>,
    agent_fuse_commit: String,
    bridge_protocol_version: String,
    integrity: String,
    last_verified_at: Option<String>,
    message: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InstalledRuntimeRecord {
    manifest_sha256: String,
    executable_sha256: String,
    agent_fuse_module_sha256: String,
    bridge_service_sha256: String,
    distribution_tree_sha256: String,
    agent_fuse_tree_sha256: String,
    bridge_tree_sha256: String,
    installed_at: String,
    last_verified_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentFuseSelfCheckResult {
    handshake_matched: bool,
    canonical_import: bool,
    allow_decision: String,
    deny_decision: String,
    deny_handler_invocations: u64,
    agent_fuse_commit: String,
    python_version: String,
    bridge_protocol_version: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AgentFuseNativeDecisionRequest {
    protocol_version: String,
    message_id: String,
    message_type: String,
    payload: Value,
}

#[tauri::command]
pub(crate) fn managed_python_inspect(
    app: tauri::AppHandle,
) -> Result<ManagedPythonRuntimeInfo, String> {
    inspect_runtime(&app, false)
}

#[tauri::command]
pub(crate) async fn managed_python_provision(
    app: tauri::AppHandle,
    state: tauri::State<'_, ManagedPythonState>,
) -> Result<ManagedPythonRuntimeInfo, String> {
    let guard = state.operation_guard()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        provision_runtime(&app)
    })
    .await
    .map_err(|_| "Managed Python provisioning worker failed.".to_string())?
}

#[tauri::command]
pub(crate) async fn managed_python_verify(
    app: tauri::AppHandle,
    state: tauri::State<'_, ManagedPythonState>,
) -> Result<ManagedPythonRuntimeInfo, String> {
    let guard = state.operation_guard()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        verify_runtime(&app)
    })
    .await
    .map_err(|_| "Managed Python verification worker failed.".to_string())?
}

#[tauri::command]
pub(crate) async fn managed_python_remove(
    app: tauri::AppHandle,
    state: tauri::State<'_, ManagedPythonState>,
) -> Result<ManagedPythonRuntimeInfo, String> {
    let guard = state.operation_guard()?;
    let bridge_active = state.bridge_active.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        if bridge_active.load(Ordering::SeqCst) {
            return Err("The AgentFuse bridge must stop before runtime removal.".into());
        }
        remove_runtime(&app)?;
        inspect_runtime(&app, false)
    })
    .await
    .map_err(|_| "Managed Python removal worker failed.".to_string())?
}

#[tauri::command]
pub(crate) async fn managed_python_self_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, ManagedPythonState>,
) -> Result<AgentFuseSelfCheckResult, String> {
    let guard = state.bridge_guard()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        self_check(&app)
    })
    .await
    .map_err(|_| "Managed Python self-check worker failed.".to_string())?
}

#[tauri::command]
pub(crate) async fn agentfuse_decide(
    app: tauri::AppHandle,
    request: AgentFuseNativeDecisionRequest,
    state: tauri::State<'_, ManagedPythonState>,
) -> Result<Value, String> {
    validate_native_decision_request(&request)?;
    let guard = state.bridge_guard()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        let messages = vec![
            protocol_message("native-hello", "hello", json!({})),
            serde_json::to_value(request)
                .map_err(|_| "AgentFuse decision request could not be encoded.")?,
            protocol_message("native-shutdown", "shutdown", json!({})),
        ];
        let responses = run_bridge_session(&app, messages, REQUEST_TIMEOUT)?;
        validate_handshake(&responses[0], &trusted_manifest()?)?;
        validate_shutdown(&responses[2])?;
        Ok(responses[1].clone())
    })
    .await
    .map_err(|_| "AgentFuse decision worker failed.".to_string())?
}

fn trusted_manifest() -> Result<RuntimeManifest, String> {
    let manifest: RuntimeManifest = serde_json::from_str(TRUSTED_MANIFEST)
        .map_err(|_| "Trusted managed Python manifest is malformed.")?;
    if manifest.manifest_version != "kerniq.python-runtime-manifest.v1"
        || manifest.bridge_protocol_version != BRIDGE_PROTOCOL
        || manifest.agent_fuse.commit.len() != 40
        || manifest.installed_package_lock.mode != "verified-source-no-site-packages"
        || !manifest.installed_package_lock.packages.is_empty()
    {
        return Err("Trusted managed Python manifest failed validation.".into());
    }
    Ok(manifest)
}

fn platform_identity() -> Result<(&'static str, &'static str), String> {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        return Err("Managed Python is unsupported on this platform.".into());
    };
    let architecture = match std::env::consts::ARCH {
        "x86_64" => "x86_64",
        "aarch64" => "aarch64",
        _ => return Err("Managed Python is unsupported on this architecture.".into()),
    };
    Ok((platform, architecture))
}

fn selected_artifact(manifest: &RuntimeManifest) -> Result<RuntimeArtifact, String> {
    let (platform, architecture) = platform_identity()?;
    manifest
        .distribution
        .artifacts
        .iter()
        .find(|artifact| artifact.platform == platform && artifact.architecture == architecture)
        .cloned()
        .ok_or_else(|| "No trusted managed Python artifact matches this platform.".into())
}

fn managed_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("runtime").join("python"))
        .map_err(|_| "Managed Python root is unavailable.".into())
}

fn profile_path(app: &tauri::AppHandle, manifest: &RuntimeManifest) -> Result<PathBuf, String> {
    let (platform, architecture) = platform_identity()?;
    Ok(managed_root(app)?
        .join(&manifest.runtime_version)
        .join(format!("{platform}-{architecture}")))
}

fn inspect_runtime(
    app: &tauri::AppHandle,
    execute_version_check: bool,
) -> Result<ManagedPythonRuntimeInfo, String> {
    let manifest = trusted_manifest()?;
    let profile = profile_path(app, &manifest)?;
    if !profile.exists() {
        return Ok(runtime_info(
            &manifest,
            "NotInstalled",
            None,
            "not_installed",
            None,
            "Private managed Python runtime is not installed.",
        ));
    }
    match verify_profile(&profile, &manifest, execute_version_check) {
        Ok(record) => Ok(runtime_info(
            &manifest,
            "Ready",
            Some(manifest.python_version.clone()),
            "verified",
            Some(record.last_verified_at),
            "Managed Python runtime integrity is verified.",
        )),
        Err(_) => Ok(runtime_info(
            &manifest,
            "Broken",
            None,
            "failed",
            None,
            "Managed Python runtime failed integrity verification.",
        )),
    }
}

fn verify_runtime(app: &tauri::AppHandle) -> Result<ManagedPythonRuntimeInfo, String> {
    let manifest = trusted_manifest()?;
    let profile = profile_path(app, &manifest)?;
    let mut record = verify_profile(&profile, &manifest, true)?;
    record.last_verified_at = timestamp();
    write_json(
        &profile.join("manifest").join("installed-runtime.json"),
        &record,
    )?;
    Ok(runtime_info(
        &manifest,
        "Ready",
        Some(manifest.python_version.clone()),
        "verified",
        Some(record.last_verified_at),
        "Managed Python runtime integrity is verified.",
    ))
}

fn runtime_info(
    manifest: &RuntimeManifest,
    state: &str,
    python_version: Option<String>,
    integrity: &str,
    last_verified_at: Option<String>,
    message: &str,
) -> ManagedPythonRuntimeInfo {
    ManagedPythonRuntimeInfo {
        state: state.into(),
        runtime_version: manifest.runtime_version.clone(),
        python_version,
        agent_fuse_commit: manifest.agent_fuse.commit.clone(),
        bridge_protocol_version: manifest.bridge_protocol_version.clone(),
        integrity: integrity.into(),
        last_verified_at,
        message: message.into(),
    }
}

fn provision_runtime(app: &tauri::AppHandle) -> Result<ManagedPythonRuntimeInfo, String> {
    let manifest = trusted_manifest()?;
    let artifact = selected_artifact(&manifest)?;
    validate_manifest_artifact(&artifact)?;
    validate_source_artifact(&manifest.agent_fuse)?;
    let root = managed_root(app)?;
    let version_root = root.join(&manifest.runtime_version);
    fs::create_dir_all(&version_root)
        .map_err(|_| "Managed Python version root could not be created.")?;
    let lock_root = root.join("locks");
    fs::create_dir_all(&lock_root).map_err(|_| "Managed Python lock root could not be created.")?;
    let (platform, architecture) = platform_identity()?;
    let profile_name = format!("{platform}-{architecture}");
    let _lock = FileLock::acquire(lock_root.join(format!("{profile_name}.lock")))?;
    recover_partial_installs(&version_root, &profile_name)?;

    let nonce = operation_nonce();
    let temporary = version_root.join(format!(".installing-{profile_name}-{nonce}"));
    fs::create_dir(&temporary)
        .map_err(|_| "Managed Python temporary root could not be created.")?;
    set_private_directory_permissions(&temporary)?;
    let result: Result<(), String> = (|| {
        for directory in [
            "distribution",
            "environment",
            "agentfuse-source",
            "bridge",
            "manifest",
            "logs",
            "locks",
        ] {
            fs::create_dir(temporary.join(directory))
                .map_err(|_| "Managed Python layout could not be created.")?;
        }

        let python_archive = temporary.join("locks").join("python.tar.gz");
        download_verified(
            &artifact.url,
            &artifact.sha256,
            &python_archive,
            PYTHON_ARCHIVE_LIMIT,
        )?;
        extract_tar_gz(&python_archive, &temporary.join("distribution"), false)?;
        fs::remove_file(&python_archive).ok();

        let source_archive = temporary.join("locks").join("agentfuse.tar.gz");
        download_verified(
            &manifest.agent_fuse.url,
            &manifest.agent_fuse.sha256,
            &source_archive,
            AGENTFUSE_ARCHIVE_LIMIT,
        )?;
        extract_tar_gz(&source_archive, &temporary.join("agentfuse-source"), true)?;
        fs::remove_file(&source_archive).ok();

        write_bridge(&temporary.join("bridge"))?;
        let executable = temporary
            .join("distribution")
            .join(&artifact.expected_executable);
        let agent_fuse_module = temporary
            .join("agentfuse-source")
            .join(&manifest.agent_fuse.expected_module);
        let bridge_service = temporary
            .join("bridge")
            .join("kerniq_agentfuse_bridge")
            .join("service.py");
        if !executable.is_file() || !agent_fuse_module.is_file() || !bridge_service.is_file() {
            return Err("Managed Python artifact layout is unexpected.".to_string());
        }
        verify_python_version(&executable, &manifest.python_version)?;

        let now = timestamp();
        let record = InstalledRuntimeRecord {
            manifest_sha256: sha256_bytes(TRUSTED_MANIFEST.as_bytes()),
            executable_sha256: sha256_file(&executable)?,
            agent_fuse_module_sha256: sha256_file(&agent_fuse_module)?,
            bridge_service_sha256: sha256_file(&bridge_service)?,
            distribution_tree_sha256: sha256_tree(&temporary.join("distribution"))?,
            agent_fuse_tree_sha256: sha256_tree(&temporary.join("agentfuse-source"))?,
            bridge_tree_sha256: sha256_tree(&temporary.join("bridge"))?,
            installed_at: now.clone(),
            last_verified_at: now,
        };
        fs::write(
            temporary.join("manifest").join("trusted-manifest.json"),
            TRUSTED_MANIFEST,
        )
        .map_err(|_| "Managed Python manifest could not be recorded.")?;
        write_json(
            &temporary.join("manifest").join("installed-runtime.json"),
            &record,
        )?;
        fs::write(
            temporary
                .join("environment")
                .join("installed-package-lock.json"),
            serde_json::to_vec_pretty(&manifest.installed_package_lock)
                .map_err(|_| "Managed package lock could not be encoded.")?,
        )
        .map_err(|_| "Managed package lock could not be recorded.")?;
        verify_profile(&temporary, &manifest, true)?;
        promote_runtime(&temporary, &version_root.join(&profile_name))?;
        Ok(())
    })();
    if result.is_err() {
        fs::remove_dir_all(&temporary).ok();
    }
    result?;
    inspect_runtime(app, true)
}

fn remove_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    let manifest = trusted_manifest()?;
    let profile = profile_path(app, &manifest)?;
    let root = managed_root(app)?;
    if !profile.starts_with(&root) {
        return Err("Managed Python removal target is outside the private root.".into());
    }
    if profile.exists() {
        fs::remove_dir_all(profile).map_err(|_| "Managed Python runtime could not be removed.")?;
    }
    Ok(())
}

fn validate_manifest_artifact(artifact: &RuntimeArtifact) -> Result<(), String> {
    if !artifact.url.starts_with("https://")
        || artifact.sha256.len() != 64
        || artifact.archive_format != "tar.gz"
        || Path::new(&artifact.expected_executable).is_absolute()
    {
        return Err("Trusted Python artifact entry is invalid.".into());
    }
    validate_relative_path(Path::new(&artifact.expected_executable))?;
    Ok(())
}

fn validate_source_artifact(source: &AgentFuseManifest) -> Result<(), String> {
    if !source.url.starts_with("https://")
        || source.sha256.len() != 64
        || source.commit.len() != 40
        || source.archive_format != "tar.gz"
    {
        return Err("Trusted AgentFuse source entry is invalid.".into());
    }
    validate_relative_path(Path::new(&source.expected_module))?;
    Ok(())
}

fn download_verified(
    url: &str,
    expected_sha256: &str,
    destination: &Path,
    maximum_bytes: u64,
) -> Result<(), String> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || attempt.url().scheme() != "https" {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| "Managed artifact downloader could not initialize.")?;
    let mut response = client
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|_| "Pinned managed runtime artifact could not be downloaded.")?;
    if response
        .content_length()
        .is_some_and(|length| length > maximum_bytes)
    {
        return Err("Pinned managed runtime artifact exceeds its size bound.".into());
    }
    let mut file = File::create(destination)
        .map_err(|_| "Managed runtime artifact temporary file could not be created.")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut total = 0_u64;
    loop {
        let count = response
            .read(&mut buffer)
            .map_err(|_| "Managed runtime artifact download was interrupted.")?;
        if count == 0 {
            break;
        }
        total = total.saturating_add(count as u64);
        if total > maximum_bytes {
            return Err("Pinned managed runtime artifact exceeds its size bound.".into());
        }
        hasher.update(&buffer[..count]);
        file.write_all(&buffer[..count])
            .map_err(|_| "Managed runtime artifact could not be written.")?;
    }
    file.sync_all()
        .map_err(|_| "Managed runtime artifact could not be synchronized.")?;
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected_sha256 {
        fs::remove_file(destination).ok();
        return Err("Pinned managed runtime artifact failed SHA-256 verification.".into());
    }
    Ok(())
}

fn extract_tar_gz(
    archive_path: &Path,
    destination: &Path,
    strip_first: bool,
) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|_| "Verified archive could not be opened.")?;
    let decoder = GzDecoder::new(file);
    let mut archive = tar::Archive::new(decoder);
    let entries = archive
        .entries()
        .map_err(|_| "Verified archive index is malformed.")?;
    for entry in entries {
        let mut entry = entry.map_err(|_| "Verified archive entry is malformed.")?;
        let entry_type = entry.header().entry_type();
        if !(entry_type.is_file() || entry_type.is_dir()) {
            return Err("Managed archive contains a forbidden link or special file.".into());
        }
        let raw_path = entry
            .path()
            .map_err(|_| "Managed archive entry path is malformed.")?;
        let relative = normalized_archive_path(&raw_path, strip_first)?;
        let Some(relative) = relative else {
            continue;
        };
        let output = destination.join(&relative);
        if !output.starts_with(destination) {
            return Err("Managed archive entry escapes the destination.".into());
        }
        if entry_type.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|_| "Managed archive directory could not be created.")?;
        } else {
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Managed archive parent could not be created.")?;
            }
            entry
                .unpack(&output)
                .map_err(|_| "Managed archive file could not be extracted.")?;
        }
    }
    Ok(())
}

fn normalized_archive_path(path: &Path, strip_first: bool) -> Result<Option<PathBuf>, String> {
    validate_relative_path(path)?;
    let normal: Vec<_> = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_owned()),
            Component::CurDir => None,
            _ => None,
        })
        .collect();
    let start = usize::from(strip_first);
    if normal.len() <= start {
        return Ok(None);
    }
    let mut result = PathBuf::new();
    for component in &normal[start..] {
        result.push(component);
    }
    Ok(Some(result))
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.is_absolute() {
        return Err("Managed archive contains an absolute path.".into());
    }
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        ) {
            return Err("Managed archive contains path traversal.".into());
        }
    }
    Ok(())
}

fn write_bridge(root: &Path) -> Result<(), String> {
    let package = root.join("kerniq_agentfuse_bridge");
    fs::create_dir_all(&package).map_err(|_| "Managed bridge directory could not be created.")?;
    for (name, contents) in [
        ("__init__.py", BRIDGE_INIT),
        ("__main__.py", BRIDGE_MAIN),
        ("service.py", BRIDGE_SERVICE),
    ] {
        fs::write(package.join(name), contents)
            .map_err(|_| "Managed bridge source could not be installed.")?;
    }
    Ok(())
}

fn verify_profile(
    profile: &Path,
    manifest: &RuntimeManifest,
    execute_version_check: bool,
) -> Result<InstalledRuntimeRecord, String> {
    let artifact = selected_artifact(manifest)?;
    let executable = profile
        .join("distribution")
        .join(&artifact.expected_executable);
    let agent_fuse_module = profile
        .join("agentfuse-source")
        .join(&manifest.agent_fuse.expected_module);
    let bridge_service = profile
        .join("bridge")
        .join("kerniq_agentfuse_bridge")
        .join("service.py");
    let record_path = profile.join("manifest").join("installed-runtime.json");
    let record: InstalledRuntimeRecord = serde_json::from_slice(
        &fs::read(record_path).map_err(|_| "Installed runtime record is unavailable.")?,
    )
    .map_err(|_| "Installed runtime record is malformed.")?;
    if record.manifest_sha256 != sha256_bytes(TRUSTED_MANIFEST.as_bytes())
        || record.executable_sha256 != sha256_file(&executable)?
        || record.agent_fuse_module_sha256 != sha256_file(&agent_fuse_module)?
        || record.bridge_service_sha256 != sha256_file(&bridge_service)?
        || record.distribution_tree_sha256 != sha256_tree(&profile.join("distribution"))?
        || record.agent_fuse_tree_sha256 != sha256_tree(&profile.join("agentfuse-source"))?
        || record.bridge_tree_sha256 != sha256_tree(&profile.join("bridge"))?
    {
        return Err("Managed runtime integrity digest mismatch.".into());
    }
    if execute_version_check {
        verify_python_version(&executable, &manifest.python_version)?;
    }
    Ok(record)
}

fn verify_python_version(executable: &Path, expected: &str) -> Result<(), String> {
    let mut command = Command::new(executable);
    command
        .arg("--version")
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    copy_managed_environment(&mut command);
    let output = command
        .output()
        .map_err(|_| "Verified managed Python executable could not start.")?;
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    if !output.status.success() || !combined.contains(&format!("Python {expected}")) {
        return Err("Managed Python version does not match the trusted manifest.".into());
    }
    Ok(())
}

fn promote_runtime(temporary: &Path, profile: &Path) -> Result<(), String> {
    if !profile.exists() {
        return fs::rename(temporary, profile)
            .map_err(|_| "Verified managed runtime could not be promoted.".to_string());
    }
    let quarantine = profile.with_file_name(format!(
        ".previous-{}-{}",
        profile
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("runtime"),
        operation_nonce()
    ));
    fs::rename(profile, &quarantine)
        .map_err(|_| "Broken managed runtime could not be quarantined.")?;
    if let Err(_error) = fs::rename(temporary, profile) {
        let _ = fs::rename(&quarantine, profile);
        return Err("Verified managed runtime could not replace the broken profile.".into());
    }
    fs::remove_dir_all(quarantine).ok();
    Ok(())
}

fn recover_partial_installs(version_root: &Path, profile_name: &str) -> Result<(), String> {
    let prefix = format!(".installing-{profile_name}-");
    for entry in fs::read_dir(version_root)
        .map_err(|_| "Managed Python version root could not be inspected.")?
    {
        let entry = entry.map_err(|_| "Managed Python partial install could not be inspected.")?;
        if entry.file_name().to_string_lossy().starts_with(&prefix) {
            let metadata = entry
                .file_type()
                .map_err(|_| "Managed Python partial install type is unavailable.")?;
            if metadata.is_dir() && !metadata.is_symlink() {
                fs::remove_dir_all(entry.path())
                    .map_err(|_| "Interrupted managed Python install could not be recovered.")?;
            }
        }
    }
    Ok(())
}

fn self_check(app: &tauri::AppHandle) -> Result<AgentFuseSelfCheckResult, String> {
    let manifest = trusted_manifest()?;
    inspect_runtime(app, true).and_then(|info| {
        if info.state != "Ready" {
            Err("Verified managed Python runtime is required.".into())
        } else {
            Ok(())
        }
    })?;
    let allow = proof_decision_message("self-check-allow", "kerniq-proof-allow-v1");
    let deny = proof_decision_message("self-check-deny", "kerniq-proof-deny-v1");
    let messages = vec![
        protocol_message("self-check-hello", "hello", json!({})),
        protocol_message("self-check-health", "health_check", json!({})),
        allow,
        deny,
        protocol_message("self-check-shutdown", "shutdown", json!({})),
    ];
    let responses = run_bridge_session(app, messages, REQUEST_TIMEOUT)?;
    let handshake = validate_handshake(&responses[0], &manifest)?;
    if responses[1]["messageType"] != "health_result"
        || responses[1]["payload"]["canonicalImport"] != true
    {
        return Err("Managed bridge health check failed.".into());
    }
    validate_decision_response(&responses[2], "allow", &manifest)?;
    validate_decision_response(&responses[3], "deny", &manifest)?;
    validate_shutdown(&responses[4])?;
    Ok(AgentFuseSelfCheckResult {
        handshake_matched: true,
        canonical_import: true,
        allow_decision: "allow".into(),
        deny_decision: "deny".into(),
        deny_handler_invocations: 0,
        agent_fuse_commit: manifest.agent_fuse.commit,
        python_version: handshake["pythonVersion"]
            .as_str()
            .unwrap_or_default()
            .into(),
        bridge_protocol_version: BRIDGE_PROTOCOL.into(),
    })
}

fn proof_decision_message(message_id: &str, fixture: &str) -> Value {
    protocol_message(
        message_id,
        "decision_request",
        json!({
            "proposal": {
                "schemaVersion": "kerniq.action.v1",
                "actionId": format!("{message_id}-action"),
                "taskId": "self-check-task",
                "sessionId": "self-check-session",
                "actionType": "kerniq.proof.increment-counter",
                "title": "Managed runtime self-check",
                "summary": "Evaluate a disposable proof counter action.",
                "risk": "write",
                "parameters": {
                    "sandboxId": "managed-runtime-self-check",
                    "markerName": "counter",
                    "contentDigest": "sha256:self-check"
                },
                "requestedAt": timestamp(),
                "proposalDigest": "sha256:self-check-proposal"
            },
            "approval": {
                "approvalId": format!("{message_id}-approval"),
                "actionId": format!("{message_id}-action"),
                "taskId": "self-check-task",
                "proposalDigest": "sha256:self-check-proposal",
                "generation": 1,
                "approvedAt": timestamp(),
                "expiresAt": "2999-01-01T00:00:00.000Z"
            },
            "policyFixtureId": fixture
        }),
    )
}

fn run_bridge_session(
    app: &tauri::AppHandle,
    messages: Vec<Value>,
    timeout: Duration,
) -> Result<Vec<Value>, String> {
    let manifest = trusted_manifest()?;
    let profile = profile_path(app, &manifest)?;
    verify_profile(&profile, &manifest, true)?;
    let artifact = selected_artifact(&manifest)?;
    let executable = profile
        .join("distribution")
        .join(&artifact.expected_executable);
    let bridge_root = profile.join("bridge");
    let source_root = profile.join("agentfuse-source");
    let input = messages
        .iter()
        .map(|message| serde_json::to_string(message))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Bridge request could not be encoded.")?
        .join("\n")
        + "\n";
    if input.len() > STDOUT_LIMIT
        || messages.iter().any(|message| {
            serde_json::to_vec(message)
                .map(|bytes| bytes.len() > MESSAGE_LIMIT)
                .unwrap_or(true)
        })
    {
        return Err("Bridge request exceeds its configured bound.".into());
    }

    let mut command = Command::new(&executable);
    command
        .args([
            "-s",
            "-E",
            "-m",
            "kerniq_agentfuse_bridge",
            "--agentfuse-source",
        ])
        .arg(&source_root)
        .arg("--expected-commit")
        .arg(&manifest.agent_fuse.commit)
        .current_dir(&bridge_root)
        .env_clear()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    copy_managed_environment(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "Managed AgentFuse bridge could not start.")?;
    child
        .stdin
        .take()
        .ok_or("Managed bridge stdin is unavailable.")?
        .write_all(input.as_bytes())
        .map_err(|_| "Managed bridge request could not be written.")?;
    let output = wait_for_child_output(&mut child, timeout.max(STARTUP_TIMEOUT))?;
    if !output.status.success() || output.stdout_truncated || output.stderr_truncated {
        return Err("Managed AgentFuse bridge exited without a bounded response.".into());
    }
    if !output.stderr.is_empty() {
        return Err("Managed AgentFuse bridge reported an initialization error.".into());
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|_| "Managed AgentFuse bridge output is not UTF-8.")?;
    let responses: Vec<Value> = stdout
        .lines()
        .map(|line| {
            if line.len() > MESSAGE_LIMIT {
                return Err("Managed bridge response exceeds its message bound.".into());
            }
            serde_json::from_str(line)
                .map_err(|_| "Managed bridge response is malformed JSON.".into())
        })
        .collect::<Result<_, String>>()?;
    if responses.len() != messages.len() {
        return Err("Managed bridge response count does not match the request.".into());
    }
    for (request, response) in messages.iter().zip(&responses) {
        if response["protocolVersion"] != BRIDGE_PROTOCOL
            || response["messageId"] != request["messageId"]
        {
            return Err("Managed bridge response identity is invalid.".into());
        }
    }
    Ok(responses)
}

struct ChildOutput {
    status: ExitStatus,
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    stdout_truncated: bool,
    stderr_truncated: bool,
}

fn wait_for_child_output(child: &mut Child, timeout: Duration) -> Result<ChildOutput, String> {
    let stdout = child
        .stdout
        .take()
        .ok_or("Managed bridge stdout is unavailable.")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Managed bridge stderr is unavailable.")?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout, STDOUT_LIMIT));
    let stderr_reader = thread::spawn(move || read_bounded(stderr, STDERR_LIMIT));
    let started = Instant::now();
    let mut timed_out = false;
    let status = loop {
        if started.elapsed() >= timeout {
            timed_out = true;
            let _ = child.kill();
            break child
                .wait()
                .map_err(|_| "Timed out managed bridge could not be reaped.")?;
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(20)),
            Err(_) => return Err("Managed AgentFuse bridge status is unavailable.".into()),
        }
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Managed bridge stdout reader failed.")?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Managed bridge stderr reader failed.")?;
    if timed_out {
        return Err("Managed AgentFuse bridge request timed out.".into());
    }
    Ok(ChildOutput {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        stdout_truncated: stdout.truncated,
        stderr_truncated: stderr.truncated,
    })
}

struct BoundedBytes {
    bytes: Vec<u8>,
    truncated: bool,
}

fn read_bounded(mut reader: impl Read, limit: usize) -> BoundedBytes {
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
    BoundedBytes { bytes, truncated }
}

fn validate_native_decision_request(
    request: &AgentFuseNativeDecisionRequest,
) -> Result<(), String> {
    if request.protocol_version != BRIDGE_PROTOCOL
        || request.message_type != "decision_request"
        || request.message_id.trim().is_empty()
    {
        return Err("AgentFuse decision request protocol is invalid.".into());
    }
    let fixture = request
        .payload
        .get("policyFixtureId")
        .and_then(Value::as_str)
        .ok_or("AgentFuse decision request lacks a trusted policy fixture.")?;
    if !matches!(fixture, "kerniq-proof-allow-v1" | "kerniq-proof-deny-v1") {
        return Err("AgentFuse decision request uses an unknown policy fixture.".into());
    }
    if serde_json::to_vec(request)
        .map(|bytes| bytes.len() > MESSAGE_LIMIT)
        .unwrap_or(true)
    {
        return Err("AgentFuse decision request exceeds its message bound.".into());
    }
    Ok(())
}

fn validate_handshake<'a>(
    response: &'a Value,
    manifest: &RuntimeManifest,
) -> Result<&'a Value, String> {
    let payload = response
        .get("payload")
        .ok_or("Managed bridge handshake payload is missing.")?;
    if response["messageType"] != "hello_ack"
        || payload["bridgeProtocolVersion"] != manifest.bridge_protocol_version
        || payload["agentFuseSourceCommit"] != manifest.agent_fuse.commit
        || payload["supportedDecisionSchema"] != manifest.decision_schema_version
        || payload["agentFusePackageVersion"] != "3.5.0"
        || !payload["pythonVersion"]
            .as_str()
            .is_some_and(|value| value == manifest.python_version)
        || !payload["processId"].is_u64()
    {
        return Err("Managed bridge handshake does not match the trusted manifest.".into());
    }
    Ok(payload)
}

fn validate_decision_response(
    response: &Value,
    expected: &str,
    manifest: &RuntimeManifest,
) -> Result<(), String> {
    if response["messageType"] != "decision_result"
        || response["payload"]["decision"] != expected
        || response["payload"]["agentFuseCommit"] != manifest.agent_fuse.commit
        || response["payload"]["schemaVersion"] != manifest.decision_schema_version
        || response["payload"]["policyVersion"] != "dhms-agentfuse-runtime-guard@3.5.0"
        || !response["payload"]["evidence"].is_object()
    {
        return Err("Managed bridge decision response failed validation.".into());
    }
    Ok(())
}

fn validate_shutdown(response: &Value) -> Result<(), String> {
    if response["messageType"] != "shutdown_ack" {
        return Err("Managed bridge did not acknowledge shutdown.".into());
    }
    Ok(())
}

fn protocol_message(message_id: &str, message_type: &str, payload: Value) -> Value {
    json!({
        "protocolVersion": BRIDGE_PROTOCOL,
        "messageId": message_id,
        "messageType": message_type,
        "payload": payload
    })
}

fn copy_managed_environment(command: &mut Command) {
    for key in [
        "PATH",
        "SYSTEMROOT",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONDONTWRITEBYTECODE", "1");
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|_| "Managed runtime file is unavailable.")?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|_| "Managed runtime file could not be verified.")?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sha256_tree(root: &Path) -> Result<String, String> {
    if !root.is_dir() {
        return Err("Managed runtime integrity tree is unavailable.".into());
    }
    let mut hasher = Sha256::new();
    hash_tree_entries(root, root, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn hash_tree_entries(root: &Path, directory: &Path, hasher: &mut Sha256) -> Result<(), String> {
    let mut entries = fs::read_dir(directory)
        .map_err(|_| "Managed runtime integrity tree could not be read.")?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Managed runtime integrity entry could not be read.")?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|_| "Managed runtime integrity path is invalid.")?;
        let metadata = fs::symlink_metadata(&path)
            .map_err(|_| "Managed runtime integrity metadata is unavailable.")?;
        if metadata.file_type().is_symlink() {
            return Err("Managed runtime integrity tree contains a link.".into());
        }
        let relative_bytes = relative.to_string_lossy();
        if metadata.is_dir() {
            hasher.update(b"directory\0");
            hasher.update(relative_bytes.as_bytes());
            hasher.update(b"\0");
            hash_tree_entries(root, &path, hasher)?;
        } else if metadata.is_file() {
            hasher.update(b"file\0");
            hasher.update(relative_bytes.as_bytes());
            hasher.update(b"\0");
            let mut file =
                File::open(&path).map_err(|_| "Managed runtime integrity file is unavailable.")?;
            let mut buffer = [0_u8; 64 * 1024];
            loop {
                let count = file
                    .read(&mut buffer)
                    .map_err(|_| "Managed runtime integrity file could not be read.")?;
                if count == 0 {
                    break;
                }
                hasher.update(&buffer[..count]);
            }
        } else {
            return Err("Managed runtime integrity tree contains a special file.".into());
        }
    }
    Ok(())
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "Managed runtime evidence could not be encoded.")?;
    fs::write(path, bytes)
        .map_err(|_| "Managed runtime evidence could not be recorded.".to_string())
}

fn operation_nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

fn timestamp() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{seconds}")
}

struct FileLock {
    file: File,
}

impl FileLock {
    fn acquire(path: PathBuf) -> Result<Self, String> {
        let mut file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&path)
            .map_err(|_| "Managed Python provisioning lock is already held.")?;
        file.try_lock_exclusive()
            .map_err(|_| "Managed Python provisioning lock is already held.")?;
        file.set_len(0)
            .map_err(|_| "Managed Python provisioning lock could not be recorded.")?;
        write!(file, "pid={}", std::process::id())
            .map_err(|_| "Managed Python provisioning lock could not be recorded.")?;
        file.sync_all()
            .map_err(|_| "Managed Python provisioning lock could not be synchronized.")?;
        Ok(Self { file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = self.file.unlock();
    }
}

#[cfg(unix)]
fn set_private_directory_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700))
        .map_err(|_| "Managed Python private permissions could not be applied.".to_string())
}

#[cfg(not(unix))]
fn set_private_directory_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_manifest_selects_current_platform_and_pins_every_hash() {
        let manifest = trusted_manifest().unwrap();
        let artifact = selected_artifact(&manifest).unwrap();
        assert_eq!(artifact.sha256.len(), 64);
        assert!(artifact.url.starts_with("https://"));
        assert_eq!(manifest.agent_fuse.commit.len(), 40);
        assert_eq!(manifest.agent_fuse.sha256.len(), 64);
        assert!(manifest.installed_package_lock.packages.is_empty());
    }

    #[test]
    fn archive_paths_reject_absolute_and_parent_traversal() {
        assert!(validate_relative_path(Path::new("python/bin/python3")).is_ok());
        assert!(validate_relative_path(Path::new("../escape")).is_err());
        assert!(validate_relative_path(Path::new("/absolute")).is_err());
    }

    #[test]
    fn source_archive_strips_exactly_one_root_component() {
        assert_eq!(
            normalized_archive_path(
                Path::new("dhms-engine-commit/dhms_agentfuse/runtime_guard.py"),
                true
            )
            .unwrap(),
            Some(PathBuf::from("dhms_agentfuse/runtime_guard.py"))
        );
    }

    #[test]
    fn output_reader_enforces_bounds() {
        let bytes = vec![b'x'; 128];
        let output = read_bounded(bytes.as_slice(), 64);
        assert_eq!(output.bytes.len(), 64);
        assert!(output.truncated);
    }

    #[test]
    fn operation_and_bridge_guards_prevent_duplicates() {
        let state = ManagedPythonState::default();
        let operation = state.operation_guard().unwrap();
        assert!(state.operation_guard().is_err());
        drop(operation);
        assert!(state.operation_guard().is_ok());
        let bridge = state.bridge_guard().unwrap();
        assert!(state.bridge_guard().is_err());
        drop(bridge);
    }

    #[test]
    fn environment_allowlist_omits_common_credentials() {
        std::env::set_var("OPENAI_API_KEY", "secret");
        std::env::set_var("GITHUB_TOKEN", "secret");
        let mut command = Command::new("fixture");
        command.env_clear();
        copy_managed_environment(&mut command);
        let environment: Vec<_> = command.get_envs().collect();
        assert!(!environment
            .iter()
            .any(|(key, _)| *key == "OPENAI_API_KEY" || *key == "GITHUB_TOKEN"));
        assert!(environment
            .iter()
            .any(|(key, _)| *key == "PYTHONNOUSERSITE"));
        std::env::remove_var("OPENAI_API_KEY");
        std::env::remove_var("GITHUB_TOKEN");
    }

    #[test]
    fn native_decision_request_rejects_unknown_fixture_and_extra_fields() {
        let valid = json!({
            "protocolVersion": BRIDGE_PROTOCOL,
            "messageId": "message-1",
            "messageType": "decision_request",
            "payload": {"policyFixtureId": "kerniq-proof-allow-v1"}
        });
        let request: AgentFuseNativeDecisionRequest = serde_json::from_value(valid).unwrap();
        assert!(validate_native_decision_request(&request).is_ok());
        let unknown = AgentFuseNativeDecisionRequest {
            payload: json!({"policyFixtureId": "model-selected"}),
            ..request
        };
        assert!(validate_native_decision_request(&unknown).is_err());
        assert!(
            serde_json::from_value::<AgentFuseNativeDecisionRequest>(json!({
                "protocolVersion": BRIDGE_PROTOCOL,
                "messageId": "message-1",
                "messageType": "decision_request",
                "payload": {"policyFixtureId": "kerniq-proof-allow-v1"},
                "rawCommand": "python -c unsafe"
            }))
            .is_err()
        );
    }

    #[test]
    fn file_lock_is_exclusive_and_released_on_drop() {
        let root = std::env::temp_dir().join(format!("kerniq-python-lock-{}", operation_nonce()));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("runtime.lock");
        let lock = FileLock::acquire(path.clone()).unwrap();
        assert!(FileLock::acquire(path.clone()).is_err());
        drop(lock);
        assert!(FileLock::acquire(path).is_ok());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn integrity_tree_is_deterministic_and_detects_tampering() {
        let root =
            std::env::temp_dir().join(format!("kerniq-python-integrity-{}", operation_nonce()));
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("nested").join("module.py"), "trusted").unwrap();
        let first = sha256_tree(&root).unwrap();
        assert_eq!(sha256_tree(&root).unwrap(), first);
        fs::write(root.join("nested").join("module.py"), "tampered").unwrap();
        assert_ne!(sha256_tree(&root).unwrap(), first);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn integrity_tree_rejects_links() {
        use std::os::unix::fs::symlink;

        let root =
            std::env::temp_dir().join(format!("kerniq-python-tree-link-{}", operation_nonce()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("target"), "trusted").unwrap();
        symlink(root.join("target"), root.join("link")).unwrap();
        assert!(sha256_tree(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn archive_extraction_rejects_symbolic_links() {
        use flate2::{write::GzEncoder, Compression};

        let root =
            std::env::temp_dir().join(format!("kerniq-python-archive-{}", operation_nonce()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("link.tar.gz");
        let encoder = GzEncoder::new(File::create(&archive_path).unwrap(), Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header.set_link_name("../escape").unwrap();
        header.set_cksum();
        archive
            .append_data(&mut header, "root/link", std::io::empty())
            .unwrap();
        archive.into_inner().unwrap().finish().unwrap();
        let destination = root.join("destination");
        fs::create_dir_all(&destination).unwrap();
        assert!(extract_tar_gz(&archive_path, &destination, true).is_err());
        assert!(!destination.join("link").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn handshake_rejects_unexpected_agentfuse_revision() {
        let manifest = trusted_manifest().unwrap();
        let response = json!({
            "protocolVersion": BRIDGE_PROTOCOL,
            "messageId": "hello",
            "messageType": "hello_ack",
            "payload": {
                "bridgeProtocolVersion": BRIDGE_PROTOCOL,
                "pythonVersion": manifest.python_version,
                "agentFusePackageVersion": "3.5.0",
                "agentFuseSourceCommit": "0000000000000000000000000000000000000000",
                "supportedDecisionSchema": manifest.decision_schema_version,
                "processId": 1
            }
        });
        assert!(validate_handshake(&response, &manifest).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn version_check_rejects_an_unexpected_interpreter() {
        use std::os::unix::fs::PermissionsExt;

        let root =
            std::env::temp_dir().join(format!("kerniq-python-version-{}", operation_nonce()));
        fs::create_dir_all(&root).unwrap();
        let executable = root.join("python3");
        fs::write(&executable, "#!/bin/sh\necho 'Python 0.0.0'\n").unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(verify_python_version(&executable, "3.12.13").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn atomic_promotion_replaces_broken_profile_without_losing_verified_temp() {
        let root =
            std::env::temp_dir().join(format!("kerniq-python-promote-{}", operation_nonce()));
        let temporary = root.join("temporary");
        let profile = root.join("profile");
        fs::create_dir_all(&temporary).unwrap();
        fs::create_dir_all(&profile).unwrap();
        fs::write(temporary.join("verified"), "yes").unwrap();
        fs::write(profile.join("broken"), "yes").unwrap();
        promote_runtime(&temporary, &profile).unwrap();
        assert!(profile.join("verified").is_file());
        assert!(!profile.join("broken").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn interrupted_install_recovery_removes_only_matching_private_directories() {
        let root =
            std::env::temp_dir().join(format!("kerniq-python-recovery-{}", operation_nonce()));
        fs::create_dir_all(root.join(".installing-macos-x86_64-1")).unwrap();
        fs::create_dir_all(root.join("macos-x86_64")).unwrap();
        recover_partial_installs(&root, "macos-x86_64").unwrap();
        assert!(!root.join(".installing-macos-x86_64-1").exists());
        assert!(root.join("macos-x86_64").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
