# KerniQ v0.7 Coding Pack Product Integration Planning

**Date:** 2026-07-29
**Status:** Planning-only Draft PR; implementation not started
**Planning base:** `0486704d613ea203672d75bee455346cceafb225`
**v0.6.1 freeze activation merge:** `0486704d613ea203672d75bee455346cceafb225`
**v0.6.1 freeze activation post-merge CI:** `30432376199`

## Executive Summary

KerniQ does not currently implement a Coding Pack. The only direct product
reference is the v0.7 roadmap heading. The repository does contain useful
foundations: authorized project opening, bounded relative-path reads, file-tree
selection, a lightweight index, deterministic context assembly, project
binding, a universal action contract, and a durable Session ledger. None of
those foundations currently creates, previews, identifies, persists, refreshes,
or exports a Coding Pack.

```text
CURRENT_CODING_PACK_STATE=PLANNED_ONLY
V0_7_PLANNING_BASE_MAIN=0486704d613ea203672d75bee455346cceafb225
```

The proposed product is a user-created, deterministic, inspectable repository
artifact. It packages an explicitly bounded set of project-relative UTF-8
source files plus a canonical manifest. The manifest, not an AI summary, is the
authoritative record of what was inspected and exported. Preview generation is
read-only. Writing or exporting requires explicit authorization and a durable,
recoverable operation boundary.

This plan does not implement that product, change Session schema, alter the
frozen Project Command path, or route content quality decisions through
AgentFuse.

## Current-State Source Audit

### Direct Coding Pack Search

The exact repository search:

```text
rg -n \
  "Coding Pack|coding pack|coding-pack|CodingPack|context pack|context-pack|pack manifest|repo context" \
  apps packages docs qodex-config tests
```

found only the roadmap entry in
`docs/development/PRODUCT_ROADMAP.md`. There is no root `tests/` directory, so
the command reports that missing search root; package and Desktop tests were
searched under their actual locations.

No current file defines any of:

```text
CodingPack
CodingPackManifest
CodingPackPreview
CodingPackExportRequest
CodingPackExportReceipt
pack manifest storage
pack export command
pack preview route or component
pack lifecycle event
```

### Existing Foundations

| File | Current symbol | Current input | Current output | Relevance and limit |
|:--|:--|:--|:--|:--|
| `packages/project-runtime/src/project/runtime.ts` | `ProjectRuntime.openProject()` | Authorized adapter and root identity | In-memory `Project`, tree, and index | Useful discovery foundation; no manifest, digest, export, or durable selection |
| same | `toggleSelect()`, `selectedPaths`, `readSelectedFiles()` | User-selected relative paths | `FileContent[]` | Full-file in-memory context only; unreadable files are silently omitted |
| same | `fileAccess` | Relative path and text | Existing-file read/write | Reserved for approved Diff Engine apply; cannot create a pack artifact |
| `packages/project-runtime/src/types/project.ts` | `ProjectIndexEntry` | Adapter directory entries | Path, size, language, synthetic modified time | No content digest, source identity, exclusion reason, or real native size/mtime |
| `packages/project-runtime/src/indexing/index.ts` | `ProjectIndexer.buildIndex()` | Root identity through adapter | Flat lightweight index | Depth capped at 12; `lastModified` is `Date.now()` and not source evidence |
| `packages/project-runtime/src/ignore/rules.ts` | `shouldIgnore()` | Relative path | Boolean | Static defaults only; does not parse project `.gitignore` files |
| same | `isBinaryFile()` | Filename extension | Boolean | Extension heuristic, not byte-level binary or encoding validation |
| `packages/project-runtime/src/fs/path.ts` | `assertSafeProjectRelativePath()` | Candidate path | Pass or `UnsafeProjectPathError` | Rejects absolute, traversal, empty segments, NUL, and backslashes |
| `apps/desktop/src/platform/tauriFileSystemAdapter.ts` | `TauriFileSystemAdapter` | Authorized native root and relative path | Directory listing, existing text read/write | Revalidates containment and rejects symlinks; exposes no create/atomic export API |
| `apps/desktop/src/platform/openProjectDirectory.ts` | `openProjectDirectory()` | User directory picker | `OpenedProjectDirectory` | Establishes browser or Tauri authorization and keeps the native root private |
| `apps/desktop/src/platform/projectBinding.ts` | `projectBindingIdentity()` | Access source and private root | SHA-256 project binding/fingerprint | Reusable private binding; fingerprint currently identifies root, not repository content |
| `apps/desktop/src/hooks/useRuntime.ts` | `openProject()`, `toggleFileSelection()` | User picker and file clicks | React tree, counts, `contextFiles` | Selection is process-local and reset when a project opens; no pack state |
| same | `sendPrompt()` | Prompt and selected full files | `ContextBundle` passed to Agent Runtime | Context is prompt-scoped, not a durable/exportable product artifact |
| `apps/desktop/src/components/ProjectRail.tsx` | `ProjectTree` integration | Agent view and open project | Clickable file selection | Current selection exists only in the Agent rail |
| `apps/desktop/src/views/FilesView.tsx` | `FilesView` | Current tree | Browse-only file table | Does not pass a selection callback and has no Coding Pack flow |
| `apps/desktop/src/components/ContextPanel.tsx` | `ContextPanel` | Last `ContextBundle` and counts | Source status and token estimate | Does not show source contents, exclusions, provenance, or export confirmation |
| `packages/context-engine/src/types/context.ts` | `ContextRequest`, `ContextBundle` | Prompt and `FileContent[]` | Assembled prompt plus display strings | No per-file digest, manifest, exclusion evidence, version, or staleness |
| `packages/context-engine/src/context/engine.ts` | `ContextEngine.buildContext()` | Rules, memory, metadata, files, task | One assembled prompt | Correct owner for prompt assembly, not pack generation or export |
| `packages/context-engine/src/builders/files.ts` | `FileContextBuilder.build()` | Ordered full-file contents | Concatenated text | Preserves order and path; performs no ranking, chunking, manifesting, or provenance |
| `packages/session-runtime/src/types.ts` | `UNIVERSAL_EVENT_TYPES` | Session operations | Generic action and artifact event types | No pack event types; generic action start currently requires a prior policy decision |
| same | `ProjectBindingInput` | Private root and fingerprint | Public binding without root | Useful privacy boundary for pack ownership |
| `packages/session-runtime/src/runtime.ts` | `SessionRuntime` | Session entries | Append-only projected ledger | Durable in Desktop, but not a pack metadata/content store |
| `apps/desktop/src-tauri/src/session_database.rs` | `SessionDatabase` | Session and binding commands | SQLite `sessions`, `session_entries`, `project_bindings` | No pack table; Session schema must not change in this planning task |
| `packages/action-runtime/src/types.ts` | `ActionProposal`, `ActionApproval`, `ActionOutcome` | Typed side-effect proposal | Approval/decision/execution lifecycle | Candidate export authorization foundation; provider-neutral but requires a decision |
| `packages/git-runtime/src/checkpoints/engine.ts` | `CheckpointEngine` | Explicit checkpoint name | In-memory checkpoint record | Not connected to Coding Pack; current checkpoint collection is not durable |
| `.github/workflows/ci.yml` | `KerniQ CI` | Push/PR | Five CI jobs | Current runs emit a Node 20 action deprecation annotation |

