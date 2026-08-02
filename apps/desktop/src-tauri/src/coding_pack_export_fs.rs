use sha2::{Digest, Sha256};
use std::fs::File;
use std::path::Path;

#[cfg(target_os = "macos")]
use std::collections::{BTreeMap, BTreeSet};
#[cfg(target_os = "macos")]
use std::ffi::{CStr, CString, OsString};
#[cfg(target_os = "macos")]
use std::io::{Error, ErrorKind, Write};
#[cfg(target_os = "macos")]
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
#[cfg(target_os = "macos")]
use std::os::unix::ffi::OsStringExt;
#[cfg(target_os = "macos")]
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
#[cfg(target_os = "macos")]
use std::path::PathBuf;

const STAGING_PREFIX: &str = ".kerniq-coding-pack-staging-";

#[derive(Debug)]
pub(crate) struct VerifiedDestinationRoot {
    pub binding_id: String,
    pub fingerprint: String,
    pub object_identity_digest: String,
    #[cfg(target_os = "macos")]
    handle: File,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeBundleWriteOutcome {
    PromotedAndSynced,
    PrePromotionFailure {
        phase_code: &'static str,
        reason_code: &'static str,
    },
    PromotedButDurabilityUncertain {
        reason_code: &'static str,
    },
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeExportFault {
    StagingCreate,
    ManifestWrite,
    SourceWrite,
    Flush,
    Promotion,
    DestinationSync,
    StagingRebind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum NativeExportFaultInternal {
    None,
    StagingCreate,
    ManifestWrite,
    SourceWrite,
    Flush,
    Promotion,
    DestinationSync,
    #[cfg(test)]
    StagingRebind,
}

#[cfg(test)]
impl From<NativeExportFault> for NativeExportFaultInternal {
    fn from(value: NativeExportFault) -> Self {
        match value {
            NativeExportFault::StagingCreate => Self::StagingCreate,
            NativeExportFault::ManifestWrite => Self::ManifestWrite,
            NativeExportFault::SourceWrite => Self::SourceWrite,
            NativeExportFault::Flush => Self::Flush,
            NativeExportFault::Promotion => Self::Promotion,
            NativeExportFault::DestinationSync => Self::DestinationSync,
            NativeExportFault::StagingRebind => Self::StagingRebind,
        }
    }
}

pub(crate) fn native_atomic_export_supported() -> bool {
    cfg!(target_os = "macos")
}

pub(crate) fn open_verified_destination_root(
    canonical_path: &Path,
    binding_id: &str,
    fingerprint: &str,
) -> Result<VerifiedDestinationRoot, String> {
    open_verified_destination_root_platform(canonical_path, binding_id, fingerprint)
}

#[cfg(target_os = "macos")]
fn open_verified_destination_root_platform(
    canonical_path: &Path,
    binding_id: &str,
    fingerprint: &str,
) -> Result<VerifiedDestinationRoot, String> {
    let handle = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW)
        .open(canonical_path)
        .map_err(|_| destination_unavailable())?;
    let identity = object_identity(&handle).map_err(|_| destination_unavailable())?;
    if identity.file_type != libc::S_IFDIR as u32 {
        return Err(destination_unavailable());
    }
    Ok(VerifiedDestinationRoot {
        binding_id: binding_id.into(),
        fingerprint: fingerprint.into(),
        object_identity_digest: identity.digest(),
        handle,
    })
}

#[cfg(not(target_os = "macos"))]
fn open_verified_destination_root_platform(
    _canonical_path: &Path,
    _binding_id: &str,
    _fingerprint: &str,
) -> Result<VerifiedDestinationRoot, String> {
    Err("coding_pack_native_atomic_export_unsupported".into())
}

impl VerifiedDestinationRoot {
    pub(crate) fn target_absent(&self, target_name: &str) -> Result<bool, String> {
        self.target_absent_platform(target_name)
    }

    pub(crate) fn write_atomic_bundle(
        &self,
        staging_name: &str,
        target_name: &str,
        manifest_bytes: &[u8],
        sources: &[(&str, &[u8])],
        fault: NativeExportFaultInternal,
    ) -> NativeBundleWriteOutcome {
        self.write_atomic_bundle_platform(staging_name, target_name, manifest_bytes, sources, fault)
    }

    #[cfg(target_os = "macos")]
    fn target_absent_platform(&self, target_name: &str) -> Result<bool, String> {
        let target = component_name(target_name).map_err(|_| destination_unavailable())?;
        match child_identity(self.handle.as_raw_fd(), &target) {
            Ok(_) => Ok(false),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(true),
            Err(_) => Err(destination_unavailable()),
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn target_absent_platform(&self, _target_name: &str) -> Result<bool, String> {
        Err("coding_pack_native_atomic_export_unsupported".into())
    }

    #[cfg(target_os = "macos")]
    fn write_atomic_bundle_platform(
        &self,
        staging_name: &str,
        target_name: &str,
        manifest_bytes: &[u8],
        sources: &[(&str, &[u8])],
        fault: NativeExportFaultInternal,
    ) -> NativeBundleWriteOutcome {
        let staging_component = match bound_staging_name(staging_name) {
            Ok(value) => value,
            Err(_) => return pre_promotion_failure("staging_create", "staging_identity_invalid"),
        };
        let target_component = match component_name(target_name) {
            Ok(value) => value,
            Err(_) => return pre_promotion_failure("promotion", "target_name_invalid"),
        };
        if fault == NativeExportFaultInternal::StagingCreate {
            return pre_promotion_failure("staging_create", "staging_create_failed");
        }
        if mkdir_at(self.handle.as_raw_fd(), &staging_component, 0o700).is_err() {
            return pre_promotion_failure("staging_create", "staging_create_failed");
        }
        let staging = match open_directory_at(self.handle.as_raw_fd(), &staging_component) {
            Ok(value) => value,
            Err(_) => return pre_promotion_failure("cleanup", "cleanup_failed"),
        };

        #[cfg(test)]
        if fault == NativeExportFaultInternal::StagingRebind
            && replace_staging_entry_for_test(self.handle.as_raw_fd(), staging_name).is_err()
        {
            return self.finish_pre_promotion_failure(
                &staging_component,
                &staging,
                "cleanup",
                "cleanup_failed",
            );
        }

        if fault == NativeExportFaultInternal::ManifestWrite
            || write_new_file_at(staging.file.as_raw_fd(), "manifest.json", manifest_bytes).is_err()
        {
            return self.finish_pre_promotion_failure(
                &staging_component,
                &staging,
                "manifest_write",
                "manifest_write_failed",
            );
        }

        let sources_root = match create_owned_directory(staging.file.as_raw_fd(), "sources") {
            Ok(value) => value,
            Err(_) => {
                return self.finish_pre_promotion_failure(
                    &staging_component,
                    &staging,
                    "source_write",
                    "source_directory_create_failed",
                )
            }
        };
        let directory_paths = source_directory_paths(sources);
        let mut directories = BTreeMap::<String, OwnedDirectory>::new();
        for directory in &directory_paths {
            let (parent, name) = split_parent(directory);
            let parent_fd = if parent.is_empty() {
                sources_root.file.as_raw_fd()
            } else {
                match directories.get(parent) {
                    Some(value) => value.file.as_raw_fd(),
                    None => {
                        return self.finish_pre_promotion_failure(
                            &staging_component,
                            &staging,
                            "source_write",
                            "source_directory_create_failed",
                        )
                    }
                }
            };
            match create_owned_directory(parent_fd, name) {
                Ok(value) => {
                    directories.insert(directory.clone(), value);
                }
                Err(_) => {
                    return self.finish_pre_promotion_failure(
                        &staging_component,
                        &staging,
                        "source_write",
                        "source_directory_create_failed",
                    )
                }
            }
        }

        for (index, (relative_path, bytes)) in sources.iter().enumerate() {
            if fault == NativeExportFaultInternal::SourceWrite && index == 0 {
                return self.finish_pre_promotion_failure(
                    &staging_component,
                    &staging,
                    "source_write",
                    "source_write_failed",
                );
            }
            let (parent, name) = split_parent(relative_path);
            let parent_fd = if parent.is_empty() {
                sources_root.file.as_raw_fd()
            } else {
                match directories.get(parent) {
                    Some(value) => value.file.as_raw_fd(),
                    None => {
                        return self.finish_pre_promotion_failure(
                            &staging_component,
                            &staging,
                            "source_write",
                            "source_write_failed",
                        )
                    }
                }
            };
            if write_new_file_at(parent_fd, name, bytes).is_err() {
                return self.finish_pre_promotion_failure(
                    &staging_component,
                    &staging,
                    "source_write",
                    "source_write_failed",
                );
            }
        }

        if fault == NativeExportFaultInternal::Flush
            || sync_staging_tree(&directories, &sources_root, &staging).is_err()
        {
            return self.finish_pre_promotion_failure(
                &staging_component,
                &staging,
                "flush",
                "directory_sync_failed",
            );
        }

        if fault == NativeExportFaultInternal::Promotion
            || promote_no_replace_at(
                self.handle.as_raw_fd(),
                &staging_component,
                &staging.identity,
                &target_component,
            )
            .is_err()
        {
            return self.finish_pre_promotion_failure(
                &staging_component,
                &staging,
                "promotion",
                "atomic_promotion_failed",
            );
        }

        if fault == NativeExportFaultInternal::DestinationSync || self.handle.sync_all().is_err() {
            return NativeBundleWriteOutcome::PromotedButDurabilityUncertain {
                reason_code: "post_promotion_durability_uncertain",
            };
        }
        NativeBundleWriteOutcome::PromotedAndSynced
    }

    #[cfg(not(target_os = "macos"))]
    fn write_atomic_bundle_platform(
        &self,
        _staging_name: &str,
        _target_name: &str,
        _manifest_bytes: &[u8],
        _sources: &[(&str, &[u8])],
        _fault: NativeExportFaultInternal,
    ) -> NativeBundleWriteOutcome {
        pre_promotion_failure("staging_create", "native_atomic_export_unsupported")
    }

    #[cfg(target_os = "macos")]
    fn finish_pre_promotion_failure(
        &self,
        staging_name: &CStr,
        staging: &OwnedDirectory,
        phase_code: &'static str,
        reason_code: &'static str,
    ) -> NativeBundleWriteOutcome {
        if cleanup_owned_staging(self.handle.as_raw_fd(), staging_name, staging).is_err() {
            pre_promotion_failure("cleanup", "cleanup_failed")
        } else {
            pre_promotion_failure(phase_code, reason_code)
        }
    }
}

fn pre_promotion_failure(
    phase_code: &'static str,
    reason_code: &'static str,
) -> NativeBundleWriteOutcome {
    NativeBundleWriteOutcome::PrePromotionFailure {
        phase_code,
        reason_code,
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, PartialEq, Eq)]
struct ObjectIdentity {
    device: u64,
    inode: u64,
    file_type: u32,
}

#[cfg(target_os = "macos")]
impl ObjectIdentity {
    fn digest(&self) -> String {
        let canonical = format!(
            "kerniq.native-directory-object.v1\0device={}\0inode={}\0file-type={}",
            self.device, self.inode, self.file_type
        );
        let mut hasher = Sha256::new();
        hasher.update(canonical.as_bytes());
        format!("sha256:{:x}", hasher.finalize())
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug)]
struct OwnedDirectory {
    file: File,
    identity: ObjectIdentity,
}

#[cfg(target_os = "macos")]
fn object_identity(file: &File) -> std::io::Result<ObjectIdentity> {
    let metadata = file.metadata()?;
    Ok(ObjectIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
        file_type: metadata.mode() & u32::from(libc::S_IFMT),
    })
}

#[cfg(target_os = "macos")]
fn child_identity(parent_fd: RawFd, name: &CStr) -> std::io::Result<ObjectIdentity> {
    let mut stat = std::mem::MaybeUninit::<libc::stat>::zeroed();
    let result = unsafe {
        libc::fstatat(
            parent_fd,
            name.as_ptr(),
            stat.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    };
    if result != 0 {
        return Err(Error::last_os_error());
    }
    let stat = unsafe { stat.assume_init() };
    Ok(ObjectIdentity {
        device: stat.st_dev as u64,
        inode: stat.st_ino as u64,
        file_type: u32::from(stat.st_mode & libc::S_IFMT),
    })
}

#[cfg(target_os = "macos")]
fn bound_staging_name(name: &str) -> std::io::Result<CString> {
    if name.len() != STAGING_PREFIX.len() + 32
        || !name.starts_with(STAGING_PREFIX)
        || !name[STAGING_PREFIX.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(Error::new(ErrorKind::InvalidInput, "invalid staging name"));
    }
    component_name(name)
}

#[cfg(target_os = "macos")]
fn component_name(name: &str) -> std::io::Result<CString> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') {
        return Err(Error::new(
            ErrorKind::InvalidInput,
            "invalid path component",
        ));
    }
    CString::new(name).map_err(|_| Error::new(ErrorKind::InvalidInput, "invalid path component"))
}

#[cfg(target_os = "macos")]
fn mkdir_at(parent_fd: RawFd, name: &CStr, mode: libc::mode_t) -> std::io::Result<()> {
    let result = unsafe { libc::mkdirat(parent_fd, name.as_ptr(), mode) };
    if result == 0 {
        Ok(())
    } else {
        Err(Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn open_directory_at(parent_fd: RawFd, name: &CStr) -> std::io::Result<OwnedDirectory> {
    let fd = unsafe {
        libc::openat(
            parent_fd,
            name.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if fd < 0 {
        return Err(Error::last_os_error());
    }
    let file = unsafe { File::from_raw_fd(fd) };
    let identity = object_identity(&file)?;
    if identity.file_type != libc::S_IFDIR as u32 {
        return Err(Error::new(ErrorKind::InvalidData, "not a directory"));
    }
    Ok(OwnedDirectory { file, identity })
}

#[cfg(target_os = "macos")]
fn create_owned_directory(parent_fd: RawFd, name: &str) -> std::io::Result<OwnedDirectory> {
    let name = component_name(name)?;
    mkdir_at(parent_fd, &name, 0o700)?;
    open_directory_at(parent_fd, &name)
}

#[cfg(target_os = "macos")]
fn write_new_file_at(parent_fd: RawFd, name: &str, bytes: &[u8]) -> std::io::Result<()> {
    let name = component_name(name)?;
    let fd = unsafe {
        libc::openat(
            parent_fd,
            name.as_ptr(),
            libc::O_WRONLY | libc::O_CREAT | libc::O_EXCL | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            0o600,
        )
    };
    if fd < 0 {
        return Err(Error::last_os_error());
    }
    let mut file = unsafe { File::from_raw_fd(fd) };
    file.write_all(bytes)?;
    file.flush()?;
    file.sync_all()
}

#[cfg(target_os = "macos")]
fn source_directory_paths(sources: &[(&str, &[u8])]) -> BTreeSet<String> {
    let mut directories = BTreeSet::new();
    for (relative_path, _) in sources {
        let path = Path::new(relative_path);
        let mut current = PathBuf::new();
        if let Some(parent) = path.parent() {
            for component in parent.components() {
                current.push(component.as_os_str());
                directories.insert(current.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    directories
}

fn split_parent(path: &str) -> (&str, &str) {
    path.rsplit_once('/').unwrap_or(("", path))
}

#[cfg(target_os = "macos")]
fn sync_staging_tree(
    directories: &BTreeMap<String, OwnedDirectory>,
    sources_root: &OwnedDirectory,
    staging: &OwnedDirectory,
) -> std::io::Result<()> {
    for directory in directories.values().rev() {
        directory.file.sync_all()?;
    }
    sources_root.file.sync_all()?;
    staging.file.sync_all()
}

#[cfg(target_os = "macos")]
fn promote_no_replace_at(
    destination_fd: RawFd,
    staging_name: &CStr,
    staging_identity: &ObjectIdentity,
    target_name: &CStr,
) -> std::io::Result<()> {
    if &child_identity(destination_fd, staging_name)? != staging_identity {
        return Err(Error::new(
            ErrorKind::PermissionDenied,
            "staging identity changed",
        ));
    }
    let result = unsafe {
        libc::renameatx_np(
            destination_fd,
            staging_name.as_ptr(),
            destination_fd,
            target_name.as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn cleanup_owned_staging(
    destination_fd: RawFd,
    staging_name: &CStr,
    staging: &OwnedDirectory,
) -> std::io::Result<()> {
    if child_identity(destination_fd, staging_name)? != staging.identity {
        return Err(Error::new(
            ErrorKind::PermissionDenied,
            "staging identity changed",
        ));
    }
    remove_directory_contents(staging.file.as_raw_fd())?;
    if child_identity(destination_fd, staging_name)? != staging.identity {
        return Err(Error::new(
            ErrorKind::PermissionDenied,
            "staging identity changed",
        ));
    }
    let result =
        unsafe { libc::unlinkat(destination_fd, staging_name.as_ptr(), libc::AT_REMOVEDIR) };
    if result == 0 {
        Ok(())
    } else {
        Err(Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn remove_directory_contents(directory_fd: RawFd) -> std::io::Result<()> {
    for name in list_directory_entries(directory_fd)? {
        let identity = child_identity(directory_fd, &name)?;
        if identity.file_type == libc::S_IFDIR as u32 {
            let child = open_directory_at(directory_fd, &name)?;
            if child.identity != identity {
                return Err(Error::new(
                    ErrorKind::PermissionDenied,
                    "child identity changed",
                ));
            }
            remove_directory_contents(child.file.as_raw_fd())?;
            if child_identity(directory_fd, &name)? != child.identity {
                return Err(Error::new(
                    ErrorKind::PermissionDenied,
                    "child identity changed",
                ));
            }
            let result = unsafe { libc::unlinkat(directory_fd, name.as_ptr(), libc::AT_REMOVEDIR) };
            if result != 0 {
                return Err(Error::last_os_error());
            }
        } else {
            let result = unsafe { libc::unlinkat(directory_fd, name.as_ptr(), 0) };
            if result != 0 {
                return Err(Error::last_os_error());
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn list_directory_entries(directory_fd: RawFd) -> std::io::Result<Vec<CString>> {
    let duplicate = unsafe { libc::fcntl(directory_fd, libc::F_DUPFD_CLOEXEC, 0) };
    if duplicate < 0 {
        return Err(Error::last_os_error());
    }
    let directory = unsafe { libc::fdopendir(duplicate) };
    if directory.is_null() {
        unsafe {
            libc::close(duplicate);
        }
        return Err(Error::last_os_error());
    }
    let mut entries = Vec::new();
    loop {
        let entry = unsafe { libc::readdir(directory) };
        if entry.is_null() {
            break;
        }
        let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
        if name.to_bytes() != b"." && name.to_bytes() != b".." {
            let owned = OsString::from_vec(name.to_bytes().to_vec());
            let bytes = owned.into_vec();
            entries.push(
                CString::new(bytes)
                    .map_err(|_| Error::new(ErrorKind::InvalidData, "invalid directory entry"))?,
            );
        }
    }
    let close_result = unsafe { libc::closedir(directory) };
    if close_result != 0 {
        return Err(Error::last_os_error());
    }
    Ok(entries)
}

#[cfg(all(test, target_os = "macos"))]
fn replace_staging_entry_for_test(
    destination_fd: RawFd,
    staging_name: &str,
) -> std::io::Result<()> {
    let staging = component_name(staging_name)?;
    let moved = component_name(&format!("{staging_name}-moved"))?;
    let replacement = component_name(&format!("{staging_name}-replacement"))?;
    if unsafe {
        libc::renameat(
            destination_fd,
            staging.as_ptr(),
            destination_fd,
            moved.as_ptr(),
        )
    } != 0
    {
        return Err(Error::last_os_error());
    }
    mkdir_at(destination_fd, &replacement, 0o700)?;
    if unsafe { libc::symlinkat(replacement.as_ptr(), destination_fd, staging.as_ptr()) } != 0 {
        return Err(Error::last_os_error());
    }
    Ok(())
}

fn destination_unavailable() -> String {
    "coding_pack_destination_unavailable".into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_support_never_enables_a_path_fallback() {
        assert_eq!(native_atomic_export_supported(), cfg!(target_os = "macos"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn opened_directory_identity_is_handle_derived_and_stable() {
        let root = std::env::temp_dir().join(format!("kerniq-native-root-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir(&root).unwrap();
        let opened =
            open_verified_destination_root(&root, "destination-test", "sha256:test").unwrap();
        assert_eq!(opened.binding_id, "destination-test");
        assert_eq!(opened.fingerprint, "sha256:test");
        assert!(opened.object_identity_digest.starts_with("sha256:"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
