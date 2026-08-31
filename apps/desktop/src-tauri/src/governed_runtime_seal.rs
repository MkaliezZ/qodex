//! Governed runtime content seal: verifies that the executable bytes of the
//! governed DSH runtime match a manifest pinned inside KerniQ itself.
//!
//! Trust model: the expected manifest is compiled into the binary
//! (`include_str!`), never read from beside the runtime it verifies. Every
//! governed admission independently hashes the sealed closure — the DSH CLI
//! build artifacts, the loaded workspace package implementations, the
//! vendored Cordis framework, and the AgentFuse adapter / production
//! observer implementations installed in the active profile. A missing,
//! modified, unreadable, duplicated, or escaping entry fails closed.
//!
//! Bounded claim: this binds admission-time executable content to a
//! known-good provisioning snapshot; it is not tamper-proof against a
//! concurrent hostile local filesystem (documented in the v0.3.3 evidence).

use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path};

pub(crate) const MANIFEST_SCHEMA_VERSION: &str = "kerniq.governed-runtime-manifest.v0.1";
pub(crate) const MANIFEST_SOURCE_REVISION: &str = "cd5ef8148158c3a752a658978873241fdf8e2bbc";
pub(crate) const MANIFEST_RUNTIME_VERSION: &str = "0.1.2-alpha.1";

const PINNED_MANIFEST: &str = include_str!("../resources/dsh-runtime-seal-0.1.2-alpha.1.json");

#[derive(Deserialize)]
struct Manifest {
    schema_version: String,
    source_revision: String,
    runtime_version: String,
    runtime_seal_sha256: String,
    entries: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    root: String,
    path: String,
    size: u64,
    sha256: String,
}

/// Verifies the governed runtime closure against the pinned manifest (or, in
/// tests only, an injected one — hashing still runs the normal production
/// path). Returns false for any malformed, duplicated, escaping, missing,
/// unreadable, or content-mismatched state.
pub(crate) fn verify_runtime_seal(
    runtime_root: &Path,
    profile_root: Option<&Path>,
    user_cache_root: Option<&Path>,
) -> bool {
    verify_manifest(&expected_manifest(), runtime_root, profile_root, user_cache_root)
}

/// The seal check proper: parse-and-validate `manifest_text`, then hash every
/// sealed entry beneath its root. Split from `verify_runtime_seal` so tests
/// can drive the identical verification without the environment seam.
pub(crate) fn verify_manifest(
    manifest_text: &str,
    runtime_root: &Path,
    profile_root: Option<&Path>,
    user_cache_root: Option<&Path>,
) -> bool {
    let Some(manifest) = parse_and_validate_manifest(manifest_text) else {
        return false;
    };
    verify_manifest_against_roots(&manifest, runtime_root, profile_root, user_cache_root)
}

fn expected_manifest() -> String {
    #[cfg(test)]
    if let Ok(path) = std::env::var("KERNIQ_TEST_RUNTIME_SEAL_MANIFEST") {
        if !path.is_empty() {
            if let Ok(text) = fs::read_to_string(path) {
                return text;
            }
        }
    }
    PINNED_MANIFEST.to_string()
}

/// Parses the manifest and enforces its own integrity: pinned header fields,
/// well-formed digest strings, safe relative paths inside the two allowed
/// roots, no duplicates, and the self-consistent aggregate seal.
fn parse_and_validate_manifest(text: &str) -> Option<Manifest> {
    let manifest: Manifest = serde_json::from_str(text).ok()?;
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION
        || manifest.source_revision != MANIFEST_SOURCE_REVISION
        || manifest.runtime_version != MANIFEST_RUNTIME_VERSION
    {
        return None;
    }
    if !is_sha256(&manifest.runtime_seal_sha256) || manifest.entries.is_empty() {
        return None;
    }
    let mut seen = std::collections::BTreeSet::new();
    for entry in &manifest.entries {
        if !matches!(entry.root.as_str(), "runtime" | "profile" | "user-cache") {
            return None;
        }
        if !is_safe_relative_path(&entry.path) || !is_sha256(&entry.sha256) {
            return None;
        }
        if !seen.insert((entry.root.as_str(), entry.path.as_str())) {
            return None;
        }
    }
    // The aggregate seal must match the canonical serialization of the
    // entries themselves, so the pinned manifest cannot be internally
    // inconsistent.
    let canonical = canonical_manifest_bytes(
        &manifest
            .entries
            .iter()
            .map(|entry| (entry.root.as_str(), entry.path.as_str(), entry.size, entry.sha256.as_str()))
            .collect::<Vec<_>>(),
    );
    let recomputed = format!("{:x}", Sha256::digest(canonical.as_bytes()));
    if recomputed != manifest.runtime_seal_sha256 {
        return None;
    }
    Some(manifest)
}