### Current User Flow

```text
User opens a directory
-> Tauri or browser grants project access
-> ProjectRuntime builds an in-memory tree and lightweight index
-> user selects full files in the Agent rail
-> Desktop reads selected files into React state
-> ContextEngine concatenates rules, memory, metadata, files, and prompt
-> assembled prompt is sent to the selected provider
```

Current output is an ephemeral `ContextBundle`. Current selection and the last
bundle are React state. Desktop Session persistence records the project binding,
user message, model/action evidence, and artifacts created by existing flows;
it does not persist the selected source set or a Coding Pack.

### Current Tests

- `packages/project-runtime/tests/runtime.test.ts` covers project open, ignore,
  selection, reads, index, binary indication, and close.
- `packages/project-runtime/tests/ignore.test.ts` covers static ignores,
  extension-based binary detection, and language hints.
- `packages/project-runtime/tests/indexing.test.ts` covers the lightweight index.
- `apps/desktop/src/platform/tauriFileSystemAdapter.test.ts` covers containment,
  Windows path semantics, traversal, symlinks, existing-file writes, and
  absolute-path error redaction.
- `packages/context-engine/tests/*` covers assembly order, file formatting,
  token estimates, and selected-file input.
- `apps/desktop/e2e/ui-product-polish.spec.ts` confirms directory expansion does
  not change file selection.
- Session Runtime and native SQLite tests cover the existing ledger and project
  binding, not pack lifecycle or export.

### Current Limitations

1. Native entries do not expose reliable byte size or modified time.
2. The static ignore function is not a `.gitignore` implementation.
3. Reads do not produce SHA-256 digests or encoding evidence.
4. Bulk reads silently omit failures, which is unsuitable for an authoritative
   manifest.
5. Selection is full-file and process-local.
6. The tree and index use recursion limits but no explicit file-count or
   aggregate-byte budget.
7. There is no secret-oriented denylist or scanner for pack generation.
8. There is no submodule or nested-repository boundary model.
9. There is no preview-to-export source revalidation.
10. Existing write adapters replace files only; they do not create a staged,
    atomic artifact.
11. Context Engine output is provider input, not a portable source package.
12. Session Runtime has no pack-specific projection, receipt, or recovery rule.

The adjacent foundations do not make the product partial. A user cannot create,
inspect, confirm, update, reopen, or export a Coding Pack today.

```text
CURRENT_CODING_PACK_STATE=PLANNED_ONLY
```

## User Problem and Product Outcome

### User Problem

Users need a repeatable way to prepare bounded repository context for a coding
task, handoff, review, or another authorized tool. Manual file selection is
ephemeral and offers no exact provenance, stale-source warning, privacy review,
or portable artifact. Sending an assembled prompt is not equivalent to knowing
which source bytes were selected.

