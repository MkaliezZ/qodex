# ADR-022 - Coding Pack Product Integration

**Status:** Accepted
**Date:** 2026-07-29
**Planning base:** `0486704d613ea203672d75bee455346cceafb225`
**Decision merge:** `46ae1d405a5519477de7da3d1eba51c7e0ae5640`
**Depends on:** ADR-004, ADR-010, ADR-019, ADR-020, ADR-021

## Context

KerniQ can open an authorized project, build a file tree and lightweight index,
read selected text files, and assemble those files into provider context. That
flow is ephemeral and prompt-scoped. It has no deterministic source manifest,
staleness detection, privacy review, durable export receipt, or portable
artifact.

The v0.7 roadmap names Coding Pack Product Integration, but no `CodingPack`
contract, generator, UI, persistence, or export implementation exists.

```text
CURRENT_CODING_PACK_STATE=PLANNED_ONLY
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

The first bounded slice is implemented for Draft PR review in
`@qodex/coding-pack-runtime`. It contains only browser-safe contracts, exact
UTF-8 source hashing, fixed bounds, canonical portable manifest identity,
deep-freeze, serialization, and verification. It has no runtime dependencies.

The unmerged manifest contract was corrected in place: source entries use
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
V0_7_2_STARTED=false
FILESYSTEM_DISCOVERY_IMPLEMENTED=false
GITIGNORE_PARSING_IMPLEMENTED=false
SECRET_SCANNING_IMPLEMENTED=false
CODING_PACK_UI_IMPLEMENTED=false
CODING_PACK_PERSISTENCE_IMPLEMENTED=false
CODING_PACK_EXPORT_IMPLEMENTED=false
CODING_PACK_NATIVE_MODULE_IMPLEMENTED=false
CODING_PACK_ACTION_RUNTIME_INTEGRATION=false
CODING_PACK_AGENTFUSE_INTEGRATION=false
PACK_DECIDED_PERSISTENCE_IMPLEMENTED=false
SESSION_SCHEMA_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
PATCH_MIGRATED=false
ARBITRARY_FILE_READ_ADDED=false
ARBITRARY_FILE_WRITE_ADDED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```
