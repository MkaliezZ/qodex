# ADR-022 - Coding Pack Product Integration

**Status:** Accepted
**Date:** 2026-07-29
**Planning base:** `0486704d613ea203672d75bee455346cceafb225`
**Decision merge:** `46ae1d405a5519477de7da3d1eba51c7e0ae5640`
**Depends on:** ADR-004, ADR-010, ADR-019, ADR-020, ADR-021

## Context

At the decision base, KerniQ could open an authorized project, build a file
tree and lightweight index, read selected text files, and assemble those files
into provider context. That flow was ephemeral and prompt-scoped. It had no
deterministic source manifest, staleness detection, privacy review, durable
export receipt, or portable artifact.

At that base, the v0.7 roadmap named Coding Pack Product Integration, but no
`CodingPack` contract, generator, UI, persistence, or export implementation
existed.

```text
CODING_PACK_STATE_AT_DECISION=PLANNED_ONLY
```

## Decision

Plan Coding Pack as a user-created, deterministic, inspectable, local-first
repository artifact:

1. An authorized project is the only source root.
2. A new browser-safe `@qodex/coding-pack-runtime` package owns versioned
   selection rules, exclusions, source hashing, canonical manifest generation,
   and staleness.
3. `@qodex/project-runtime` and its platform adapters continue to own bounded
   project-relative reads and containment.
4. Desktop owns purpose, preview, warnings, confirmation, refresh, and receipt
   UI.
5. Export is a `write` side effect with an exact proposal and explicit user
   approval.
6. A narrow native module revalidates source and destination identities and
   uses operation-owned same-filesystem staging plus atomic no-overwrite
   promotion.
7. A dedicated versioned `CodingPackStore` is the sole export lifecycle
   authority. Exported files are the content authority.
8. Session Runtime may reference a verified completed pack with
   `ARTIFACT_CREATED`; it does not own or mirror pack lifecycle.
9. AI summaries are optional, separate, and non-authoritative.

## Deterministic Identity

Local-only authority consists of `projectBindingId`, a private-root-derived
`projectFingerprint`, and an optional opaque destination handle. It is stored
only in trusted operation metadata for authorization and revalidation. It is
never written into the portable manifest, included in `sourceFingerprint` or
`packId`, or exposed to downstream consumers.

Portable project metadata contains only an optional `projectLabel`. The label
is absent by default and, when supplied, is explicitly user-controlled,
bounded, trimmed, control-character-free, and non-authoritative. KerniQ never
copies the local directory name automatically.

`sourceFingerprint` hashes the canonical schema version, pack version, purpose,
selection-rules version, sorted source entries, and sorted exclusions. It
excludes `generatedAt`, `manifestDigest`, `projectLabel`, all local authority,
private roots, and destinations. Identical source bytes and rules therefore
have the same fingerprint and `packId` across different local roots or labels.
`manifestDigest` hashes the full portable manifest instance excluding
`manifestDigest`, so `generatedAt` or `projectLabel` may change it. Preventing
local-root inference is a design goal, not an absolute cryptographic
non-inference claim.

Portable inclusion reasons and selection-rules versions are strict
machine-readable identifiers. They are not explanatory free text. All
caller-supplied portable strings must be well-formed Unicode before UTF-8 byte
counting, ordering, hashing, or canonical serialization. KerniQ does not
normalize those strings or replace malformed surrogate code units.

## Authorization and AgentFuse

Read-only deterministic repository inspection uses ordinary capability and
privacy controls. It must not be sent through AgentFuse merely because the
policy engine exists.

Writing or exporting requires explicit product authorization and a separately
versioned AgentFuse policy decision. The future profile ID is
`kerniq-coding-pack-export-v1`; its digest and implementation belong to v0.7.4.
The Coding Pack mapper validates the proposal and approval, the KerniQ bridge
maps bounded export identity to `ToolCallRequest`, AgentFuse evaluates policy,
and the adapter maps `allow|block|protocol failure` to `allow|deny|error`.
AgentFuse does not select or rank files, summarize content, judge quality,
certify the absence of secrets, or interpret repository instructions as
policy.