### Product Outcome

The user creates a Coding Pack through the Desktop after opening an authorized
project. KerniQ discovers and filters candidate source deterministically,
creates a canonical manifest and preview, requires the user to inspect and
confirm it, and then writes an explicitly approved durable artifact.

Initial proposed purposes are:

```text
repository_orientation
task_context
review_handoff
```

Purpose changes selection rules and explanatory copy; it never grants broader
filesystem access.

### Creator and Authority

- The user is the creator and final export authority.
- `@qodex/coding-pack-runtime` is the proposed deterministic generation owner.
- `@qodex/project-runtime` remains the authorized project discovery/read owner.
- Desktop React owns purpose, preview, warnings, confirmation, refresh, and
  receipt UI.
- A Desktop-native adapter owns durable metadata and physical export.
- The deterministic manifest is authoritative. AI text is optional annotation
  and cannot change inclusion, exclusion, digest, or approval identity.

### Required Product Answers

| Question | Planning answer |
|:--|:--|
| Who creates a Coding Pack? | The user creates it through the Desktop; KerniQ performs deterministic generation after project authorization. |
| What problem does it solve? | It turns ephemeral file selection into inspectable, repeatable, provenance-bound repository context. |
| What inputs are included? | Purpose, project binding/fingerprint, versioned rules, explicit choices, bounded UTF-8 full-file bytes, relative paths, and source evidence. |
| What is excluded? | Unsafe, ignored, private, secret-like, binary, invalid, oversized, generated, vendor, linked, submodule, nested-repository, unreadable, or user-removed files; partial ranges are excluded in v0.7. |
| What identifies a pack? | Canonical `sourceFingerprint`, derived `packId`, and instance `manifestDigest`. |
| How is provenance retained? | Per-file relative path, digest, bytes, encoding, reason, project fingerprint, purpose, and rules version. |
| How does the user approve it? | The Desktop shows included files, exclusions, warnings, limits, and digests; confirmation binds that exact preview and destination. |
| How is it updated? | Re-discovery creates a new fingerprint and preview; no approved pack is silently changed. |
| How is staleness detected? | Recompute included digests and rules identity before confirmation, before write, and when reopening. |
| Is it temporary, durable, or exportable? | Preview is temporary; operation metadata is durable; a confirmed artifact is exportable and durable. |
| Which package owns generation? | Proposed new `@qodex/coding-pack-runtime`. |
| Which layer owns UI and persistence? | Desktop React owns UI; a Desktop `CodingPackStore` owns one durable export lifecycle. |
| Is native filesystem access required? | No for pure manifest logic; yes for real Desktop discovery evidence and atomic physical export. |
| What physical side effects occur? | Preview has none. Export writes only the explicitly approved pack artifact and bounded operation metadata; it runs no command or network request. |
| Does AgentFuse participate? | Read-selection use is undecided after audit; export policy use requires separate review; content-quality judgment is prohibited. |

## Package and Ownership Map

| Concern | Proposed owner | Boundary |
|:--|:--|:--|
| Authorized root and relative reads | `@qodex/project-runtime` plus platform adapter | No arbitrary root or absolute-path request |
| Selection rules, exclusion evidence, source hashing, canonical manifest, staleness | New `@qodex/coding-pack-runtime` | Pure deterministic core; browser-safe exports |
| Prompt use of a confirmed pack | `@qodex/context-engine` adapter | Consumes confirmed sources; does not mutate the manifest |
| Preview and confirmation | Desktop React | User sees all included/excluded paths, warnings, sizes, and digest |
| Approval and in-process side-effect state | `@qodex/action-runtime` | Export is risk `write`; decision provider remains separately reviewed |
| Durable pack operation metadata | Desktop `CodingPackStore` adapter | Separate versioned store; no raw source content or absolute root |
| Native physical export | New bounded Tauri command/module | No shell; revalidates binding, destination, source digests, and output |
| Optional Session association | Existing `ARTIFACT_CREATED` after success only | Informational reference, not lifecycle authority |
| Commands invoked by future integrations | Frozen Project Command gate | This plan does not change that gate |

The Coding Pack store is the single authoritative export lifecycle. The
artifact is the authoritative content. Session Runtime may reference a
completed artifact but must not mirror or compete with the operation state.

## Trust Boundaries

### Boundary 1: Authorized Project Read

Only paths discovered under an actively authorized `OpenedProjectDirectory`
enter selection. Every path is project-relative, normalized, containment
checked, and symlink-free. The root remains private platform state.

### Boundary 2: Deterministic Selection

Selection accepts a purpose, versioned rules, explicit user additions/removals,
and file metadata. It does not accept model-authored paths, ignore overrides, or
absolute roots. Candidate order and exclusion order are stable.

### Boundary 3: Preview and Confirmation

Confirmation binds the exact project fingerprint, purpose, rules version,
included path/digest list, exclusions, output shape, and preview digest.
Changing any field invalidates approval.

### Boundary 4: Physical Export

