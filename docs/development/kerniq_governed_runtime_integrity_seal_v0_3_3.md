# KerniQ v0.3.3 — Governed Runtime Integrity Seal

## Scope

Two independently confirmed P1 runtime-identity defects remained after
v0.3.2.3:

```text
P1-A  RUNTIME_ROOT was not required to equal the audited Git top-level.
      `git rev-parse HEAD` resolves through parent directories, so a runtime
      root pointed at a subdirectory of an audited checkout borrowed the
      parent's audited revision while deriving its own (attacker-controlled)
      entrypoint.

P1-B  Git HEAD + a self-reported --version did not prove the executed bytes
      match the audited runtime. apps/cli's `lib/` build artifact is
      gitignored (`bin: lib/bin.js`), and workspace packages resolve through
      pnpm links; HEAD pins sources, not the executable closure.
```

Both were reproduced before fixing: P1-A with a fixture where
`git -C attacker-subdir rev-parse HEAD` returns the parent's commit while
the derived entrypoint lives under the attacker subdirectory; P1-B is the
v0.3.2.3 baseline itself — its green positive tests drove arbitrary stub
content that merely reported the audited version and revision.

## Runtime topology (audited Windows installation)

```text
F:\DSH-Runtime                     git checkout at cd5ef81 (top-level repo)
├── apps/cli/lib/bin.js            CLI entrypoint, tsdown build artifact (ignored)
├── packages/*/*/lib/              workspace package build artifacts (ignored)
├── vendor/cordis, vendor/*        vendored Cordis framework (in-repo, symlinked
│                                  into node_modules by pnpm)
└── node_modules/.pnpm             third-party dependencies (store)

F:\DSH-Home\profiles\headless
└── node_modules/
    ├── @dhms-agentfuse/dsh-agentfuse + core   (real files, npm 0.2.1)
    └── @kerniq/dsh-control-plane-observer      (real files, local 0.3.1)
```

The headless profile's composed `--dump-config` lists 87 loaded
`@deepseek-ai/*` packages; each maps to a `packages/*/*/` or `vendor/*`
implementation directory. The governed closure chosen for sealing is the
actual loaded set — the CLI entrypoint directory, every loaded package's
`lib/` output plus its `package.json`, the vendored framework packages, and
the two governance plugin implementations installed in the profile:

```text
2012 files, ~14.5 MB, verified with SHA-256 on every governed admission
```

> **SUPERSEDED BY v0.3.3.1** — the paragraph below describes the initial
> v0.3.3 state (`a5431ea`, 2012 entries) and is retained as history only;
> the third-party closure is sealed since v0.3.3.1, and v0.3.3.2 adds
> resolution-topology and executable-composition identity on top.

Third-party packages inside `node_modules/.pnpm` are **not** content-sealed;
their versions are pinned by the tracked `pnpm-lock.yaml` bound through the
audited HEAD. This boundary is deliberate and documented, not hidden.

## v0.3.3.1 correction — the boundary above was a P1, not an acceptable bound

The initial v0.3.3 implementation (`a5431ea`) reported
`FINAL_STATUS=V0_3_3_RUNTIME_INTEGRITY_SEAL_COMPLETE` while simultaneously
reporting `EXTERNAL_RUNTIME_PATHS_FOUND=true` and
`UNSEALED_EXECUTED_CODE_FOUND=true`. That completion status was premature:
an audited source revision proves expected dependency provenance, not the
local executable bytes actually loaded. Reproduced concretely — with the
governed-critical `js-yaml` (imported by `dsh-app-boot`, which parses
profiles, patches, and `!!js` handling) appending one comment line on the
real runtime, the `a5431ea` verifier still returned
`runtime_seal_valid=true`.

### Evidence-driven closure discovery

The corrected closure is derived from actual resolution, not a hand-written
allowlist:

```text
1. pnpm symlink-graph walk from the CLI and the 87 loaded workspace
   packages → 20 reachable store packages (0 escapes, 0 broken links)
2. runtime load trace (Node module hooks over both --dump-config and one
   real governed run) → 28 additional store packages actually loaded,
   including optional/platform packages the static walk missed
   (sharp, koffi, domino, …)
3. union: 42 third-party store packages, every package sealed whole
4. 41 trusted workspace links additionally sealed by LOGICAL path identity:
   each link path records the bytes it currently resolves to, so
   substituting a link target (leaving the store entity intact) breaks
   the seal through the logical-path entries — this also binds packages
   reachable only through links (e.g. the vendored Cordis core)
5. profile root: every real installed package (adapter, core, observer,
   cosmokit, schemastery, @standard-schema/spec) — the profile layout has
   no links
6. user-cache root (NEW bounded manifest root): node-addon-native-custom-
   loader copies the prebuilt .node add-in to
   %LOCALAPPDATA%/node-addon-native-custom-loader/native-cache and
   executes the COPY; the executed cache bytes are sealed (paths are
   relative to the cache root, so no user name enters the manifest)
```

Runtime-load tracing showed **0 loaded-but-unsealed files** against the
final closure (after dropping tracer artifacts resolved against the shell
working directory). Native dependencies found and sealed: node-pty
(conpty.dll, OpenConsole.exe, per-platform `.node` prebuilds),
node-addon-require-builtin (win32 `.node` + its user-cache copy), sharp,
koffi. `resolve.exports` (nominated in review) is not part of the actual
resolved closure on this runtime and is therefore not sealed — reported
truthfully rather than assumed.

### Updated seal

```text
manifest entries: 21175 (runtime 21106 / profile 67 / user-cache 2)
sealed bytes:    ~204 MB (double-covering linked packages by entity and
                  logical path on purpose)
verification:    ~2.4 s full SHA-256 pass in a release build per governed
                  admission; no caching added (correctness first)
aggregate seal:  6df40d7f9e3741fcdf5c9a834c81c316341dfeb87c135a3444b7d59880de3c87
```

Manifest schema stays `v0.1`; the `user-cache` root class is a bounded
addition with unchanged entry semantics.

### Causal regressions added

```text
third_party_dependency_tampering_refuses_admission
  js-yaml store entity modified       → seal false, process never starts
  commander store entity modified     → seal false, process never starts
  third-party file missing            → seal false
  workspace link target substituted   → store entity untouched, decoy bytes
                                        resolve through the logical path →
                                        seal false (fixture junction is
                                        verified to read the decoy bytes
                                        before asserting)
```

The fixture also fixed a test-isolation defect this work exposed:
`temporary_token` is a constant hash, so admission fixtures share one temp
directory across runs; a failed run previously leaked its tampered
junction into the next run. Fixtures now wipe their directory before
provisioning.

### Real Windows validation (v0.3.3.1)

```text
real_audited_runtime_matches_pinned_seal   PASS (~2.4 s release)
tampered_copy_of_real_closure_fails_the_seal PASS
    (throwaway copy of all 21175 entries, one tampered byte in the real
     js-yaml store implementation; the real runtime untouched)
real positive governed run                 PASS (allow → dispatch → result,
     preserved toolCallId call_00_tcsugtetFrFptqYKFD7S7313)
```

### Corrected claim

KerniQ independently verifies the bounded governed DSH runtime closure,
including first-party DSH build outputs, governance plugins, and the
actual resolved third-party runtime dependencies (including executed
native add-in copies) covered by the supported audited Windows runtime
manifest. This is still not supply-chain security, tamper-proofing, or
hostile-admin resistance; concurrent hostile local-FS mutation after
hashing remains a documented local TOCTOU boundary.

## Fix

### Git top-level binding (P1-A)

