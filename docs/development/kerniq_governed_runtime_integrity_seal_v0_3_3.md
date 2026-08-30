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

Third-party packages inside `node_modules/.pnpm` are **not** content-sealed;
their versions are pinned by the tracked `pnpm-lock.yaml` bound through the
audited HEAD. This boundary is deliberate and documented, not hidden.

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