Export is a write side effect. The native boundary re-resolves the authorized
project and destination, recomputes source digests, rejects stale approval, and
writes through an operation-owned temporary path before atomic promotion.

### Boundary 5: Downstream Consumption

Repository text is untrusted content. Prompt injection in source files is shown
as source, never interpreted as KerniQ policy. AgentFuse, providers, skills, and
other consumers may not rewrite the authoritative manifest.

## DHMS / AgentFuse Boundary

```text
read-only deterministic repository inspection
-> ordinary capability and privacy controls

writing or exporting a Coding Pack
-> explicit product authorization boundary

executing commands or other physical side effects
-> existing frozen Project Command gate or another separately reviewed action
   adapter
```

Ordinary read-only selection must not be routed through AgentFuse merely
because AgentFuse exists. The audit found no current Coding Pack action profile
or policy. A v0.7 implementation review must decide whether any read-selection
policy requires AgentFuse; until that decision, no implicit dependency is
allowed.

The export authorization can use Action Runtime's provider-neutral proposal,
approval, decision, execution, and outcome contracts. Whether AgentFuse is the
decision provider for that new write action remains a separate explicit
decision. AgentFuse may assess policy, but it must never score content quality,
choose files, summarize source, or claim that selected source is safe.

```text
CODING_PACK_READ_SELECTION_AGENTFUSE_REQUIRED=UNDECIDED_AFTER_AUDIT
CODING_PACK_WRITE_OR_EXPORT_BOUNDARY_REQUIRED=true
PROJECT_COMMAND_FREEZE_CHANGED=false
```

## Privacy and Security Model

### Default Selection Rules

The planned v0.7 defaults are intentionally bounded and must be finalized with
tests in v0.7.1:

- at most 500 included files;
- at most 512 KiB per source file;
- at most 10 MiB aggregate included bytes;
- UTF-8 text only, with invalid encoding excluded;
- full files only; partial source ranges are not accepted in the first version;
- `.gitignore` plus KerniQ's versioned deny rules;
- hidden files excluded except an explicit safe allowlist such as
  `.gitignore` and `.editorconfig`;
- vendor, dependency, generated, build, cache, VCS, nested repository, and
  submodule contents excluded by default;
- symlinks, junctions, hard-link ambiguity, absolute paths, and traversal
  rejected;
- likely credentials and private keys hard-excluded with no v0.7 override; and
- stable path-byte ordering before hashing and rendering.

Secret scanning is defense in depth. It cannot prove the absence of all
secrets, and the UI must say so directly.

### Included Inputs

The manifest may bind:

- project binding ID and non-secret project fingerprint;
- display name after sensitive-text sanitization;
- purpose and selection-rules version;
- explicit include/remove choices;
- normalized relative path;
- SHA-256 source digest;
- exact byte count and `utf-8` encoding;
- language hint;
- inclusion reason;
- exclusion reason and non-sensitive details;
- stable source fingerprint;
- pack and manifest schema versions; and
- generated timestamp for the export instance.

It must not include raw credentials, source text in ledger metadata, private
absolute roots, home directories, provider keys, or export destination paths.

### Excluded Files and Ranges

The first version includes complete files or excludes them. It does not export
arbitrary line ranges because ranges complicate digest authority, provenance,
and refresh behavior. Future source-range support requires its own canonical
byte-offset and encoding decision.

Files are excluded when ignored, denied, binary, invalidly encoded, oversized,
unreadable, outside the authorized project, linked, in a nested repository or
submodule, generated/vendor content, secret-like, or removed by the user. Every
candidate omission has a deterministic reason code.

## Deterministic Manifest Design

### Artifact Shape

```text
<chosen destination>/
  manifest.json
  sources/
    <preserved project-relative paths>
  README.md
```

`README.md` is generated from fixed product copy and manifest fields. It is not
an AI summary. Optional AI annotations, if later added, live in a separate
non-authoritative file and identify their provider/model/provenance.

### Canonical Identity

The core uses canonical JSON with UTF-8, lexicographically sorted object keys,
sorted relative paths, explicit integer byte counts, and no platform-specific
separators.

```text
sourceFingerprint =
  sha256(canonical(projectFingerprint, purpose, rulesVersion,
                   included sources, exclusions))

packId =
  "pack-" + sourceFingerprint

manifestDigest =
  sha256(canonical(full manifest excluding manifestDigest))
```

`sourceFingerprint` is deterministic for the same source bytes and rules.
`generatedAt` is included in the instance manifest and therefore in
`manifestDigest`, but not in `sourceFingerprint`. This distinguishes stable
source identity from one export instance.

### Proposed Manifest Fields

```ts
interface CodingPackManifest {
  schemaVersion: "kerniq.coding-pack.manifest.v1";
  packVersion: "0.7";
  packId: string;
  purpose: CodingPackPurpose;
  project: {
    bindingId: string;
    displayName: string;
    fingerprint: string;
  };
  selectionRulesVersion: string;
  sources: CodingPackFileEntry[];
  exclusions: CodingPackExclusion[];
  sourceFingerprint: string;
  generatedAt: string;
  manifestDigest: string;
}
```

