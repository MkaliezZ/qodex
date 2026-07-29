# ADR-022 - Coding Pack Product Integration

**Status:** Proposed
**Date:** 2026-07-29
**Planning base:** `0486704d613ea203672d75bee455346cceafb225`
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
   uses operation-owned staging plus atomic no-overwrite promotion.
7. A dedicated versioned `CodingPackStore` is the sole export lifecycle
   authority. Exported files are the content authority.
8. Session Runtime may reference a verified completed pack with
   `ARTIFACT_CREATED`; it does not own or mirror pack lifecycle.
9. AI summaries are optional, separate, and non-authoritative.

## Deterministic Identity

The pack uses relative paths, SHA-256 source digests, byte counts, UTF-8
encoding, inclusion reasons, exclusion reasons, project fingerprint, purpose,
and selection-rules version.

`sourceFingerprint` hashes the stable canonical source selection.
`manifestDigest` hashes the full canonical manifest instance. `packId` derives
from `sourceFingerprint`. Raw credentials, private roots, home directories, and
absolute export destinations are forbidden in exported or durable metadata.

## Authorization and AgentFuse

Read-only deterministic repository inspection uses ordinary capability and
privacy controls. It must not be sent through AgentFuse merely because the
policy engine exists.

Writing or exporting requires explicit product authorization. Action Runtime is
the proposed provider-neutral in-process contract. Whether AgentFuse supplies a
policy decision for the new export action remains undecided and requires a
separate review. AgentFuse does not select files, summarize content, judge
quality, or certify the absence of secrets.

```text
CODING_PACK_READ_SELECTION_AGENTFUSE_REQUIRED=UNDECIDED_AFTER_AUDIT
CODING_PACK_WRITE_OR_EXPORT_BOUNDARY_REQUIRED=true
PROJECT_COMMAND_FREEZE_CHANGED=false
```

## Persistence

The authoritative future operation sequence is:

```text
PACK_PROPOSED
PACK_CONFIRMED
PACK_EXPORT_STARTED
PACK_EXPORT_COMPLETED
or PACK_EXPORT_INTERRUPTED
```

These are dedicated Coding Pack store states, not Session events. The store
persists identities, status, bounded warnings, and receipts, not source text or
private paths. Started operations never auto-resume after restart. Only a
temporary path carrying the matching operation marker may be inspected or
cleaned.

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
v0.7 implementation started=false
Session schema changed=false
Patch migrated=false
Git migrated=false
MCP migrated=false
arbitrary shell added=false
AgentFuse content-quality judgment added=false
workflow changed=false
CI_NODE20_DEPRECATION_REVIEW_REQUIRED=true
```