fn verify_manifest_against_roots(
    manifest: &Manifest,
    runtime_root: &Path,
    profile_root: Option<&Path>,
    user_cache_root: Option<&Path>,
) -> bool {
    let mut sorted: Vec<&Entry> = manifest.entries.iter().collect();
    sorted.sort_by(|a, b| (&a.root, &a.path).cmp(&(&b.root, &b.path)));
    for entry in sorted {
        let base = match entry.root.as_str() {
            "runtime" => runtime_root,
            "profile" => match profile_root {
                Some(profile) => profile,
                None => return false,
            },
            // The native loader copies prebuilt `.node` add-ins from the
            // pnpm store into a per-user cache and executes the copy; the
            // executed bytes must be sealed too.
            "user-cache" => match user_cache_root {
                Some(cache) => cache,
                None => return false,
            },
            _ => return false,
        };
        let full = base.join(&entry.path);
        let Ok(bytes) = fs::read(&full) else {
            return false;
        };
        if bytes.len() as u64 != entry.size {
            return false;
        }
        let digest = format!("{:x}", Sha256::digest(&bytes));
        if digest != entry.sha256 {
            return false;
        }
    }
    true
}

/// Deterministic canonical manifest representation: entries sorted by
/// `(root, path)`, each encoded `root,path,size,sha256` with unit separators,
/// joined by record separators. The provisioning generator uses the same
/// algorithm when it derives the aggregate seal.
pub(crate) fn canonical_manifest_bytes(
    entries: &[(&str, &str, u64, &str)],
) -> String {
    let mut sorted = entries.to_vec();
    sorted.sort();
    sorted
        .iter()
        .map(|(root, path, size, sha256)| format!("{root}\u{1f}{path}\u{1f}{size}\u{1f}{sha256}"))
        .collect::<Vec<_>>()
        .join("\u{1e}")
}