The exported manifest contains relative paths and digests, never the private
root or destination.

## Proposed Product Flow

```text
Open authorized project
-> choose Coding Pack purpose
-> discover candidate paths under project authorization
-> apply ignore, type, size, encoding, privacy, and boundary rules
-> read bounded source bytes and calculate SHA-256 digests
-> generate canonical manifest and source fingerprint
-> show included files, exclusions, warnings, size, and manifest digest
-> user removes optional files or refreshes
-> revalidate source fingerprint
-> user explicitly confirms exact export proposal and destination
-> persist PACK_CONFIRMED and PACK_EXPORT_STARTED in the Coding Pack store
-> native boundary revalidates project, destination, and every source digest
-> stage manifest and source files in an operation-owned temporary directory
-> atomically promote without overwriting unrelated data
-> persist PACK_EXPORT_COMPLETED and a bounded receipt
-> optionally append an informational Session ARTIFACT_CREATED reference
```

If source or destination identity changes after preview, export does not start.
The user receives a stale preview and must refresh. No LLM is required for
discovery, hashing, manifesting, preview, staleness, or export.

### Refresh and Staleness

- Recompute every included digest immediately before confirmation.
- Recompute again at the native pre-dispatch boundary.
- Compare selection rules version, project binding, included paths, digests,
  byte counts, and exclusion set.
- Mark a durable pack stale when the current source fingerprint differs.
- Never silently update an approved pack.
- Refresh creates a new source fingerprint and requires new confirmation.

## Typed Contract Plan

These contracts are planned, not implemented:

```ts
type CodingPackPurpose =
  | "repository_orientation"
  | "task_context"
  | "review_handoff";

interface CodingPackSource {
  projectBindingId: string;
  projectFingerprint: string;
  relativePath: string;
  content: Uint8Array;
  encoding: "utf-8";
}

interface CodingPackFileEntry {
  relativePath: string;
  sourceDigest: string;
  byteCount: number;
  encoding: "utf-8";
  language?: string;
  inclusionReason: string;
}

interface CodingPackSelectionRule {
  id: string;
  version: string;
  effect: "include" | "exclude";
  source: "product" | "gitignore" | "purpose" | "user";
  pattern: string;
}

interface CodingPackExclusion {
  relativePath: string;
  reason:
    | "ignored"
    | "private"
    | "secret_candidate"
    | "binary"
    | "invalid_encoding"
    | "oversized"
    | "generated"
    | "vendor"
    | "symlink"
    | "submodule"
    | "nested_repository"
    | "unreadable"
    | "user_removed";
}

interface CodingPackPreview {
  manifest: CodingPackManifest;
  includedBytes: number;
  warnings: string[];
  stale: boolean;
}

interface CodingPackExportRequest {
  actionId: string;
  approvalId: string;
  projectBindingId: string;
  sourceFingerprint: string;
  manifestDigest: string;
  destinationHandle: string;
}

interface CodingPackExportReceipt {
  operationId: string;
  packId: string;
  sourceFingerprint: string;
  manifestDigest: string;
  artifactDigest: string;
  fileCount: number;
  byteCount: number;
  destinationFingerprint: string;
  status: "completed";
  completedAt: string;
}

interface CodingPackFailure {
  code:
    | "unauthorized_project"
    | "invalid_selection"
    | "privacy_blocked"
    | "stale_preview"
    | "destination_changed"
    | "duplicate_export"
    | "write_failed"
    | "interrupted"
    | "verification_failed";
  safeMessage: string;
  recoverable: boolean;
}
```

Raw source text, private roots, and absolute destinations are prohibited in
action parameters, durable receipts, Session entries, and exported provenance.
The native adapter resolves an opaque destination handle held in private
Desktop state.

## Persistence and Lifecycle Decision

### Decision

Use a combination:

1. ordinary explicitly approved artifact storage for `manifest.json`,
   `sources/`, and fixed README content;
2. a dedicated versioned Desktop `CodingPackStore` for operation metadata,
   approval binding, interruption, and receipts; and
3. optional Session `ARTIFACT_CREATED` association only after verified success.

Do not add pack events to `SessionEventType` in the first implementation. The
current generic Session action projection requires policy fields including
`agentFuseCommit`, while AgentFuse participation in Coding Pack export remains
undecided. Reusing it now would either make a false AgentFuse claim or couple
the pack to a policy decision that has not been reviewed.

The dedicated store is authoritative for one export lifecycle:

```text
PACK_PROPOSED
-> PACK_CONFIRMED
-> PACK_EXPORT_STARTED
-> PACK_EXPORT_COMPLETED

or

PACK_EXPORT_INTERRUPTED
```

These are Coding Pack store states, not new Session events. One operation ID,
pack ID, approval ID, source fingerprint, manifest digest, and destination
fingerprint bind the sequence. The store contains no source bytes or private
absolute path. A separate versioned SQLite database or equivalent transactional
store is preferred so Session schema remains unchanged.

