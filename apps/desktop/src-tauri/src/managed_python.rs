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
const BRIDGE_PYTHON_FLAGS: [&str; 3] = ["-B", "-s", "-E"];
const MESSAGE_LIMIT: usize = 64 * 1024;
const STDOUT_LIMIT: usize = 256 * 1024;
const STDERR_LIMIT: usize = 64 * 1024;
const BRIDGE_SESSION_TIMEOUT: Duration = Duration::from_secs(15);
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
    bridge: BridgeManifest,
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
    archive_sha256: String,
    installed_tree_sha256: String,
    archive_format: String,
    expected_executable: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AgentFuseManifest {
    repository: String,
    commit: String,
    package_version: String,
    url: String,
    archive_sha256: String,
    installed_tree_sha256: String,
    archive_format: String,
    expected_module: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BridgeManifest {
    installed_tree_sha256: String,
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
        let responses = run_bridge_session(&app, messages)?;
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
        || manifest.installed_package_lock.mode != "verified-source-no-site-packages"
        || !manifest.installed_package_lock.packages.is_empty()
        || !is_lower_hex(&manifest.agent_fuse.commit, 40)
        || !is_trusted_sha256(&manifest.bridge.installed_tree_sha256)
    {
        return Err("Trusted managed Python manifest failed validation.".into());
    }
    for artifact in &manifest.distribution.artifacts {
        validate_manifest_artifact(artifact)?;
    }
    validate_source_artifact(&manifest.agent_fuse)?;
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
            &artifact.archive_sha256,
            &python_archive,
            PYTHON_ARCHIVE_LIMIT,
        )?;
        extract_tar_gz(&python_archive, &temporary.join("distribution"), false)?;
        fs::remove_file(&python_archive).ok();

        let source_archive = temporary.join("locks").join("agentfuse.tar.gz");
        download_verified(
            &manifest.agent_fuse.url,
            &manifest.agent_fuse.archive_sha256,
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
        || !is_trusted_sha256(&artifact.archive_sha256)
        || !is_trusted_sha256(&artifact.installed_tree_sha256)
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
        || !is_trusted_sha256(&source.archive_sha256)
        || !is_trusted_sha256(&source.installed_tree_sha256)
        || !is_lower_hex(&source.commit, 40)
        || source.package_version.is_empty()
        || source.archive_format != "tar.gz"
    {
        return Err("Trusted AgentFuse source entry is invalid.".into());
    }
    validate_relative_path(Path::new(&source.expected_module))?;
    Ok(())
}

fn is_trusted_sha256(value: &str) -> bool {
    is_lower_hex(value, 64) && value.bytes().any(|byte| byte != b'0')
}

fn is_lower_hex(value: &str, expected_length: usize) -> bool {
    value.len() == expected_length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
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
    let mut deferred_links = Vec::new();
    for entry in entries {
        let mut entry = entry.map_err(|_| "Verified archive entry is malformed.")?;
        let entry_type = entry.header().entry_type();
        if entry_type.is_pax_global_extensions()
            || entry_type.is_pax_local_extensions()
            || entry_type.is_gnu_longname()
            || entry_type.is_gnu_longlink()
        {
            continue;
        }
        if !(entry_type.is_file() || entry_type.is_dir() || entry_type.is_symlink()) {
            return Err(format!(
                "Managed archive contains unsupported entry type 0x{:02x}.",
                entry_type.as_byte()
            ));
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
        if entry_type.is_symlink() {
            let link_name = entry
                .link_name()
                .map_err(|_| "Managed archive link target is malformed.")?
                .ok_or("Managed archive link target is missing.")?;
            let target_relative = resolve_archive_link_target(&relative, &link_name)?;
            deferred_links.push((output, destination.join(target_relative)));
        } else if entry_type.is_dir() {
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
    materialize_archive_links(deferred_links)
}

fn resolve_archive_link_target(link_path: &Path, link_target: &Path) -> Result<PathBuf, String> {
    if link_target.is_absolute() {
        return Err("Managed archive link target is absolute.".into());
    }
    let mut resolved = link_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_default();
    for component in link_target.components() {
        match component {
            Component::Normal(value) => resolved.push(value),
            Component::CurDir => {}
            Component::ParentDir => {
                if !resolved.pop() {
                    return Err("Managed archive link target escapes the destination.".into());
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("Managed archive link target is invalid.".into());
            }
        }
    }
    if resolved.as_os_str().is_empty() || resolved == link_path {
        return Err("Managed archive link target is invalid.".into());
    }
    Ok(resolved)
}

fn materialize_archive_links(mut links: Vec<(PathBuf, PathBuf)>) -> Result<(), String> {
    while !links.is_empty() {
        let mut remaining = Vec::new();
        let mut progress = false;
        for (output, target) in links {
            if !target.is_file() {
                remaining.push((output, target));
                continue;
            }
            if output.exists() {
                return Err("Managed archive link path collides with another entry.".into());
            }
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent)
                    .map_err(|_| "Managed archive link parent could not be created.")?;
            }
            fs::copy(target, output)
                .map_err(|_| "Managed archive link could not be materialized.")?;
            progress = true;
        }
        if !progress {
            return Err("Managed archive link target is missing or not a regular file.".into());
        }
        links = remaining;
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
        let normalized = contents.replace("\r\n", "\n").replace('\r', "\n");
        fs::write(package.join(name), normalized)
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
    if record.manifest_sha256 != sha256_bytes(TRUSTED_MANIFEST.as_bytes()) {
        return Err("Managed runtime integrity digest mismatch.".into());
    }
    verify_trusted_profile_trees(profile, &artifact, manifest)?;
    if !executable.is_file() || !agent_fuse_module.is_file() || !bridge_service.is_file() {
        return Err("Managed runtime integrity layout mismatch.".into());
    }
    verify_agentfuse_source_contract(&profile.join("agentfuse-source"), manifest)?;
    if execute_version_check {
        verify_python_version(&executable, &manifest.python_version)?;
    }
    Ok(record)
}

fn verify_trusted_profile_trees(
    profile: &Path,
    artifact: &RuntimeArtifact,
    manifest: &RuntimeManifest,
) -> Result<(), String> {
    if sha256_tree(&profile.join("distribution"))? != artifact.installed_tree_sha256
        || sha256_tree(&profile.join("agentfuse-source"))?
            != manifest.agent_fuse.installed_tree_sha256
        || sha256_tree(&profile.join("bridge"))? != manifest.bridge.installed_tree_sha256
    {
        return Err("Managed runtime integrity digest mismatch.".into());
    }
    Ok(())
}

fn verify_agentfuse_source_contract(
    source_root: &Path,
    manifest: &RuntimeManifest,
) -> Result<(), String> {
    let pyproject = fs::read_to_string(source_root.join("pyproject.toml"))
        .map_err(|_| "Trusted AgentFuse package metadata is unavailable.")?;
    let runtime_guard =
        fs::read_to_string(source_root.join("dhms_agentfuse").join("runtime_guard.py"))
            .map_err(|_| "Trusted AgentFuse runtime guard is unavailable.")?;
    let evidence_schema = fs::read_to_string(
        source_root
            .join("dhms_agentfuse")
            .join("evidence_schema.py"),
    )
    .map_err(|_| "Trusted AgentFuse evidence schema is unavailable.")?;
    if !pyproject.contains(&format!(
        "version = \"{}\"",
        manifest.agent_fuse.package_version
    )) || !evidence_schema.contains(&format!(
        "SCHEMA_VERSION = \"{}\"",
        manifest.decision_schema_version
    )) || !runtime_guard.contains("class RuntimeGuardDecision:")
        || !runtime_guard.contains("def evaluate(")
        || !runtime_guard.contains("async def aevaluate(")
    {
        return Err("Trusted AgentFuse public decision contract is unavailable.".into());
    }
    Ok(())
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
    let responses = run_bridge_session(app, messages)?;
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

fn run_bridge_session(app: &tauri::AppHandle, messages: Vec<Value>) -> Result<Vec<Value>, String> {
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
        .args(BRIDGE_PYTHON_FLAGS)
        .args(["-m", "kerniq_agentfuse_bridge", "--agentfuse-source"])
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
    let output = wait_for_child_output(&mut child, BRIDGE_SESSION_TIMEOUT)?;
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
        || payload["agentFusePackageVersion"] != manifest.agent_fuse.package_version
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
        || response["payload"]["policyVersion"]
            != format!(
                "dhms-agentfuse-runtime-guard@{}",
                manifest.agent_fuse.package_version
            )
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
        let relative_bytes = normalized_integrity_path(relative)?;
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

fn normalized_integrity_path(path: &Path) -> Result<String, String> {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => components.push(value.to_string_lossy().into_owned()),
            Component::CurDir => {}
            _ => return Err("Managed runtime integrity path is invalid.".into()),
        }
    }
    if components.is_empty() {
        return Err("Managed runtime integrity path is invalid.".into());
    }
    Ok(components.join("/"))
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
        assert_eq!(artifact.archive_sha256.len(), 64);
        assert_eq!(artifact.installed_tree_sha256.len(), 64);
        assert!(artifact.url.starts_with("https://"));
        assert_eq!(manifest.agent_fuse.commit.len(), 40);
        assert_eq!(manifest.agent_fuse.archive_sha256.len(), 64);
        assert_eq!(manifest.agent_fuse.installed_tree_sha256.len(), 64);
        assert_eq!(manifest.bridge.installed_tree_sha256.len(), 64);
        assert!(manifest.installed_package_lock.packages.is_empty());
    }

    #[test]
    fn embedded_bridge_tree_matches_trusted_manifest() {
        let root = std::env::temp_dir().join(format!("kerniq-bridge-anchor-{}", operation_nonce()));
        write_bridge(&root).unwrap();
        assert_eq!(
            sha256_tree(&root).unwrap(),
            trusted_manifest().unwrap().bridge.installed_tree_sha256
        );
        fs::remove_dir_all(root).unwrap();
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
    fn bridge_flags_disable_bytecode_and_ignore_python_environment() {
        assert!(BRIDGE_PYTHON_FLAGS.contains(&"-B"));
        assert!(BRIDGE_PYTHON_FLAGS.contains(&"-E"));
        assert!(BRIDGE_PYTHON_FLAGS.contains(&"-s"));
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
    fn archive_extraction_rejects_escaping_symbolic_links() {
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
    fn archive_extraction_materializes_safe_internal_symbolic_links() {
        use flate2::{write::GzEncoder, Compression};

        let root =
            std::env::temp_dir().join(format!("kerniq-python-safe-link-{}", operation_nonce()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("safe-link.tar.gz");
        let encoder = GzEncoder::new(File::create(&archive_path).unwrap(), Compression::default());
        let mut archive = tar::Builder::new(encoder);
        let contents = b"python";
        let mut file_header = tar::Header::new_gnu();
        file_header.set_entry_type(tar::EntryType::Regular);
        file_header.set_size(contents.len() as u64);
        file_header.set_mode(0o700);
        file_header.set_cksum();
        archive
            .append_data(&mut file_header, "root/python3.12", contents.as_slice())
            .unwrap();
        let mut link_header = tar::Header::new_gnu();
        link_header.set_entry_type(tar::EntryType::Symlink);
        link_header.set_size(0);
        link_header.set_mode(0o777);
        link_header.set_link_name("python3.12").unwrap();
        link_header.set_cksum();
        archive
            .append_data(&mut link_header, "root/python3", std::io::empty())
            .unwrap();
        archive.into_inner().unwrap().finish().unwrap();
        let destination = root.join("destination");
        fs::create_dir_all(&destination).unwrap();
        extract_tar_gz(&archive_path, &destination, true).unwrap();
        assert_eq!(fs::read(destination.join("python3")).unwrap(), contents);
        assert!(!fs::symlink_metadata(destination.join("python3"))
            .unwrap()
            .file_type()
            .is_symlink());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn external_verified_archive_fixture_extracts_when_explicitly_provided() {
        if let Ok(fixture) = std::env::var("KERNIQ_VERIFIED_RUNTIME_ARCHIVE_FIXTURE") {
            let root = std::env::temp_dir().join(format!(
                "kerniq-python-external-runtime-{}",
                operation_nonce()
            ));
            fs::create_dir_all(&root).unwrap();
            extract_tar_gz(Path::new(&fixture), &root, false).unwrap();
            assert!(root.join("python").join("bin").join("python3").is_file());
            fs::remove_dir_all(root).unwrap();
        }
        if let Ok(fixture) = std::env::var("KERNIQ_VERIFIED_SOURCE_ARCHIVE_FIXTURE") {
            let root = std::env::temp_dir().join(format!(
                "kerniq-python-external-source-{}",
                operation_nonce()
            ));
            fs::create_dir_all(&root).unwrap();
            extract_tar_gz(Path::new(&fixture), &root, true).unwrap();
            assert!(root
                .join("dhms_agentfuse")
                .join("runtime_guard.py")
                .is_file());
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    #[ignore = "downloads every supported pinned runtime archive"]
    fn regenerate_trusted_installed_tree_digests() {
        assert_eq!(
            std::env::var("KERNIQ_REGENERATE_RUNTIME_DIGESTS").as_deref(),
            Ok("1"),
            "Set KERNIQ_REGENERATE_RUNTIME_DIGESTS=1 to run this maintenance command."
        );
        let manifest: RuntimeManifest = serde_json::from_str(TRUSTED_MANIFEST).unwrap();
        let cache = std::env::var_os("KERNIQ_RUNTIME_DIGEST_CACHE")
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("kerniq-runtime-digest-cache"));
        let extraction_root = std::env::var_os("KERNIQ_RUNTIME_DIGEST_EXTRACT_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|| cache.clone());
        fs::create_dir_all(&cache).unwrap();
        fs::create_dir_all(&extraction_root).unwrap();
        for artifact in &manifest.distribution.artifacts {
            let archive = cache.join(format!(
                "python-{}-{}.tar.gz",
                artifact.platform, artifact.architecture
            ));
            if archive.exists()
                && sha256_file(&archive).ok().as_deref() != Some(artifact.archive_sha256.as_str())
            {
                fs::remove_file(&archive).unwrap();
            }
            if !archive.exists() {
                download_verified(
                    &artifact.url,
                    &artifact.archive_sha256,
                    &archive,
                    PYTHON_ARCHIVE_LIMIT,
                )
                .unwrap();
            }
            let extracted = extraction_root.join(format!(
                "extract-{}-{}",
                artifact.platform, artifact.architecture
            ));
            fs::remove_dir_all(&extracted).ok();
            fs::create_dir_all(&extracted).unwrap();
            extract_tar_gz(&archive, &extracted, false).unwrap();
            assert!(extracted.join(&artifact.expected_executable).is_file());
            println!(
                "distribution {} {} {}",
                artifact.platform,
                artifact.architecture,
                sha256_tree(&extracted).unwrap()
            );
            fs::remove_dir_all(extracted).unwrap();
        }

        let source_archive = cache.join("agentfuse-source.tar.gz");
        if source_archive.exists()
            && sha256_file(&source_archive).ok().as_deref()
                != Some(manifest.agent_fuse.archive_sha256.as_str())
        {
            fs::remove_file(&source_archive).unwrap();
        }
        if !source_archive.exists() {
            download_verified(
                &manifest.agent_fuse.url,
                &manifest.agent_fuse.archive_sha256,
                &source_archive,
                AGENTFUSE_ARCHIVE_LIMIT,
            )
            .unwrap();
        }
        let source = extraction_root.join("extract-agentfuse-source");
        fs::remove_dir_all(&source).ok();
        fs::create_dir_all(&source).unwrap();
        extract_tar_gz(&source_archive, &source, true).unwrap();
        println!("agentfuse {}", sha256_tree(&source).unwrap());
        fs::remove_dir_all(source).unwrap();

        let bridge = extraction_root.join("extract-kerniq-bridge");
        fs::remove_dir_all(&bridge).ok();
        fs::create_dir_all(&bridge).unwrap();
        write_bridge(&bridge).unwrap();
        println!("bridge {}", sha256_tree(&bridge).unwrap());
        fs::remove_dir_all(bridge).unwrap();
    }

    #[test]
    #[ignore = "prepares an isolated real-smoke profile from verified local archives"]
    fn prepare_verified_real_smoke_profile_from_cache() {
        let profile = PathBuf::from(
            std::env::var_os("KERNIQ_PREPARE_SMOKE_PROFILE")
                .expect("Set KERNIQ_PREPARE_SMOKE_PROFILE to a new isolated profile path."),
        );
        assert!(!profile.exists(), "Smoke profile path must be new.");
        let cache = PathBuf::from(
            std::env::var_os("KERNIQ_RUNTIME_DIGEST_CACHE")
                .expect("Set KERNIQ_RUNTIME_DIGEST_CACHE to the verified archive cache."),
        );
        let manifest = trusted_manifest().unwrap();
        let artifact = selected_artifact(&manifest).unwrap();
        let python_archive = cache.join(format!(
            "python-{}-{}.tar.gz",
            artifact.platform, artifact.architecture
        ));
        let source_archive = cache.join("agentfuse-source.tar.gz");
        assert_eq!(
            sha256_file(&python_archive).unwrap(),
            artifact.archive_sha256
        );
        assert_eq!(
            sha256_file(&source_archive).unwrap(),
            manifest.agent_fuse.archive_sha256
        );
        for directory in [
            "distribution",
            "environment",
            "agentfuse-source",
            "bridge",
            "manifest",
            "logs",
            "locks",
        ] {
            fs::create_dir_all(profile.join(directory)).unwrap();
        }
        set_private_directory_permissions(&profile).unwrap();
        extract_tar_gz(&python_archive, &profile.join("distribution"), false).unwrap();
        extract_tar_gz(&source_archive, &profile.join("agentfuse-source"), true).unwrap();
        write_bridge(&profile.join("bridge")).unwrap();

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
        verify_python_version(&executable, &manifest.python_version).unwrap();
        let now = timestamp();
        let record = InstalledRuntimeRecord {
            manifest_sha256: sha256_bytes(TRUSTED_MANIFEST.as_bytes()),
            executable_sha256: sha256_file(&executable).unwrap(),
            agent_fuse_module_sha256: sha256_file(&agent_fuse_module).unwrap(),
            bridge_service_sha256: sha256_file(&bridge_service).unwrap(),
            distribution_tree_sha256: sha256_tree(&profile.join("distribution")).unwrap(),
            agent_fuse_tree_sha256: sha256_tree(&profile.join("agentfuse-source")).unwrap(),
            bridge_tree_sha256: sha256_tree(&profile.join("bridge")).unwrap(),
            installed_at: now.clone(),
            last_verified_at: now,
        };
        fs::write(
            profile.join("manifest").join("trusted-manifest.json"),
            TRUSTED_MANIFEST,
        )
        .unwrap();
        write_json(
            &profile.join("manifest").join("installed-runtime.json"),
            &record,
        )
        .unwrap();
        fs::write(
            profile
                .join("environment")
                .join("installed-package-lock.json"),
            serde_json::to_vec_pretty(&manifest.installed_package_lock).unwrap(),
        )
        .unwrap();
        verify_profile(&profile, &manifest, true).unwrap();
        println!("verified_smoke_profile={}", profile.display());
    }

    #[test]
    fn embedded_tree_anchors_reject_tampering_even_after_local_record_recalculation() {
        let root = std::env::temp_dir().join(format!("kerniq-python-anchor-{}", operation_nonce()));
        let profile = root.join("profile");
        let distribution = profile.join("distribution");
        let source = profile.join("agentfuse-source");
        let bridge = profile.join("bridge");
        let record_path = profile.join("manifest").join("installed-runtime.json");
        let mut manifest = trusted_manifest().unwrap();
        let mut artifact = selected_artifact(&manifest).unwrap();
        let executable = distribution.join(&artifact.expected_executable);
        let stdlib = distribution.join("python").join("lib").join("stdlib.py");
        let runtime_guard = source.join(&manifest.agent_fuse.expected_module);
        let evidence_schema = source.join("dhms_agentfuse").join("evidence_schema.py");
        let other_source = source.join("dhms_agentfuse").join("__init__.py");
        let pyproject = source.join("pyproject.toml");
        let bridge_service = bridge.join("kerniq_agentfuse_bridge").join("service.py");
        let bridge_main = bridge.join("kerniq_agentfuse_bridge").join("__main__.py");
        for path in [
            &executable,
            &stdlib,
            &runtime_guard,
            &evidence_schema,
            &other_source,
            &pyproject,
            &bridge_service,
            &bridge_main,
        ] {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
        }
        fs::create_dir_all(record_path.parent().unwrap()).unwrap();
        fs::write(&executable, "trusted executable").unwrap();
        fs::write(&stdlib, "trusted stdlib").unwrap();
        fs::write(
            &runtime_guard,
            "class RuntimeGuardDecision:\n    pass\nclass RuntimeGuard:\n    def evaluate(self): pass\n    async def aevaluate(self): pass\n",
        )
        .unwrap();
        fs::write(
            &evidence_schema,
            format!(
                "SCHEMA_VERSION = \"{}\"\n",
                manifest.decision_schema_version
            ),
        )
        .unwrap();
        fs::write(&other_source, "trusted package surface").unwrap();
        fs::write(
            &pyproject,
            format!(
                "[project]\nversion = \"{}\"\n",
                manifest.agent_fuse.package_version
            ),
        )
        .unwrap();
        fs::write(&bridge_service, "trusted bridge").unwrap();
        fs::write(&bridge_main, "trusted bridge entrypoint").unwrap();
        artifact.installed_tree_sha256 = sha256_tree(&distribution).unwrap();
        manifest
            .distribution
            .artifacts
            .iter_mut()
            .find(|candidate| {
                candidate.platform == artifact.platform
                    && candidate.architecture == artifact.architecture
            })
            .unwrap()
            .installed_tree_sha256 = artifact.installed_tree_sha256.clone();
        manifest.agent_fuse.installed_tree_sha256 = sha256_tree(&source).unwrap();
        manifest.bridge.installed_tree_sha256 = sha256_tree(&bridge).unwrap();

        let mut record = InstalledRuntimeRecord {
            manifest_sha256: sha256_bytes(TRUSTED_MANIFEST.as_bytes()),
            executable_sha256: sha256_file(&executable).unwrap(),
            agent_fuse_module_sha256: sha256_file(&runtime_guard).unwrap(),
            bridge_service_sha256: sha256_file(&bridge_service).unwrap(),
            distribution_tree_sha256: sha256_tree(&distribution).unwrap(),
            agent_fuse_tree_sha256: sha256_tree(&source).unwrap(),
            bridge_tree_sha256: sha256_tree(&bridge).unwrap(),
            installed_at: "fixture".into(),
            last_verified_at: "fixture".into(),
        };
        write_json(&record_path, &record).unwrap();
        assert!(verify_profile(&profile, &manifest, false).is_ok());

        for (path, trusted_contents) in [
            (&executable, "trusted executable"),
            (&stdlib, "trusted stdlib"),
            (
                &runtime_guard,
                "class RuntimeGuardDecision:\n    pass\nclass RuntimeGuard:\n    def evaluate(self): pass\n    async def aevaluate(self): pass\n",
            ),
            (
                &evidence_schema,
                "SCHEMA_VERSION = \"agentfuse-evidence-schema-v0.1\"\n",
            ),
            (&other_source, "trusted package surface"),
            (&bridge_service, "trusted bridge"),
            (&bridge_main, "trusted bridge entrypoint"),
        ] {
            fs::write(path, "tampered").unwrap();
            record.executable_sha256 = sha256_file(&executable).unwrap();
            record.agent_fuse_module_sha256 = sha256_file(&runtime_guard).unwrap();
            record.bridge_service_sha256 = sha256_file(&bridge_service).unwrap();
            record.distribution_tree_sha256 = sha256_tree(&distribution).unwrap();
            record.agent_fuse_tree_sha256 = sha256_tree(&source).unwrap();
            record.bridge_tree_sha256 = sha256_tree(&bridge).unwrap();
            write_json(&record_path, &record).unwrap();
            assert!(verify_profile(&profile, &manifest, false).is_err());
            fs::write(path, trusted_contents).unwrap();
        }

        let trusted_manifest_sha256 = record.manifest_sha256.clone();
        record.manifest_sha256 = "0".repeat(64);
        write_json(&record_path, &record).unwrap();
        assert!(verify_profile(&profile, &manifest, false).is_err());
        record.manifest_sha256 = trusted_manifest_sha256;
        write_json(&record_path, &record).unwrap();
        assert!(verify_profile(&profile, &manifest, false).is_ok());

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
                "agentFusePackageVersion": manifest.agent_fuse.package_version,
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
