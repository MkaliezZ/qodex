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
`20260718-cpython-3.12.13-agentfuse-8c6ae987`. This keeps executable material
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
- SHA-256 for every selected runtime archive
- DHMS AgentFuse source commit
  `8c6ae9875b3618a529d5150c96385da7461099c2`
- SHA-256 for the canonical source archive
- bridge protocol and evidence schema versions

Downloads use fixed HTTPS URLs from the embedded manifest. Model or provider
output cannot choose a URL, executable, package, path, or module. Archives are
hash-verified before extraction. Absolute paths, parent traversal, hardlinks,
special entries, and escaping or missing symlink targets are rejected. Safe
relative symlinks that resolve to regular files inside the verified archive are
materialized as ordinary files; promoted profiles contain no filesystem links.

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

Verification checks the trusted manifest digest, Python executable digest,
canonical AgentFuse module digest, bridge digest, expected layout, and,
when requested, the exact Python version. Removal is blocked while a bridge
request is active and removes only the selected managed profile. It does not
delete projects, session history, provider settings, system Python, or project
environments.

## Process Boundary

The native layer starts the fixed managed interpreter without a shell and with
fixed arguments. The environment is cleared and rebuilt from a narrow
platform-safe allowlist. Common credential variables are not forwarded.
`PYTHONNOUSERSITE=1` and `PYTHONDONTWRITEBYTECODE=1` are always set. The bridge
also starts with CPython's `-B` flag because `-E` intentionally ignores Python
environment variables. This keeps bridge imports from mutating the verified
runtime with bytecode caches.

Bridge stdin, stdout, stderr, individual messages, startup, and request duration
are bounded. Stdout is protocol-only NDJSON. Any timeout, malformed response,
identity mismatch, nonzero exit, stderr initialization output, or oversized
stream fails closed.

## Limitations

- Runtime provisioning currently supports macOS x86_64/arm64, Windows x86_64,
  and Linux x86_64/arm64 manifest selection.
- Real provisioning smoke is required per release platform; native compilation
  and fixture tests are not a substitute for a Windows provisioning smoke.
- The v0.6.0 bridge loads verified first-party source directly and intentionally
  has no third-party site-package lock entries.
- Signed installer delivery remains a later packaging milestone.