### Recovery

- `PACK_PROPOSED` without confirmation is disposable preview metadata.
- `PACK_CONFIRMED` without start requires a new destination revalidation after
  restart and never auto-starts.
- `PACK_EXPORT_STARTED` without completion becomes
  `PACK_EXPORT_INTERRUPTED`.
- KerniQ may inspect or clean only an operation-owned temporary path whose
  marker matches the durable operation and manifest digests.
- Unknown directories, completed packs, and user data are never deleted.
- Recovery never assumes whether an external destination write completed; it
  verifies the artifact digest before offering resume, retry, or cleanup.

## Threat Model

Secret scanning and deny patterns are fallible controls. They reduce exposure
but cannot prove that a pack contains no secret or private information.

| Threat | Owner | Preventive control | Detective evidence | Failure behavior | Future test |
|:--|:--|:--|:--|:--|:--|
| Private path leakage | Coding Pack core | Export only normalized relative paths | Manifest schema rejects absolute paths | Block preview/export | Home and drive-root fixtures absent from manifest |
| Home-directory leakage | Desktop/native | Keep root in private binding and opaque handle | Scan manifest, receipt, logs, UI errors | Fail closed and redact | macOS, Linux, Windows home fixtures |
| Secret or credential inclusion | Coding Pack privacy engine | Hard deny names plus content heuristics | Per-file exclusion reason and aggregate warning | Exclude file; no override in v0.7 | API key, token, PEM, SSH, cloud credential fixtures |
| `.env` inclusion | Selection engine | Exclude `.env` and `.env.*` before read/export | `secret_candidate` or `private` exclusion | Exclude and warn | Nested and mixed-case `.env` fixtures |
| Ignored-file inclusion | Selection engine | Apply versioned product rules and project `.gitignore` | Rule ID attached to exclusion | Exclude; invalid ignore parser fails safe | Negation, nested, escaped, anchored ignore patterns |
| Binary-file inclusion | Project/Coding Pack runtimes | Extension and byte/encoding checks | `binary` exclusion with bounded metadata | Exclude without decoding | Images, archives, NUL bytes, unknown binary extension |
| Oversized repository | Coding Pack core | File-count and aggregate-byte caps | Preview reports cap and omitted counts | Stop discovery with bounded result | Repositories over each limit |
| Generated files | Selection engine | Generated/build directory and file patterns | `generated` exclusion | Exclude by default | dist, coverage, generated clients, maps |
| Vendor directories | Selection engine | Vendor/dependency rule set | `vendor` exclusion | Exclude by default | node_modules, vendor, target, venv |
| Symlink escape | Platform adapter | lstat every segment; never follow links | Safe `symlink` exclusion without target | Exclude or block project traversal | File, directory, junction, chained symlink fixtures |
| Path traversal | Project/native adapters | Strict project-relative validation and containment | Bounded `invalid_selection` code | Reject entire request | `..`, absolute, UNC, drive, NUL, mixed separators |
| Submodule boundaries | Selection engine | Detect gitlink/submodule roots; do not recurse | `submodule` exclusion | Exclude until separately authorized | `.gitmodules` plus gitlink-like fixture |
| Nested repository boundaries | Selection engine | Stop at nested `.git` file/directory marker | `nested_repository` exclusion | Exclude subtree | Nested worktree and repository fixture |
| Stale source | Coding Pack core | Recompute source fingerprint before approval | Preview stale flag and changed entries | Require refresh | Modify, add, delete after preview |
| Source changed after user review | Native exporter | Re-read and hash every source before first write | Operation records pre-dispatch verification | Zero write and `stale_preview` | TOCTOU mutation between confirm and start |
| Prompt injection in repository files | UI/context owner | Treat content as quoted untrusted source, not instructions | Preview labels source boundary | No policy/config change from source | Files containing fake system and approval prompts |
| Malicious filenames | Selection/native | UTF-8 normalization policy, separator/control rejection, collision detection | Exclusion reason and collision list | Exclude or block pack | Control chars, reserved Windows names, case collisions |
| Invalid text encoding | Coding Pack core | Strict UTF-8 decode with no replacement | `invalid_encoding` exclusion | Exclude file | Invalid UTF-8, BOM variants, mixed encoding |
| Very large source file | Coding Pack core | Per-file byte cap before content allocation | `oversized` exclusion with byte count | Exclude and continue within aggregate cap | Sparse and dense files above limit |
| License or copyright-sensitive content | Product UI/user | Surface license files, origin, and export responsibility | Manifest includes source provenance and warning acknowledgment | Require explicit confirmation; do not claim rights | LICENSE variants and third-party source fixture |
| Manifest tampering | Coding Pack core/native | Canonical SHA-256 manifest and artifact digest | Verify digest on open/use/export | Mark invalid; never consume as confirmed | Change path, digest, timestamp, exclusion |
| Export destination drift | Desktop/native | Bind opaque handle and destination fingerprint at confirmation | Revalidate before staging and promotion | Zero write and require confirmation | Rename/swap destination after approval |
| Duplicate export | Coding Pack store/native | Idempotency key from operation and manifest; no blind overwrite | Existing verified receipt/artifact digest | Return verified receipt or fail collision | Concurrent double click and repeated request |
| Partial export failure | Native exporter | Operation-owned staging plus atomic promotion | Durable started/interrupted status and temp marker | Leave no claimed completion; preserve recoverable temp | Inject failure at each file and rename boundary |
| Restart after interrupted export | Coding Pack store/native | Recover started operations without auto-resume | Store status plus owned marker/digest inspection | Mark interrupted; offer bounded retry/cleanup | Kill process before/after promotion and restart |

