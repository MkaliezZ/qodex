use crate::coding_pack_database::{canonical_json, parse_timestamp, sha256_canonical};
use getrandom::getrandom;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub(crate) const EXPORT_PLAN_SCHEMA: &str = "kerniq.coding-pack.export-plan.v1";
const MANIFEST_SCHEMA: &str = "kerniq.coding-pack.manifest.v1";
const PACK_VERSION: &str = "0.7";
const SELECTION_RULES_VERSION: &str = "kerniq-coding-pack-selection-v1";
const MAX_FILES: usize = 500;
const MAX_FILE_BYTES: u64 = 524_288;
const MAX_TOTAL_BYTES: u64 = 10_485_760;
const MAX_PATH_BYTES: usize = 1_024;
const MAX_SEGMENT_BYTES: usize = 255;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeExportRequest {
    pub operation_id: String,
    pub export_attempt_id: String,
    pub canonical_manifest_json: String,
    pub project_binding_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeExportResult {
    pub operation_id: String,
    pub export_attempt_id: String,
    pub export_plan_digest: String,
    pub manifest_digest: String,
    pub target_name: String,
    pub source_file_count: usize,
    pub source_total_bytes: u64,
    pub completed_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeExportPlan {
    pub schema_version: String,
    pub operation_id: String,
    pub export_attempt_id: String,
    pub decision_id: String,
    pub request_digest: String,
    pub proposal_digest: String,
    pub candidate_paths_digest: String,
    pub source_fingerprint: String,
    pub pack_id: String,
    pub manifest_digest: String,
    pub destination_binding_id: String,
    pub destination_fingerprint: String,
    pub target_name: String,
    pub manifest_byte_count: usize,
    pub source_file_count: usize,
    pub source_total_bytes: u64,
    pub export_started_at: String,
    pub export_plan_digest: String,
}

#[derive(Debug)]
pub(crate) struct PreparedNativeExport {
    pub plan: NativeExportPlan,
    pub destination_root: PathBuf,
    pub manifest_bytes: Vec<u8>,
    pub sources: Vec<VerifiedSource>,
}

#[derive(Debug)]
pub(crate) struct VerifiedSource {
    pub relative_path: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedManifest {
    pub canonical_bytes: Vec<u8>,
    pub candidate_paths_digest: String,
    pub source_fingerprint: String,
    pub pack_id: String,
    pub manifest_digest: String,
    pub sources: Vec<ManifestSource>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ManifestSource {
    pub relative_path: String,
    pub source_digest: String,
    pub byte_count: u64,
    pub encoding: String,
    pub inclusion_reason_code: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ManifestExclusion {
    relative_path: String,
    reason_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableProject {
    #[serde(skip_serializing_if = "Option::is_none")]
    project_label: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableManifest {
    schema_version: String,
    pack_version: String,
    pack_id: String,
    purpose: String,
    project: PortableProject,
    selection_rules_version: String,
    sources: Vec<ManifestSource>,
    exclusions: Vec<ManifestExclusion>,
    source_fingerprint: String,
    generated_at: String,
    manifest_digest: String,
}

#[derive(Debug)]
pub(crate) struct ExportWriteFailure {
    pub phase_code: &'static str,
    pub reason_code: &'static str,
    pub staging_path: Option<PathBuf>,
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ExportFault {
    StagingCreate,
    ManifestWrite,
    SourceWrite,
    Flush,
    Promotion,
}

pub(crate) fn validate_manifest(input: &str) -> Result<ValidatedManifest, String> {
    if input.len() > MAX_TOTAL_BYTES as usize || input.contains('\0') {
        return Err("coding_pack_manifest_mismatch".into());
    }
    let value: Value =
        serde_json::from_str(input).map_err(|_| "coding_pack_manifest_mismatch".to_string())?;
    let canonical =
        canonical_json(&value).map_err(|_| "coding_pack_manifest_mismatch".to_string())?;
    if canonical != input {
        return Err("coding_pack_manifest_mismatch".into());
    }
    let manifest: PortableManifest = serde_json::from_value(value.clone())
        .map_err(|_| "coding_pack_manifest_mismatch".to_string())?;
    validate_manifest_shape(&manifest)?;

    let identity = json!({
        "schemaVersion": MANIFEST_SCHEMA,
        "packVersion": PACK_VERSION,
        "purpose": manifest.purpose,
        "selectionRulesVersion": manifest.selection_rules_version,
        "sources": manifest.sources,
        "exclusions": manifest.exclusions,
    });
    let source_fingerprint =
        sha256_canonical(&identity).map_err(|_| "coding_pack_manifest_mismatch".to_string())?;
    let pack_id = format!("pack-{}", &source_fingerprint["sha256:".len()..]);

    let mut without_digest = value.clone();
    without_digest
        .as_object_mut()
        .ok_or_else(|| "coding_pack_manifest_mismatch".to_string())?
        .remove("manifestDigest");
    let manifest_digest = sha256_canonical(&without_digest)
        .map_err(|_| "coding_pack_manifest_mismatch".to_string())?;
    if source_fingerprint != manifest.source_fingerprint
        || pack_id != manifest.pack_id
        || manifest_digest != manifest.manifest_digest
    {
        return Err("coding_pack_manifest_mismatch".into());
    }

    let mut candidate_paths = manifest
        .sources
        .iter()
        .map(|source| source.relative_path.clone())
        .chain(
            manifest
                .exclusions
                .iter()
                .map(|exclusion| exclusion.relative_path.clone()),
        )
        .collect::<Vec<_>>();
    candidate_paths.sort_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
    if candidate_paths.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err("coding_pack_manifest_mismatch".into());
    }
    let candidate_paths_digest = sha256_canonical(&json!(candidate_paths))
        .map_err(|_| "coding_pack_manifest_mismatch".to_string())?;

    Ok(ValidatedManifest {
        canonical_bytes: canonical.into_bytes(),
        candidate_paths_digest,
        source_fingerprint,
        pack_id,
        manifest_digest,
        sources: manifest.sources,
    })
}

fn validate_manifest_shape(manifest: &PortableManifest) -> Result<(), String> {
    if manifest.schema_version != MANIFEST_SCHEMA
        || manifest.pack_version != PACK_VERSION
        || manifest.selection_rules_version != SELECTION_RULES_VERSION
        || !matches!(
            manifest.purpose.as_str(),
            "repository_orientation" | "task_context" | "review_handoff"
        )
        || !is_digest(&manifest.source_fingerprint)
        || !is_digest(&manifest.manifest_digest)
        || manifest.pack_id != format!("pack-{}", &manifest.source_fingerprint["sha256:".len()..])
        || parse_timestamp(&manifest.generated_at).is_err()
        || manifest.sources.len() > MAX_FILES
    {
        return Err("coding_pack_manifest_mismatch".into());
    }
    if let Some(label) = &manifest.project.project_label {
        validate_text(label, 128, false)?;
        if absolute_path_like(label) {
            return Err("coding_pack_manifest_mismatch".into());
        }
    }

    let mut total = 0_u64;
    let mut previous: Option<&str> = None;
    for source in &manifest.sources {
        validate_portable_path(&source.relative_path)?;
        if previous.is_some_and(|path| path.as_bytes() >= source.relative_path.as_bytes())
            || !is_digest(&source.source_digest)
            || source.byte_count > MAX_FILE_BYTES
            || source.encoding != "utf-8"
            || !is_machine_code(&source.inclusion_reason_code)
        {
            return Err("coding_pack_manifest_mismatch".into());
        }
        previous = Some(&source.relative_path);
        total = total
            .checked_add(source.byte_count)
            .ok_or_else(|| "coding_pack_manifest_mismatch".to_string())?;
    }
    if total > MAX_TOTAL_BYTES {
        return Err("coding_pack_manifest_mismatch".into());
    }

    previous = None;
    for exclusion in &manifest.exclusions {
        validate_portable_path(&exclusion.relative_path)?;
        if previous.is_some_and(|path| path.as_bytes() >= exclusion.relative_path.as_bytes())
            || !is_machine_code(&exclusion.reason_code)
        {
            return Err("coding_pack_manifest_mismatch".into());
        }
        if let Some(detail) = &exclusion.detail {
            validate_text(detail, 512, true)?;
        }
        previous = Some(&exclusion.relative_path);
    }
    Ok(())
}

pub(crate) fn read_and_verify_sources(
    project_root: &Path,
    sources: &[ManifestSource],
) -> Result<Vec<VerifiedSource>, String> {
    let mut verified = Vec::with_capacity(sources.len());
    let mut total = 0_u64;
    for source in sources {
        let bytes = read_project_file_no_follow(project_root, &source.relative_path)?;
        if bytes.len() as u64 != source.byte_count
            || bytes.len() as u64 > MAX_FILE_BYTES
            || std::str::from_utf8(&bytes).is_err()
            || digest_bytes(&bytes) != source.source_digest
        {
            return Err("coding_pack_source_changed_before_export".into());
        }
        total = total
            .checked_add(bytes.len() as u64)
            .ok_or_else(|| "coding_pack_source_changed_before_export".to_string())?;
        if total > MAX_TOTAL_BYTES {
            return Err("coding_pack_source_changed_before_export".into());
        }
        verified.push(VerifiedSource {
            relative_path: source.relative_path.clone(),
            bytes,
        });
    }
    Ok(verified)
}

pub(crate) fn random_staging_name() -> Result<String, String> {
    let mut bytes = [0_u8; 16];
    getrandom(&mut bytes).map_err(|_| "coding_pack_export_staging_failed".to_string())?;
    Ok(format!(
        ".kerniq-coding-pack-staging-{}",
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    ))
}

pub(crate) fn write_atomic_bundle(
    prepared: &PreparedNativeExport,
) -> Result<(), ExportWriteFailure> {
    write_atomic_bundle_inner(prepared, ExportFaultInternal::None)
}

#[cfg(test)]
pub(crate) fn write_atomic_bundle_with_fault(
    prepared: &PreparedNativeExport,
    fault: ExportFault,
) -> Result<(), ExportWriteFailure> {
    write_atomic_bundle_inner(prepared, ExportFaultInternal::from(fault))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExportFaultInternal {
    None,
    StagingCreate,
    ManifestWrite,
    SourceWrite,
    Flush,
    Promotion,
}

#[cfg(test)]
impl From<ExportFault> for ExportFaultInternal {
    fn from(value: ExportFault) -> Self {
        match value {
            ExportFault::StagingCreate => Self::StagingCreate,
            ExportFault::ManifestWrite => Self::ManifestWrite,
            ExportFault::SourceWrite => Self::SourceWrite,
            ExportFault::Flush => Self::Flush,
            ExportFault::Promotion => Self::Promotion,
        }
    }
}

fn write_atomic_bundle_inner(
    prepared: &PreparedNativeExport,
    fault: ExportFaultInternal,
) -> Result<(), ExportWriteFailure> {
    let staging_name = random_staging_name().map_err(|_| ExportWriteFailure {
        phase_code: "staging_create",
        reason_code: "staging_name_unavailable",
        staging_path: None,
    })?;
    let staging = prepared.destination_root.join(staging_name);
    if fault == ExportFaultInternal::StagingCreate || fs::create_dir(&staging).is_err() {
        return Err(ExportWriteFailure {
            phase_code: "staging_create",
            reason_code: "staging_create_failed",
            staging_path: None,
        });
    }
    let fail = |phase_code, reason_code| ExportWriteFailure {
        phase_code,
        reason_code,
        staging_path: Some(staging.clone()),
    };

    if fault == ExportFaultInternal::ManifestWrite
        || write_new_file(&staging.join("manifest.json"), &prepared.manifest_bytes).is_err()
    {
        return Err(fail("manifest_write", "manifest_write_failed"));
    }
    let sources_root = staging.join("sources");
    if fs::create_dir(&sources_root).is_err() {
        return Err(fail("source_write", "source_directory_create_failed"));
    }

    let mut directories = BTreeSet::new();
    for source in &prepared.sources {
        let relative = Path::new(&source.relative_path);
        let parent = relative.parent().unwrap_or_else(|| Path::new(""));
        let mut current = PathBuf::new();
        for component in parent.components() {
            current.push(component.as_os_str());
            directories.insert(current.clone());
        }
    }
    for directory in &directories {
        if fs::create_dir(sources_root.join(directory)).is_err() {
            return Err(fail("source_write", "source_directory_create_failed"));
        }
    }
    for (index, source) in prepared.sources.iter().enumerate() {
        if (fault == ExportFaultInternal::SourceWrite && index == 0)
            || write_new_file(&sources_root.join(&source.relative_path), &source.bytes).is_err()
        {
            return Err(fail("source_write", "source_write_failed"));
        }
    }
    if fault == ExportFaultInternal::Flush
        || sync_export_directories(&staging, &sources_root, &directories).is_err()
    {
        return Err(fail("flush", "directory_sync_failed"));
    }

    let final_target = prepared.destination_root.join(&prepared.plan.target_name);
    if fault == ExportFaultInternal::Promotion
        || promote_no_replace(&staging, &final_target).is_err()
    {
        return Err(fail("promotion", "atomic_promotion_failed"));
    }
    let _ = sync_directory(&prepared.destination_root);
    Ok(())
}

fn write_new_file(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.flush()?;
    file.sync_all()
}

fn sync_export_directories(
    staging: &Path,
    sources_root: &Path,
    directories: &BTreeSet<PathBuf>,
) -> std::io::Result<()> {
    for directory in directories.iter().rev() {
        sync_directory(&sources_root.join(directory))?;
    }
    sync_directory(sources_root)?;
    sync_directory(staging)
}

#[cfg(unix)]
fn sync_directory(path: &Path) -> std::io::Result<()> {
    File::open(path)?.sync_all()
}

#[cfg(windows)]
fn sync_directory(_path: &Path) -> std::io::Result<()> {
    // Windows does not expose portable directory flush semantics through std.
    Ok(())
}

#[cfg(target_os = "macos")]
fn promote_no_replace(staging: &Path, target: &Path) -> std::io::Result<()> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;
    let staging = CString::new(staging.as_os_str().as_bytes())?;
    let target = CString::new(target.as_os_str().as_bytes())?;
    let result = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            staging.as_ptr(),
            libc::AT_FDCWD,
            target.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(windows)]
fn promote_no_replace(staging: &Path, target: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let mut staging = staging.as_os_str().encode_wide().collect::<Vec<_>>();
    let mut target = target.as_os_str().encode_wide().collect::<Vec<_>>();
    staging.push(0);
    target.push(0);
    let result = unsafe { MoveFileExW(staging.as_ptr(), target.as_ptr(), 0x0000_0008) };
    if result != 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
fn promote_no_replace(_staging: &Path, _target: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "atomic no-replace promotion is unavailable",
    ))
}

pub(crate) fn safely_remove_owned_staging(
    destination_root: &Path,
    staging: &Path,
) -> Result<(), String> {
    let Some(name) = staging.file_name().and_then(|value| value.to_str()) else {
        return Err("coding_pack_export_cleanup_failed".into());
    };
    if staging.parent() != Some(destination_root)
        || !name.starts_with(".kerniq-coding-pack-staging-")
        || name.len() != ".kerniq-coding-pack-staging-".len() + 32
    {
        return Err("coding_pack_export_cleanup_failed".into());
    }
    let metadata = fs::symlink_metadata(staging)
        .map_err(|_| "coding_pack_export_cleanup_failed".to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("coding_pack_export_cleanup_failed".into());
    }
    fs::remove_dir_all(staging).map_err(|_| "coding_pack_export_cleanup_failed".into())
}

fn validate_portable_path(path: &str) -> Result<(), String> {
    if path.is_empty()
        || path.len() > MAX_PATH_BYTES
        || path.starts_with('/')
        || path.starts_with("//")
        || path.ends_with('/')
        || path.contains('\\')
        || path.chars().any(char::is_control)
    {
        return Err("coding_pack_manifest_mismatch".into());
    }
    let segments = path.split('/').collect::<Vec<_>>();
    for segment in segments {
        let lower = segment.to_ascii_lowercase();
        let device = lower.split('.').next().unwrap_or("");
        let reserved = matches!(device, "con" | "prn" | "aux" | "nul")
            || (device.len() == 4
                && (device.starts_with("com") || device.starts_with("lpt"))
                && matches!(device.as_bytes()[3], b'1'..=b'9'));
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.len() > MAX_SEGMENT_BYTES
            || segment.ends_with('.')
            || segment.ends_with(' ')
            || segment.contains(['<', '>', ':', '"', '|', '?', '*'])
            || reserved
        {
            return Err("coding_pack_manifest_mismatch".into());
        }
    }
    Ok(())
}

fn validate_text(value: &str, maximum: usize, private_sensitive: bool) -> Result<(), String> {
    if value.is_empty()
        || value.len() > maximum
        || value.trim() != value
        || value.chars().any(char::is_control)
        || (private_sensitive && contains_private_identity(value))
    {
        return Err("coding_pack_manifest_mismatch".into());
    }
    Ok(())
}

fn contains_private_identity(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains('/')
        || lower.contains('\\')
        || [
            "projectbindingid",
            "projectfingerprint",
            "privaterootpath",
            "destinationhandle",
            "destination_handle",
            "destination-handle",
        ]
        .iter()
        .any(|needle| lower.contains(needle))
        || contains_prefixed_hex(&lower, "project-", 16)
        || contains_prefixed_hex(&lower, "sha256:", 64)
}

fn contains_prefixed_hex(value: &str, prefix: &str, minimum_digits: usize) -> bool {
    value.match_indices(prefix).any(|(index, _)| {
        value[index + prefix.len()..]
            .bytes()
            .take_while(u8::is_ascii_hexdigit)
            .count()
            >= minimum_digits
    })
}

fn is_digest(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn absolute_path_like(value: &str) -> bool {
    let bytes = value.as_bytes();
    value.starts_with('/')
        || value.starts_with('\\')
        || value.to_ascii_lowercase().starts_with("file://")
        || (bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'/' | b'\\'))
}

fn is_machine_code(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().enumerate().all(|(index, byte)| match byte {
            b'a'..=b'z' | b'0'..=b'9' | b'.' | b'_' | b'-' => {
                index > 0 || byte.is_ascii_lowercase() || byte.is_ascii_digit()
            }
            _ => false,
        })
}

fn digest_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(unix)]
fn read_project_file_no_follow(project_root: &Path, relative: &str) -> Result<Vec<u8>, String> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    use std::os::unix::ffi::OsStrExt;

    let root = CString::new(project_root.as_os_str().as_bytes())
        .map_err(|_| "coding_pack_source_unsafe".to_string())?;
    let root_fd = unsafe {
        libc::open(
            root.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if root_fd < 0 {
        return Err("coding_pack_source_unsafe".into());
    }
    let root_fd = unsafe { OwnedFd::from_raw_fd(root_fd) };
    let components = relative.split('/').collect::<Vec<_>>();
    let mut parent: Option<OwnedFd> = None;
    for component in &components[..components.len() - 1] {
        let component =
            CString::new(*component).map_err(|_| "coding_pack_source_unsafe".to_string())?;
        let parent_fd = parent
            .as_ref()
            .map_or(root_fd.as_raw_fd(), AsRawFd::as_raw_fd);
        let fd = unsafe {
            libc::openat(
                parent_fd,
                component.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if fd < 0 {
            return Err(source_open_error());
        }
        parent = Some(unsafe { OwnedFd::from_raw_fd(fd) });
    }
    let final_component = CString::new(*components.last().unwrap_or(&""))
        .map_err(|_| "coding_pack_source_unsafe".to_string())?;
    let parent_fd = parent
        .as_ref()
        .map_or(root_fd.as_raw_fd(), AsRawFd::as_raw_fd);
    let fd = unsafe {
        libc::openat(
            parent_fd,
            final_component.as_ptr(),
            libc::O_RDONLY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if fd < 0 {
        return Err(source_open_error());
    }
    let file = File::from(unsafe { OwnedFd::from_raw_fd(fd) });
    let metadata = file
        .metadata()
        .map_err(|_| "coding_pack_source_unsafe".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES {
        return Err("coding_pack_source_unsafe".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "coding_pack_source_changed_before_export".to_string())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("coding_pack_source_changed_before_export".into());
    }
    Ok(bytes)
}

#[cfg(unix)]
fn source_open_error() -> String {
    match std::io::Error::last_os_error().kind() {
        std::io::ErrorKind::NotFound => "coding_pack_source_missing_before_export".into(),
        _ => "coding_pack_source_unsafe".into(),
    }
}

#[cfg(windows)]
fn read_project_file_no_follow(project_root: &Path, relative: &str) -> Result<Vec<u8>, String> {
    use std::os::windows::ffi::OsStrExt;
    use std::os::windows::io::{AsRawHandle, FromRawHandle, IntoRawHandle, OwnedHandle};
    use std::ptr::{null, null_mut};

    let mut root_path = project_root.as_os_str().encode_wide().collect::<Vec<_>>();
    root_path.push(0);
    let root = unsafe {
        CreateFileW(
            root_path.as_ptr(),
            FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            null(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
            null_mut(),
        )
    };
    if root == INVALID_HANDLE_VALUE || root.is_null() {
        return Err("coding_pack_source_unsafe".into());
    }
    let root = unsafe { OwnedHandle::from_raw_handle(root) };
    require_non_reparse_handle(root.as_raw_handle(), true)?;

    let components = relative.split('/').collect::<Vec<_>>();
    let mut parent: Option<OwnedHandle> = None;
    for (index, component) in components.iter().enumerate() {
        let final_component = index + 1 == components.len();
        let current_parent = parent
            .as_ref()
            .map_or(root.as_raw_handle(), AsRawHandle::as_raw_handle);
        let handle = nt_open_relative_component(current_parent, component, final_component)?;
        require_non_reparse_handle(handle.as_raw_handle(), !final_component)?;
        parent = Some(handle);
    }
    let handle = parent.ok_or_else(|| "coding_pack_source_unsafe".to_string())?;
    let mut file = unsafe { File::from_raw_handle(handle.into_raw_handle()) };
    let metadata = file
        .metadata()
        .map_err(|_| "coding_pack_source_unsafe".to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FILE_BYTES {
        return Err("coding_pack_source_unsafe".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "coding_pack_source_changed_before_export".to_string())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("coding_pack_source_changed_before_export".into());
    }
    Ok(bytes)
}

#[cfg(windows)]
fn require_non_reparse_handle(
    handle: *mut std::ffi::c_void,
    directory: bool,
) -> Result<(), String> {
    let mut info = FileAttributeTagInfo {
        file_attributes: 0,
        reparse_tag: 0,
    };
    let ok = unsafe {
        GetFileInformationByHandleEx(
            handle,
            9,
            &mut info as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<FileAttributeTagInfo>() as u32,
        )
    };
    if ok == 0
        || info.file_attributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || directory != (info.file_attributes & FILE_ATTRIBUTE_DIRECTORY != 0)
    {
        return Err("coding_pack_source_unsafe".into());
    }
    Ok(())
}

#[cfg(windows)]
fn nt_open_relative_component(
    parent: *mut std::ffi::c_void,
    component: &str,
    final_component: bool,
) -> Result<std::os::windows::io::OwnedHandle, String> {
    use std::os::windows::io::{FromRawHandle, OwnedHandle};
    use std::ptr::null_mut;
    let mut wide = component.encode_utf16().collect::<Vec<_>>();
    let mut name = UnicodeString {
        length: (wide.len() * 2) as u16,
        maximum_length: (wide.len() * 2) as u16,
        buffer: wide.as_mut_ptr(),
    };
    let mut attributes = ObjectAttributes {
        length: std::mem::size_of::<ObjectAttributes>() as u32,
        root_directory: parent,
        object_name: &mut name,
        attributes: 0x0000_0040,
        security_descriptor: null_mut(),
        security_quality_of_service: null_mut(),
    };
    let mut status_block = IoStatusBlock {
        status: 0,
        information: 0,
    };
    let mut handle = null_mut();
    let desired = if final_component {
        FILE_READ_DATA | FILE_READ_ATTRIBUTES | SYNCHRONIZE
    } else {
        FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | SYNCHRONIZE
    };
    let options = FILE_OPEN_REPARSE_POINT
        | FILE_SYNCHRONOUS_IO_NONALERT
        | if final_component {
            FILE_NON_DIRECTORY_FILE
        } else {
            FILE_DIRECTORY_FILE
        };
    let status = unsafe {
        NtCreateFile(
            &mut handle,
            desired,
            &mut attributes,
            &mut status_block,
            null_mut(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            FILE_OPEN,
            options,
            null_mut(),
            0,
        )
    };
    if status < 0 || handle.is_null() {
        return Err(
            if status == STATUS_OBJECT_NAME_NOT_FOUND || status == STATUS_OBJECT_PATH_NOT_FOUND {
                "coding_pack_source_missing_before_export".into()
            } else {
                "coding_pack_source_unsafe".into()
            },
        );
    }
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}

#[cfg(windows)]
#[repr(C)]
struct UnicodeString {
    length: u16,
    maximum_length: u16,
    buffer: *mut u16,
}

#[cfg(windows)]
#[repr(C)]
struct ObjectAttributes {
    length: u32,
    root_directory: *mut std::ffi::c_void,
    object_name: *mut UnicodeString,
    attributes: u32,
    security_descriptor: *mut std::ffi::c_void,
    security_quality_of_service: *mut std::ffi::c_void,
}

#[cfg(windows)]
#[repr(C)]
struct IoStatusBlock {
    status: i32,
    information: usize,
}

#[cfg(windows)]
#[repr(C)]
struct FileAttributeTagInfo {
    file_attributes: u32,
    reparse_tag: u32,
}

#[cfg(windows)]
const FILE_READ_DATA: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_LIST_DIRECTORY: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_READ_ATTRIBUTES: u32 = 0x0000_0080;
#[cfg(windows)]
const SYNCHRONIZE: u32 = 0x0010_0000;
#[cfg(windows)]
const FILE_SHARE_READ: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_SHARE_WRITE: u32 = 0x0000_0002;
#[cfg(windows)]
const FILE_SHARE_DELETE: u32 = 0x0000_0004;
#[cfg(windows)]
const OPEN_EXISTING: u32 = 3;
#[cfg(windows)]
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
#[cfg(windows)]
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
#[cfg(windows)]
const FILE_OPEN: u32 = 1;
#[cfg(windows)]
const FILE_DIRECTORY_FILE: u32 = 0x0000_0001;
#[cfg(windows)]
const FILE_NON_DIRECTORY_FILE: u32 = 0x0000_0040;
#[cfg(windows)]
const FILE_SYNCHRONOUS_IO_NONALERT: u32 = 0x0000_0020;
#[cfg(windows)]
const FILE_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
#[cfg(windows)]
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
#[cfg(windows)]
const FILE_ATTRIBUTE_DIRECTORY: u32 = 0x0000_0010;
#[cfg(windows)]
const STATUS_OBJECT_NAME_NOT_FOUND: i32 = 0xC000_0034_u32 as i32;
#[cfg(windows)]
const STATUS_OBJECT_PATH_NOT_FOUND: i32 = 0xC000_003A_u32 as i32;
#[cfg(windows)]
const INVALID_HANDLE_VALUE: *mut std::ffi::c_void = -1_isize as *mut std::ffi::c_void;

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(
        file_name: *const u16,
        desired_access: u32,
        share_mode: u32,
        security_attributes: *const std::ffi::c_void,
        creation_disposition: u32,
        flags_and_attributes: u32,
        template_file: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn GetFileInformationByHandleEx(
        file: *mut std::ffi::c_void,
        class: i32,
        information: *mut std::ffi::c_void,
        buffer_size: u32,
    ) -> i32;
    fn MoveFileExW(existing: *const u16, new: *const u16, flags: u32) -> i32;
}

#[cfg(windows)]
#[link(name = "ntdll")]
extern "system" {
    fn NtCreateFile(
        file_handle: *mut *mut std::ffi::c_void,
        desired_access: u32,
        object_attributes: *mut ObjectAttributes,
        io_status_block: *mut IoStatusBlock,
        allocation_size: *mut i64,
        file_attributes: u32,
        share_access: u32,
        create_disposition: u32,
        create_options: u32,
        ea_buffer: *mut std::ffi::c_void,
        ea_length: u32,
    ) -> i32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_portable_text_rejects_private_identity_material() {
        for value in [
            "projectBindingId",
            "project-0123456789abcdef",
            "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "destination_handle:opaque",
            "/Users/private/project",
            r"C:\Users\private\project",
            " untrimmed ",
        ] {
            assert_eq!(
                validate_text(value, 512, true).unwrap_err(),
                "coding_pack_manifest_mismatch"
            );
        }
        assert!(validate_text("build output", 512, true).is_ok());
    }
}