`dsh_runtime_root_is_git_toplevel` resolves `git rev-parse --show-toplevel`
for the runtime root and requires `canonicalize(runtime_root) ==
canonicalize(toplevel)` (canonical forms normalize junctions, drive-letter
casing, and `\\?\` prefixes; resolution failure fails closed). Subdirectory
roots, roots outside a repo, and unresolvable identities all yield
`compatible_runtime=false`.

### Governed runtime seal (P1-B)

`governed_runtime_seal.rs` embeds the expected manifest as an
`include_str!` resource compiled into KerniQ
(`resources/dsh-runtime-seal-0.1.2-alpha.1.json`) — the trust anchor never
lives beside the runtime it verifies. The manifest is version-specific
(schema `kerniq.governed-runtime-manifest.v0.1`, pinned to source revision
`cd5ef814…` and runtime version `0.1.2-alpha.1`) with 2012 entries of
`root (runtime|profile) / relative path / size / sha256`, sorted, plus an
aggregate `runtime_seal_sha256` over the canonical entry serialization
(unit-separator fields, record-separator joins) that the verifier recomputes
to reject internally inconsistent manifests.

Verification parses and validates first — pinned headers, 64-hex digests,
duplicate/absolute/traversal/backslash/drive-letter paths rejected, only
`runtime`/`profile` roots allowed — then independently hashes every sealed
file beneath the approved roots. Any missing, unreadable, size-mismatched,
or digest-mismatched entry fails closed into `compatible_runtime`, which the
existing six-gate governed admission already requires.

Trust establishment (provisioning the manifest from the known-good runtime)
is a one-time reviewed generation step; governed admission only ever
verifies. Tests regenerate fixture manifests through the same production
hashing path (`KERNIQ_TEST_RUNTIME_SEAL_MANIFEST` injects the *expected*
manifest only — hashing is never skipped).

## Causal regressions

```text
subdirectory_runtime_root_cannot_borrow_the_parent_revision
  positive: top-level root admitted, stub agent starts
  negative: attacker subdirectory with its own bin.js — attacker's dump
            self-reports enabled plugins (soft gates stay green!), but
            compatible_runtime=false and the process never starts

modified_sealed_runtime_content_refuses_admission
  positive: sealed closure as provisioned admitted, agent starts
  negative: same HEAD, version, profile, patch — one tampered byte in
            { CLI bin.js, dsh-session lib, dsh-llm-deepseek lib,
              AgentFuse adapter implementation, observer implementation }
            each refuses admission with no process start
  missing sealed file → refuses
  absent fixture manifest seam → pinned production manifest does not
            describe the closure → refuses

governed_runtime_seal unit regressions
  pinned manifest parses; hostile manifests (absolute/traversal/backslash/
  drive-letter/empty/double-slash paths, foreign root, bad digest format,
  duplicates, aggregate mismatch, wrong header pins) all rejected
  verify/reject at real filesystem roots; absent profile root fails
```

## Real Windows validation

```text
cargo test -- --ignored
  real_audited_runtime_matches_pinned_seal   PASS
      (F:\DSH-Runtime + F:\DSH-Home closure matches the pinned manifest
       byte for byte, 2012 entries)
  tampered_copy_of_real_closure_fails_the_seal PASS
      (a throwaway copy of the real closure with one tampered byte in
       bin.js fails the seal; the real runtime is untouched)

real positive governed run (real DeepSeek request through the sealed
runtime): allow pre-execute → dispatch → result with one preserved
toolCallId (call_00_IOTIDSNxiOuWmdEjfxuo9024).
```

## Known P2 (unchanged, documented)

The product-patch content TOCTOU between admission dump and process spawn
remains: same patch path, mutable contents, millisecond window within one
process. Sealing it needs an immutable patch snapshot at the DSH launch API;
left documented rather than expanded (per review guidance).

## Bounded claim

KerniQ independently verifies the governed runtime bundle against a pinned
content manifest before governed admission. This is not a claim of
tamper-proofing, supply-chain security, or an immutable runtime: an attacker
who can rewrite files concurrently during verification remains a documented
local-TOCTOU limitation, and third-party `.pnpm` store contents are pinned
by lockfile rather than content-sealed.

## Not changed

AgentFuse protocol, DSH source, production observer behavior, evidence
semantics, the six-gate composition, `EffectiveDshInvocation` shared
configuration arguments (all v0.3.2.x regressions remain green), and the
test-only revision seam. No v0.4 work.

## v0.3.3.2 — Governed Resolution & Composition Closure

Codex review confirmed two remaining P1 gaps after v0.3.3.1:

```text
P1-A  Node module-resolution precedence: a closer, unlisted
      node_modules location (e.g. apps/cli/lib/node_modules/commander)
      could select different executable bytes while every one of the
      21175 sealed entries stayed byte-identical.

P1-B  Open executable composition: governed_profile_valid only required
      AgentFuse + observer; any additional enabled executable plugin
      (via base profile, profile/home patches, or --patch) was accepted.
```

Both were reproduced against the 0291922 semantics with a controlled
fixture (real runtime untouched): adding the closer commander directory
kept the pure entry-hash seal green, and a dump carrying an extra
`@evil/exfiltrate` plugin kept governed_profile_valid true.

### Resolution topology seal

The pinned manifest now carries `closed_resolution_directories`
(340 records: 88 `absent`, 252 `exact`) derived from the actual resolution
topology: closer layers inside build outputs must not exist; every trusted
`node_modules` layer (repo top-level + scopes, workspace packages, `.pnpm`
store packages, the profile tree, DSH's hoisted `profiles/node_modules`
layer and its scopes) must have exactly the pinned direct membership
(case-insensitive comparison for Windows; unexpected entries of any type
reject; membership binds names, the file seal still binds bytes). Paths
obey the same safety rules as entries; duplicate directories or
case-ambiguous members are malformed; an empty topology section is a
malformed trust document.

### Approved executable composition

The manifest also pins `approved_executable_plugins`: the 90 exact plugin
identities the known-good effective `--profile headless` dump carries
(including sub-path export forms such as `dsh-headless/startup`). At
admission, `effective_executable_composition_is_approved` reads the same
effective dump admission and execution share and requires every plugin
record to resolve to exactly one approved identity — extra identities via
base profile or product `--patch` inserts make `governed_profile_valid`
false, and identity ambiguity fails closed. AgentFuse and the production
observer remain mandatory on top of this allowlist. Each approved identity
is generation-time coupled to sealed implementation bytes (adapter and
observer in the profile seal; DSH plugins in the runtime seal), so an
approved name never implies trust for unsealed content.

### Environment corrections (P2 and probe hardening)

`configure_agent_environment` now passes `LOCALAPPDATA` to the governed
DSH child, so the child resolves the same native-addon cache root KerniQ
verified. Separately, the admission probes' node invocations
(`--version`, `--dump-config`) now run through the same hardened
allowlisted environment, closing a gap where parent-side `NODE_OPTIONS`
could alter probe observations; `NODE_OPTIONS`/`NODE_PATH` remain absent
from the governed child (regression-tested through the stub's recorded
child environment).

### Causal regressions

```text
closer_resolution_locations_refuse_admission
  commander dropped at apps/cli/lib/node_modules  → compatible=false, no start
  second location (dsh-session lib/node_modules) → compatible=false (generic)
unapproved_executable_plugin_refuses_admission
  extra plugin in base profile layer             → governed_profile_valid=false
  same identity via product --patch insert       → governed_profile_valid=false
governed_child_environment_is_pinned
  child LOCALAPPDATA == verified root; NODE_OPTIONS/NODE_PATH empty
rejects_malformed_topology_metadata (absent/exact metadata hostile forms)
```

### Real Windows validation

```text
real_audited_runtime_matches_pinned_seal  PASS  (entries + 340 topology
  records + composition over the real runtime)
tampered_copy_of_real_closure_fails_the_seal PASS
real dump + temporary insert-patch carrying @evil/exfiltrate
  → composition identifies the unknown identity (classified invalid)
clean real dump → composition valid (90/90 identities)
real positive governed run → allow/dispatch/result with preserved
  toolCallId (call_00_Upj63pwfU9lenwNBRDq65783)
```

Bounded claim (v0.3.3.2): for the supported audited Windows DSH runtime,
KerniQ verifies expected runtime bytes, expected Node resolution topology,
and the approved governed executable-plugin composition before governed
process start. Patch-content and runtime-filesystem TOCTOU remain accepted
P2 timing boundaries; no supply-chain/hostile-admin claims.