## Compatibility Constraints

- Preserve all `@qodex/*` compatibility namespaces and existing exports.
- A future package may use the internal name
  `@qodex/coding-pack-runtime`; this is not a Stage 2 namespace rename.
- Do not change Tauri bundle identity, local project authorization, provider
  behavior, managed Python identity, AgentFuse identity, or package versions as
  part of planning.
- Do not change Session schema merely to store pack content.
- Browser mode may retain its existing authorized read path. v0.7 native export
  targets Desktop first and does not add browser-native access.
- Pack export does not use shell commands. Any future integration that invokes
  a project command must use the separately frozen Project Command gate.
- Patch, Git, MCP, provider, Marketplace, and skill behavior remain unchanged.

## Implementation Slices

### v0.7.1 - Contracts and Deterministic Manifest

**Objective:** Add a browser-safe Coding Pack core package with the typed
contracts, canonical JSON, SHA-256 identity rules, and pure manifest builder.

**Tests:** Canonical order, cross-platform separators, stable fingerprints,
timestamp separation, tamper detection, and JSON bounds.

**Boundary:** No filesystem scan, UI, persistence, export, or AgentFuse change.
End in one reviewable Draft PR.

### v0.7.2 - Selection, Privacy, and Source Evidence

**Objective:** Add bounded discovery over Project Runtime adapters with real
size/encoding evidence, `.gitignore` semantics, hard privacy exclusions, and
explicit exclusion reasons.

**Tests:** Ignore rules, secrets, binary/encoding, size caps, symlinks,
traversal, submodules, nested repositories, generated/vendor paths, malicious
filenames, and large repositories.

**Boundary:** Read-only preview inputs only. No artifact write. End in one
reviewable Draft PR.

### v0.7.3 - Preview and User Confirmation UI

**Objective:** Add a Desktop Coding Pack view for purpose, included/excluded
files, warnings, size, fingerprints, refresh, and exact confirmation.

**Tests:** Keyboard flow, stale preview, selection changes, no secret content in
errors, full confirmation binding, and browser/native capability messaging.

**Boundary:** No physical export. End in one reviewable Draft PR.

### v0.7.4 - Durable Authorization and Atomic Export

**Objective:** Add dedicated operation persistence, Action Runtime export
proposal/approval, opaque destination binding, native source revalidation, and
atomic no-overwrite export.

**Tests:** Approval mismatch/expiry, decision failure, source/destination drift,
duplicate export, partial write, atomic promotion, receipt verification, and
zero-write failures.

**Boundary:** Export only; no shell, command, Patch, Session schema, or broad
filesystem API. End in one reviewable Draft PR.

### v0.7.5 - Staleness, Refresh, Provenance, and Recovery

**Objective:** Reopen verified packs, compare source fingerprints, refresh only
after new confirmation, and recover interrupted operation-owned staging.

**Tests:** Add/change/delete, rules-version drift, restart at each lifecycle
point, unknown temp data preservation, receipt tamper, and optional Session
artifact reference.

**Boundary:** One Coding Pack lifecycle remains authoritative. End in one
reviewable Draft PR.

### v0.7.6 - Real Desktop Proof, Result Review, and Freeze

**Objective:** Execute an isolated real Tauri proof of preview, privacy
exclusion, stale blocking, confirmed export, duplicate handling, interruption,
restart recovery, and verified artifact consumption.

**Tests and evidence:** Full workspace and native suites, Desktop E2E, real
SQLite Coding Pack store, actual native filesystem staging/promotion, privacy
scan, process/temp cleanup, result review, and separate docs-only freeze.

**Boundary:** Use only disposable temporary projects and destinations. End in a
reviewable Draft PR; freeze only after evidence review.

Every slice must preserve the v0.6.1 Project Command freeze and avoid broad
refactoring.

## Test Plan

### Unit Tests

- Typed contract validation and safe failure codes.
- Canonical JSON, source fingerprint, manifest digest, and artifact digest.
- Stable sorting, path normalization, case collision, and filename bounds.
- Purpose rules and explicit user removal.
- Every exclusion reason.
- Secret fixtures without claiming perfect secret detection.
- UTF-8 and binary detection.
- Source and aggregate limits.
- Staleness and tamper comparisons.

### Package Integration Tests

- Project Runtime authorized adapter to Coding Pack core.
- Context Engine consuming only confirmed manifest sources.
- Action Runtime proposal/approval/decision/export handler with no duplicate
  dispatch.
