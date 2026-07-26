# Managed Python Runtime

KerniQ v0.6.0 can install a private CPython runtime for bounded Python-backed
capabilities. Installation is always initiated by the user from Settings. The
desktop application does not invoke a system Python, install packages globally,
modify a project virtual environment, or provision the runtime at startup.

## Private Root

Tauri resolves its platform-specific application data directory. KerniQ stores
the runtime below:

```text
<app_data_dir>/runtime/python/<runtime-version>/<platform>-<architecture>/
```

The current runtime version is
`20260718-cpython-3.12.13-agentfuse-ec4b584`. This keeps executable material
separate from projects and from system Python. Existing KerniQ local data paths
and the compatibility bundle identifier remain unchanged.

The verified profile contains:

```text
distribution/       pinned CPython distribution
agentfuse-source/    pinned canonical DHMS AgentFuse source
bridge/              KerniQ's bounded NDJSON bridge
environment/         installed package lock evidence
manifest/            trusted and installed-runtime records
logs/                reserved private diagnostics directory
locks/               operation-local download staging
```

## Supply Chain

The trusted manifest is
`apps/desktop/src-tauri/resources/python-runtime-manifest.json`. It pins:

- Astral `python-build-standalone` release `20260718`
- CPython `3.12.13` archives for supported platform and architecture pairs
- archive and post-extraction installed-tree SHA-256 for every runtime artifact
- DHMS AgentFuse source commit
  `ec4b5842339dccfba0db62df7541920759203bc9`
- canonical AgentFuse 3.6.0 archive SHA-256
  `1659d81d39aab382d550c33c3b6a42b24254f584055eb15d8168f17200e323c3`
- canonical AgentFuse 3.6.0 installed-tree SHA-256
  `9a51121ec6a719bc7c79db428d522f3c4430d99d5f176b9e62a939bf004d32e9`
- embedded bridge installed-tree SHA-256
  `52bd2dfd5fdd7eb183ed30d4fad56666cd19363fcce381a94ef77b3ac4a4a8dc`
- bridge protocol and evidence schema versions

Downloads use fixed HTTPS URLs from the embedded manifest. Model or provider
output cannot choose a URL, executable, package, path, or module. Archives are
hash-verified before extraction. Absolute paths, parent traversal, hardlinks,
special entries, and escaping or missing symlink targets are rejected. Safe
relative symlinks that resolve to regular files inside the verified archive are
materialized as ordinary files; promoted profiles contain no filesystem links.

Trusted installed-tree digests are regenerated only as an explicit maintenance
operation:

```bash
cd apps/desktop/src-tauri
KERNIQ_REGENERATE_RUNTIME_DIGESTS=1 \
KERNIQ_RUNTIME_DIGEST_CACHE=/path/to/verified-archive-cache \
KERNIQ_RUNTIME_DIGEST_EXTRACT_ROOT=/path/to/case-sensitive-volume \
cargo test managed_python::tests::regenerate_trusted_installed_tree_digests \
  --no-default-features -- --ignored --nocapture
```

The command verifies every archive SHA-256, runs the production extraction and
symlink-materialization functions, and prints the resulting tree hashes.
Cross-platform generation on macOS uses a temporary case-sensitive volume
because Linux terminfo contains valid paths that differ only by letter case.

## Lifecycle

The Settings states are:

```text
NotInstalled -> Install runtime
Ready        -> Verify runtime, Run AgentFuse self-check, Remove runtime
Broken       -> Repair runtime, Remove runtime
```

Provisioning uses an exclusive profile lock, a private temporary directory,
verification before promotion, and rename-based replacement. Recovery removes
only stale temporary directories matching the selected platform profile. A
failed install does not become the active profile.

Verification recomputes the complete distribution, canonical AgentFuse source,
and bridge tree digests and compares them with the compile-time embedded
manifest. It also checks source package version, evidence schema, public
decision API availability, expected layout, and, when requested, the exact
Python version. `installed-runtime.json` retains operational timestamps and
observed digests only; it cannot bless a modified profile. Removal is blocked
while a bridge request is active and removes only the selected managed profile.
It does not delete projects, session history, provider settings, system Python,
or project environments.

## Process Boundary

The native layer starts the fixed managed interpreter without a shell and with
fixed arguments. The environment is cleared and rebuilt from a narrow
platform-safe allowlist. Common credential variables are not forwarded.
`PYTHONNOUSERSITE=1` and `PYTHONDONTWRITEBYTECODE=1` are always set. The bridge
also starts with CPython's `-B` flag because `-E` intentionally ignores Python
environment variables. This keeps bridge imports from mutating the verified
runtime with bytecode caches.

Bridge stdin, stdout, stderr, individual messages, and total process duration
are bounded. The one-shot hello/request/shutdown session has one enforced
15-second deadline; separate startup and request deadlines are not claimed.
Stdout is protocol-only NDJSON. Any timeout, malformed response, identity
mismatch, nonzero exit, stderr initialization output, or oversized stream fails
closed.

## Limitations

- Runtime provisioning currently supports macOS x86_64/arm64, Windows x86_64,
  and Linux x86_64/arm64 manifest selection.
- Real provisioning smoke is required per release platform; native compilation
  and fixture tests are not a substitute for a Windows provisioning smoke.
- The v0.6.0 bridge loads verified first-party source directly and intentionally
  has no third-party site-package lock entries.
- The app-private profile is integrity checked but is not an OS or malware
  sandbox.
- Signed installer delivery remains a later packaging milestone.