```text
CODING_PACK_READ_SELECTION_AGENTFUSE_REQUIRED=false
CODING_PACK_EXPORT_AGENTFUSE_DECISION_REQUIRED=true
PACK_DECIDED_BEFORE_EXPORT_START=true
CODING_PACK_WRITE_OR_EXPORT_BOUNDARY_REQUIRED=true
PROJECT_COMMAND_FREEZE_CHANGED=false
```

## Persistence

The authoritative future operation sequence is:

```text
PACK_PROPOSED
PACK_CONFIRMED
PACK_DECIDED allow
PACK_EXPORT_STARTED
PACK_EXPORT_COMPLETED
or PACK_CONFIRMED -> PACK_DECIDED deny|error
or PACK_EXPORT_STARTED -> PACK_EXPORT_INTERRUPTED
```

These are dedicated Coding Pack store states, not Session events. The store
persists identities, status, bounded warnings, and receipts, not source text or
private paths. Started operations never auto-resume after restart. Only a
temporary path carrying the matching operation marker may be inspected or
cleaned.

The store rejects export start without durable `PACK_DECIDED allow`. Deny,
error, decision-persistence failure, or start-persistence failure causes zero
physical writes. Session may append `ARTIFACT_CREATED` only after verified
completion and never mirrors this lifecycle.

## Atomic Promotion

Staging is created under the approved destination parent or another path proven
to be on the same filesystem, with an unpredictable operation-owned name.
Source digests and destination authority are revalidated before the first
write. All staged files are closed before a platform-reviewed atomic
no-overwrite promotion. Existing unrelated destinations are never overwritten.
If same-filesystem atomic promotion cannot be proven, export fails closed; no
cross-filesystem copy fallback is described as atomic.

```text
CODING_PACK_ATOMIC_PROMOTION_REQUIRES_SAME_FILESYSTEM=true
CROSS_FILESYSTEM_COPY_FALLBACK=false
```

## Privacy Defaults

- Parse project ignore rules and apply a versioned KerniQ hard denylist.
- Exclude hidden/private, credential-like, generated, vendor, binary,
  invalid-encoding, oversized, linked, submodule, and nested-repository content.
- Reject absolute paths, traversal, control characters, unsafe separators, and
  filename collisions.
- Bind preview to exact source digests and revalidate before the first write.
- Show all included paths, exclusions, sizes, warnings, and fingerprints before
  confirmation.
- State explicitly that secret scanning cannot prove the absence of all secrets.

## Consequences

### Positive

- Reproducible source identity and reviewable provenance.
- No LLM dependency for selection or manifest generation.
- Clear read, approval, persistence, and native write boundaries.
- No change to the frozen Project Command adapter.
- Restart and duplicate export behavior can be tested independently.

### Costs

- A new package, dedicated metadata store, Desktop view, and native export
  adapter require six bounded implementation slices.
- `.gitignore`, encoding, large-repository, cross-platform filename, and
  atomic-export behavior require substantial fixture coverage.
- External destination capability persistence needs a platform decision.

### Risks

- Secret heuristics can miss sensitive content.
- Source or destination can change between preview and export.
- Cross-platform case and filename semantics can produce collisions.
- An interrupted external write may have uncertain settlement.

The detailed controls and tests are defined in
`docs/development/kerniq_v0_7_coding_pack_product_integration_planning.md`.

## Alternatives Rejected

1. Reuse `ContextBundle` as the pack: rejected because it is one assembled
   prompt without per-file identity, exclusions, refresh, or provenance.
2. Let an LLM select and summarize source as authority: rejected because output
   is nondeterministic and repository text may contain prompt injection.
3. Write immediately after file selection: rejected because preview and exact
   user authorization are required.