- Coding Pack store transactional transitions and recovery.
- Optional Session `ARTIFACT_CREATED` only after verified completion.

### Desktop Tests

- Open project, select purpose, preview, inspect, remove, refresh, and confirm.
- Preview is usable without a configured provider.
- Exact source/exclusion counts and bytes are visible.
- Confirmation invalidates on project, rule, source, or destination change.
- No absolute root or raw secret appears in UI errors, logs, or persisted
  metadata.
- Browser mode communicates export availability honestly.

### Filesystem and Privacy Tests

- Unix, Windows drive, UNC, mixed separator, traversal, NUL, reserved name, and
  case-collision paths.
- Symlink, junction, hard-link ambiguity, submodule, and nested repository.
- `.gitignore` patterns and safe hard exclusions.
- Large repository, large file, binary, invalid encoding, generated, vendor,
  and unreadable fixtures.
- Destination replacement, parent link, duplicate output, disk-full, permission
  loss, partial write, promotion failure, and restart.

### Real Desktop Proof Plan

Use a fresh app-data root, temporary project, and temporary export destination.
Never use the user's normal projects.

The proof must demonstrate:

1. provider credentials are unnecessary for deterministic preview;
2. private root and home path never enter manifest, receipt, logs, or UI error;
3. `.env`, key, binary, symlink, generated, vendor, nested repository, and
   oversized fixtures are excluded with expected reasons;
4. included files have exact bytes, SHA-256 digests, and stable order;
5. source mutation after preview produces zero write and requires refresh;
6. explicit confirmation binds the exact source and destination fingerprints;
7. one native export produces one completed operation and verified artifact;
8. duplicate confirmation cannot produce competing writes;
9. injected partial failure never claims completion;
10. restart marks an uncertain started operation interrupted and preserves
    unknown user data;
11. reopening verifies manifest and artifact digests and reports staleness; and
12. all operation-owned temporary files are cleaned or explicitly recoverable.

## CI Maintenance Note

PR #16 CI run `30432189126` completed all five jobs successfully and emitted a
GitHub Actions annotation that Node.js 20 actions are deprecated and forced to
Node.js 24. The annotation identified `actions/checkout@v4` and
`actions/setup-python@v5` in the Python job. The workflow also pins Node 20 for
product test jobs.

This requires a separate bounded maintenance audit of every action version and
the repository Node support policy. Do not update workflow actions inside this
planning PR.

```text
CI_NODE20_DEPRECATION_REVIEW_REQUIRED=true
```

## Explicit Non-Goals

```text
v0.7 implementation started=false
Coding Pack generation implemented=false
Coding Pack export implemented=false
Session schema changed=false
Project Command freeze changed=false
Patch migrated=false
Git migrated=false
MCP migrated=false
browser native access added=false
arbitrary file read added=false
arbitrary file write added=false
arbitrary shell added=false
AgentFuse content-quality judgment added=false
workflow changed=false
```

Also out of scope: installer work, package/version bumps, release tags,
repository rename, Stage 2 namespace rename, provider changes, AI-generated
selection authority, automatic export, automatic Git commit/push, remote pack
upload, collaboration sync, and claims that a secret scanner proves safety.

## Open Questions

1. Should read-only deterministic selection remain entirely outside AgentFuse,
   or is there a separately justified privacy policy use case?
2. Should Coding Pack export use AgentFuse as Action Runtime's decision
   provider, or a bounded local product policy with explicit approval?
3. Which `.gitignore` implementation meets compatibility and dependency
   constraints without broadening the package surface?
4. Are the proposed 500-file, 512-KiB-per-file, and 10-MiB-total defaults
   appropriate after real repository benchmarks?
5. Should v0.7 export only to a new user-selected directory, or also support a
   fixed project-relative artifact root after explicit opt-in?
6. Should external destinations be reopenable through an OS bookmark/capability
   rather than a stored path?
7. Is a separate Coding Pack SQLite database preferable to a versioned atomic
   metadata file under app data?
8. Should a completed pack be attachable to Context Engine directly, or only
   after the user confirms it is current?
9. Which license/provenance warnings are required before exporting third-party
   code?
10. Should source ranges remain excluded for all v0.7 slices?

## Final Planning Verdict

The source audit supports a new bounded product integration, not a claim of an
existing implementation. The proposed architecture reuses authorization and
read primitives while assigning deterministic manifesting to a dedicated
runtime, UI to Desktop, export lifecycle to one dedicated durable store, and
physical writes to a narrow native boundary. It preserves the frozen Project
Command gate and keeps AgentFuse out of content-quality judgment.

```text
CODING_PACK_READ_SELECTION_AGENTFUSE_REQUIRED=UNDECIDED_AFTER_AUDIT
CODING_PACK_WRITE_OR_EXPORT_BOUNDARY_REQUIRED=true
PROJECT_COMMAND_FREEZE_CHANGED=false
CI_NODE20_DEPRECATION_REVIEW_REQUIRED=true

READY_FOR_V0_7_PLANNING_REVIEW
```