fn is_safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains('\\')
        && !path.contains(':')
        && !path.split('/').any(|segment| segment.is_empty() || segment == "." || segment == "..")
        // Belt and braces: the joined path must also normalize without
        // escaping its base.
        && Path::new(path)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn user_native_cache_root_for_real_machine() -> Option<std::path::PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|local| {
        std::path::PathBuf::from(local)
            .join("node-addon-native-custom-loader")
            .join("native-cache")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_json(entries: &[(&str, &str, u64, &str)], seal: &str) -> String {
        serde_json::json!({
            "schema_version": MANIFEST_SCHEMA_VERSION,
            "source_repository": "deepseek-ai/deepseek-harness",
            "source_revision": MANIFEST_SOURCE_REVISION,
            "runtime_version": MANIFEST_RUNTIME_VERSION,
            "runtime_seal_sha256": seal,
            "entry_count": entries.len(),
            "entries": entries
                .iter()
                .map(|(root, path, size, sha256)| serde_json::json!({
                    "root": root, "path": path, "size": size, "sha256": sha256,
                }))
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    fn digest_of(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn parses_the_pinned_production_manifest() {
        let manifest = parse_and_validate_manifest(PINNED_MANIFEST)
            .expect("pinned manifest must be internally consistent");
        assert_eq!(manifest.entries.len(), 21175);
    }

    #[test]
    fn rejects_malformed_or_hostile_manifests() {
        let good_digest = digest_of(b"abc");
        let good = ("runtime", "apps/cli/lib/bin.js", 3u64, good_digest.as_str());
        let good_seal = digest_of(canonical_manifest_bytes(&[good]).as_bytes());
        for broken in [
            // absolute path, traversal, backslash, drive letter, empty
            ("runtime", "/abs/path.js"),
            ("runtime", "../escape.js"),
            ("runtime", "a\\b.js"),
            ("runtime", "C:/x.js"),
            ("runtime", ""),
            ("runtime", "a//b.js"),
        ] {
            let text = manifest_json(&[(broken.0, broken.1, 3, &digest_of(b"abc"))], &good_seal);
            assert!(parse_and_validate_manifest(&text).is_none(), "{}", broken.1);
        }
        // wrong root scope
        let text = manifest_json(&[("elsewhere", "x.js", 3, &digest_of(b"abc"))], &good_seal);
        assert!(parse_and_validate_manifest(&text).is_none());
        // invalid digest length
        let text = manifest_json(&[("runtime", "x.js", 3, "zz")], &good_seal);
        assert!(parse_and_validate_manifest(&text).is_none());
        // duplicate entry
        let text = manifest_json(&[good, good], &good_seal);
        assert!(parse_and_validate_manifest(&text).is_none());
        // aggregate seal mismatch
        let other = digest_of(b"other");
        let text = manifest_json(&[good], &other);
        assert!(parse_and_validate_manifest(&text).is_none());
        // wrong header pinning
        for field in ["schema_version", "source_revision", "runtime_version"] {
            let mut value =
                serde_json::from_str::<serde_json::Value>(&manifest_json(&[good], &good_seal))
                    .unwrap();
            value[field] = "wrong".into();
            assert!(parse_and_validate_manifest(&value.to_string()).is_none(), "{field}");
        }
    }

    #[test]
    fn verifies_and_rejects_content_at_the_roots() {
        let dir = std::env::temp_dir().join(format!(
            "kerniq-seal-verify-{:x}",
            Sha256::digest(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
                    .to_le_bytes()
            )
        ));
        let runtime = dir.join("runtime");
        let profile = dir.join("profile");
        std::fs::create_dir_all(runtime.join("apps/cli/lib")).unwrap();
        std::fs::create_dir_all(profile.join("node_modules/p")).unwrap();
        std::fs::write(runtime.join("apps/cli/lib/bin.js"), b"abc").unwrap();
        std::fs::write(profile.join("node_modules/p/index.js"), b"xyz").unwrap();

        let bin_digest = digest_of(b"abc");
        let plugin_digest = digest_of(b"xyz");
        let entries: [(&str, &str, u64, &str); 2] = [
            ("runtime", "apps/cli/lib/bin.js", 3, bin_digest.as_str()),
            ("profile", "node_modules/p/index.js", 3, plugin_digest.as_str()),
        ];
        let seal = digest_of(canonical_manifest_bytes(&entries).as_bytes());
        let manifest_text = manifest_json(&entries, &seal);

        assert!(verify_manifest(&manifest_text, &runtime, Some(&profile), None));
        // Modified content, missing file, and absent profile root all fail.
        std::fs::write(runtime.join("apps/cli/lib/bin.js"), b"abd").unwrap();
        assert!(!verify_manifest(&manifest_text, &runtime, Some(&profile), None));
        std::fs::write(runtime.join("apps/cli/lib/bin.js"), b"abc").unwrap();
        std::fs::remove_file(profile.join("node_modules/p/index.js")).unwrap();
        assert!(!verify_manifest(&manifest_text, &runtime, Some(&profile), None));
        std::fs::write(profile.join("node_modules/p/index.js"), b"xyz").unwrap();
        assert!(!verify_manifest(&manifest_text, &runtime, None, None));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Real-machine verification: the audited Windows runtime must match the
    /// pinned manifest byte for byte. Run with `cargo test -- --ignored`.
    #[test]
    #[ignore = "requires the real audited DSH runtime on this machine"]
    fn real_audited_runtime_matches_pinned_seal() {
        let started = std::time::Instant::now();
        let ok = verify_runtime_seal(
            std::path::Path::new("F:/DSH-Runtime"),
            Some(std::path::Path::new("F:/DSH-Home/profiles/headless")),
            user_native_cache_root_for_real_machine().as_deref(),
        );
        println!("real seal verification: {}ms", started.elapsed().as_millis());
        assert!(ok, "real audited runtime must match the pinned seal");
    }

    /// Real-machine negative probe on a throwaway copy: one tampered byte in
    /// the copied closure must fail the seal. The real runtime is untouched.
    #[test]
    #[ignore = "requires the real audited DSH runtime on this machine"]
    fn tampered_copy_of_real_closure_fails_the_seal() {
        let manifest = parse_and_validate_manifest(PINNED_MANIFEST).unwrap();
        let dir = std::env::temp_dir().join(format!(
            "kerniq-seal-copy-{:x}",
            Sha256::digest(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
                    .to_le_bytes()
            )
        ));
        let runtime = dir.join("runtime");
        let profile = dir.join("profile");
        let real_runtime = std::path::Path::new("F:/DSH-Runtime");
        let real_profile = std::path::Path::new("F:/DSH-Home/profiles/headless");
        for entry in &manifest.entries {
            let real_cache = user_native_cache_root_for_real_machine();
            let base: &std::path::Path = match entry.root.as_str() {
                "runtime" => real_runtime,
                "profile" => real_profile,
                _ => real_cache.as_deref().unwrap(),
            };
            let target_root: std::path::PathBuf = match entry.root.as_str() {
                "runtime" => runtime.clone(),
                "profile" => profile.clone(),
                _ => dir.join("user-cache"),
            };
            let source = base.join(&entry.path);
            let target = target_root.join(&entry.path);
            std::fs::create_dir_all(target.parent().unwrap()).unwrap();
            std::fs::copy(&source, &target).unwrap();
        }
        let tampered = runtime.join(
            "node_modules/.pnpm/js-yaml@4.2.0/node_modules/js-yaml/index.js",
        );
        let mut bytes = std::fs::read(&tampered).unwrap();
        bytes.extend_from_slice(b"// tampered\n");
        std::fs::write(&tampered, bytes).unwrap();
        assert!(!verify_runtime_seal(
            &runtime,
            Some(&profile),
            Some(dir.join("user-cache").as_path()),
        ));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