4. Reuse Session Runtime as the pack database: rejected because the current
   generic action projection requires policy evidence fields and no pack content
   or recovery contract exists.
5. Invoke Repo2Prompt or shell commands directly: rejected because arbitrary
   command execution is outside scope and Project Command is frozen.
6. Store absolute roots and destinations in the manifest: rejected for privacy
   and portability.

## Compatibility

This ADR plans no current code or schema change. Future work preserves
`@qodex/*` compatibility names, package exports, Tauri bundle identity, local
paths, provider behavior, managed Python identity, and the v0.6.1 Project
Command freeze.

```text
V0_7_IMPLEMENTATION_STARTED=false
Session schema changed=false
Patch migrated=false
Git migrated=false
MCP migrated=false
arbitrary shell added=false
AgentFuse content-quality judgment added=false
workflow changed=false
CI_NODE20_DEPRECATION_REVIEW_REQUIRED=true
```

## v0.7.1 Implementation Boundary

The first bounded slice merged through PR #18 and merge commit
`d01ad3b71a83efe906c262fa466417d325969946` in
`@qodex/coding-pack-runtime`. It contains only browser-safe contracts, exact
UTF-8 source hashing, fixed bounds, canonical portable manifest identity,
deep-freeze, serialization, and verification. It has no runtime dependencies.

The then-unmerged manifest contract was corrected in place: source entries use
`inclusionReasonCode`, selection rules versions are portable machine
identifiers, metadata privacy checks target the actual portable fields,
ill-formed UTF-16 is rejected, and RFC 3339 `-00:00` is not accepted as a known
instant. No backward compatibility layer or second schema version is required.

```text
PRE_MERGE_CONTRACT_CORRECTION=true
BACKWARD_COMPATIBILITY_REQUIRED=false
PORTABLE_INCLUSION_REASON_FREE_TEXT=false
INCLUSION_REASON_MACHINE_CODE=true
SELECTION_RULES_VERSION_PORTABLE_IDENTIFIER=true
ILL_FORMED_UTF16_ACCEPTED=false
V0_7_2_STARTED_AT_V0_7_1_MERGE=false
FILESYSTEM_DISCOVERY_IMPLEMENTED=false
GITIGNORE_PARSER_IMPLEMENTED=false
CONTENT_SECRET_SCANNING_IMPLEMENTED=false
CODING_PACK_UI_IMPLEMENTED=false
CODING_PACK_STORE_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
CODING_PACK_NATIVE_MODULE_IMPLEMENTED=false
ACTION_RUNTIME_CONNECTED=false
AGENTFUSE_CONNECTED=false
PACK_DECIDED_PERSISTENCE_IMPLEMENTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
PATCH_MIGRATED=false
ARBITRARY_FILE_READ_ADDED=false
ARBITRARY_FILE_WRITE_ADDED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```

## v0.7.2 Implementation Boundary

The second bounded slice adds only a pure browser-safe selection and
path-classification API to `@qodex/coding-pack-runtime`. The caller supplies
project-relative candidate paths, exact bytes, reviewed origin codes, and an
optional project-ignore boolean. The portable ignore reason is always
`project_ignore`; callers cannot provide authoritative classifier reasons. The
package does not discover, open, or write files.

The selector validates identities without eagerly copying all bytes, rejects
exact duplicates and conservative fail-closed ECMAScript case/NFC collisions,
orders candidates by exact UTF-8 bytes, applies non-overridable private,
credential, generated, vendor, explicit, ignore, binary, and per-file rules
before decoding, and caps candidate count plus potentially eligible bytes.
Accepted files are copied only inside the exact-byte hashing boundary.

The result binds purpose and rules version to its canonical source fingerprint
and pack ID. Runtime verification recomputes shape, ordering, overlap, totals,
bounds, and identity. Manifest creation from selection accepts no independent
purpose or rules version. Portable paths rely on structural field separation:
identity-like English words are allowed in legitimate relative filenames,
while Windows-forbidden characters/device names, trailing dots/spaces, and
segments over 255 UTF-8 bytes are rejected.

Path and filename classification does not prove that included text contains no
secret. The case heuristic does not prove universal filesystem equivalence.
v0.7.2 does not parse `.gitignore`, scan content, emit source snippets, or
connect the authorized Project Runtime adapter.

```text
V0_7_1_MERGED=true
CODING_PACK_SELECTION_CORE_IMPLEMENTED=true
AUTHORIZED_PROJECT_DISCOVERY_CONNECTED=false
GITIGNORE_PARSER_IMPLEMENTED=false
PROJECT_IGNORE_DECISION_CALLER_SUPPLIED=true
PROJECT_IGNORE_REASON_CALLER_CONTROLLED=false
PROJECT_IGNORE_PORTABLE_REASON=project_ignore
SELECTION_PURPOSE_BOUND=true
SELECTION_RULES_VERSION_BOUND=true
SELECTION_SOURCE_IDENTITY_BOUND=true
SELECTION_RESULT_RUNTIME_VERIFICATION=PASS
SAFE_RELATIVE_FILENAME_KEYWORDS_ALLOWED=true
CANDIDATE_COUNT_BOUNDED=true
ELIGIBLE_CANDIDATE_BYTES_BOUNDED=true
ALL_CANDIDATE_BYTES_EAGERLY_COPIED=false
OVERSIZED_FILE_DECODED=false
CONTENT_SECRET_SCANNING_IMPLEMENTED=false
PATH_BASED_PRIVACY_CLASSIFICATION_IMPLEMENTED=true
SECRET_ABSENCE_PROVEN=false
CODING_PACK_UI_IMPLEMENTED=false
CODING_PACK_STORE_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
ACTION_RUNTIME_CONNECTED=false
AGENTFUSE_CONNECTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
PATCH_MIGRATED=false
ARBITRARY_FILE_READ_ADDED=false
ARBITRARY_FILE_WRITE_ADDED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```

## v0.7.3 Implementation Boundary

The third bounded slice connects only explicit Desktop file selection to the
merged deterministic selector. Project Runtime exposes a dedicated read-only
exact-byte capability bound to the existing authorized root. Browser mode uses
the selected `FileSystemFileHandle`; Tauri mode retains containment,
regular-file, and pre-read no-symlink/junction checks and uses a bounded native
file handle read after metadata size validation. The Tauri checks reject links
observed before the separate path-based open. v0.7.3 does not claim a race-free
open-by-handle guarantee against concurrent local filesystem mutation; physical
export requires a stronger native revalidation/open boundary in a later slice.
React cannot supply an arbitrary root or absolute path.

The shared Coding Pack Runtime pre-read plan applies the exact selector
classifier to path metadata, so private, credential-like, vendor, generated,
project-ignored, and binary-like exclusions require no source read. Candidate
count is checked before reading and cumulative eligible bytes are bounded while
reading. Completion accepts exactly the plan's read-required results.

The local preview binds project binding, open generation, the selection's
recomputed complete candidate-path digest, purpose, selection identity, and
manifest digest. Its portable manifest is created only through
`createCodingPackManifestFromSelection` and contains no local authority.
Purpose changes identity but does not discover files. A refresh re-plans every
selected path, re-reads only read-required files, and clears prior confirmation.
Source changes are not continuously monitored in this slice.

Confirmation is exact, in-memory only, and grants no export authority. It is
invalidated by project, generation, selected-path, purpose, rules, refreshed
source identity, or manifest-digest changes.

```text
V0_7_2_MERGED=true
CODING_PACK_SELECTED_FILE_PREVIEW_IMPLEMENTED=true
CODING_PACK_EXACT_CONFIRMATION_IMPLEMENTED=true
EXACT_AUTHORIZED_BYTE_READ_IMPLEMENTED=true
PRE_READ_SELECTION_PLAN_IMPLEMENTED=true
HARD_EXCLUDED_FILE_READ=false
BINARY_EXCLUDED_FILE_READ=false
PROJECT_IGNORED_FILE_READ=false
CANDIDATE_COUNT_CHECKED_BEFORE_READ=true
ELIGIBLE_BYTE_LIMIT_ENFORCED_DURING_READ=true
CANDIDATE_PATHS_DIGEST_RECOMPUTED=true
SELECTED_PATHS_IDENTITY_BOUND_TO_SELECTION=true
TAURI_PRE_READ_SYMLINK_CHECK=true
TAURI_RACE_FREE_SYMLINK_GUARANTEE=false
TEXT_REENCODING_USED=false
AUTOMATIC_REPOSITORY_DISCOVERY_IMPLEMENTED=false
GITIGNORE_PARSER_IMPLEMENTED=false
CONTENT_SECRET_SCANNING_IMPLEMENTED=false
MANUAL_REFRESH_REVALIDATES_SOURCE=true
CONTINUOUS_SOURCE_STALENESS_MONITORING=false
CONFIRMATION_EPHEMERAL=true
CONFIRMATION_AUTHORIZES_EXPORT=false
CODING_PACK_STORE_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
ACTION_RUNTIME_CONNECTED=false
AGENTFUSE_CONNECTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
ARBITRARY_FILE_WRITE_ADDED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```

## v0.7.4.1 Durable Store and Proposal Boundary

The fourth bounded implementation slice introduces the dedicated
`@qodex/coding-pack-store` package and schema
`kerniq.coding-pack.store.v1`. Tauri uses a separate
`kerniq-coding-pack.sqlite3` database with
`coding_pack_operations`, `coding_pack_events`, and
`coding_pack_destination_bindings`; it does not add Coding Pack rows or events
to Session Runtime.

Only `PACK_PROPOSED` and `PACK_CONFIRMED` are valid in this slice. Events have
strict per-operation sequence, unique IDs, bounded typed payloads, and
recomputed payload digests. Operation state is reconstructed from those
events. The proposal uses schema
`kerniq.coding-pack.export-proposal.v1` and canonical SHA-256 identity. Export
approval uses `kerniq.coding-pack.export-approval.v1` and binds the exact
operation and proposal digest. Preview confirmation is verified again but
cannot serve as export approval.

Destination bindings expose only an opaque ID, local fingerprint, display
label, creation time, and restart availability. A Tauri absolute destination
path is stored only in the private native binding table. Browser directory
handles remain in the in-memory capability layer and cannot be recreated from
the durable display label.

Canonical proposal and event identity sorts object keys by UTF-8 bytes and
rejects malformed Unicode, unsafe numbers, and non-exact identity formats.
Proposal and approval lifetimes are capped at 24 hours. Destination bindings
are immutable and preserve their first creation timestamp. Store reads return
operation, events, and destination from one snapshot; Tauri uses one SQLite
read transaction. Native writes independently validate typed proposal and
approval evidence, recompute canonical digests, enforce chronology, and fail
before insertion when identity is invalid. SQLite uses WAL and
`synchronous=FULL`; no stronger hardware-persistence claim is made.

Both proposal and confirmation state appear only after their durable
transaction succeeds. Restart reads state without advancing it. There is no
AgentFuse call, Action Runtime dispatch, `PACK_DECIDED`,
`PACK_EXPORT_STARTED`, `PACK_EXPORT_COMPLETED`, staging directory, destination
write, physical export, or Project Command change.

```text
CODING_PACK_STORE_IMPLEMENTED=true
PACK_PROPOSED_IMPLEMENTED=true
PACK_CONFIRMED_IMPLEMENTED=true
PACK_DECIDED_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
DESTINATION_FILES_WRITTEN=false
ACTION_RUNTIME_CONNECTED=false
AGENTFUSE_CONNECTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
```
