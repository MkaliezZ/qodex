# KerniQ v0.7 Coding Pack Result Review And Freeze

**Date:** 2026-08-02
**Status:** Frozen for review
**v0.7.4.3 merge:** `4b0379e051a15cf49a6a9134f5b73d9f8171231b`

## Result

The selected-file Coding Pack line is implementation-complete for its reviewed
v0.7 boundary. The controlled v0.7.4.4 proof exercised real deterministic
selection, exact confirmation evidence, SQLite lifecycle persistence, pinned
AgentFuse evaluation, retained macOS destination authority, staging,
rename-exclusive promotion, destination sync, and durable completion.

```text
V0_7_CODING_PACK_IMPLEMENTATION_COMPLETE=true
V0_7_CONTROLLED_REAL_NATIVE_PROOF=true
V0_7_CODING_PACK_FROZEN=true
V0_7_NEW_FEATURE_DEVELOPMENT_PAUSED=true
```

Proof details are in
[`kerniq_v0_7_4_4_native_export_proof.md`](kerniq_v0_7_4_4_native_export_proof.md).

## What Is Proven

- Explicitly selected, authorized project files are classified by a bounded
  read plan; byte-independent exclusions occur before reads.
- Portable manifests and source identities are deterministic and exclude local
  authority.
- Current preview, exact confirmation, live proposal and approval, durable
  AgentFuse allow, and native revalidation are required before START.
- The macOS physical writer retains the opened destination directory object,
  performs staging writes and cleanup relative to held handles, promotes with
  no replacement, and requires destination-directory sync before completion.
- A successful controlled run persisted the exact five-event lifecycle and
  exported exact verified bytes through a real SQLite store and real pinned
  AgentFuse bridge.
- Existing target, source drift, unavailable destination, and destination path
  replacement fail without overwrite or redirected writes.
- Completion-persistence and post-promotion-sync uncertainty retain the target,
  remain `export_started`, and never retry automatically.

## What Is Not Proven

- Browser physical export is not implemented.
- Windows physical export is not implemented; it fails closed before START
  because v0.7 has no reviewed handle-relative Windows promotion primitive.
- Automatic repository discovery and `.gitignore` parsing are not implemented.
- Content-secret scanning is not implemented. Filename/path exclusions do not
  prove source content is free of sensitive material.
- Action Runtime export dispatch is not connected and Session schema is
  unchanged.
- AgentFuse invocation is not claimed exactly-once across crashes.
- All-filesystem race-free behavior and identical cross-platform power-loss
  behavior are not claimed.
- Automatic uncertain-export reconciliation, replay, or retry is not
  implemented.
- The controlled fault cases do not claim a real production persistence or
  disk-sync failure occurred.

## Platform And Durability Boundary

macOS is the only v0.7 physical-export platform. Its destination mutation
authority is the retained native directory handle, not path re-resolution
after START. Staging and nested writes use owned handles and no-follow,
create-new semantics. Promotion is handle-relative and no-replace. Completion
requires successful destination-directory `fsync` and then durable SQLite
completion evidence. These guarantees remain subject to the mounted
filesystem and hardware; no broader power-loss claim is made.

Windows and browser mode perform no physical export. There is no path-based,
copy/delete, cross-filesystem, or unsafe Windows fallback.

## Failure And Restart Semantics

- Deny or decision error starts no export and writes no destination object.
- Validation or START-persistence failure before the first write produces zero
  destination writes.
- A pre-promotion write failure may clean only the exact owned staging tree and
  records `PACK_EXPORT_INTERRUPTED` when that evidence can be persisted.
- After promotion, sync or completion-persistence uncertainty never removes the
  final target and never records a false completion or interruption.
- Restart reconstructs historical records only. It never invokes AgentFuse,
  exports, promotes, completes, reconciles, or retries automatically.

## Frozen Boundary

The following remain unchanged:

```text
BROWSER_PHYSICAL_EXPORT=false
AUTOMATIC_REPOSITORY_DISCOVERY=false
CONTENT_SECRET_SCANNING=false
ACTION_RUNTIME_CONNECTED=false
SESSION_SCHEMA_CHANGED=false
AUTOMATIC_UNCERTAIN_EXPORT_RECONCILIATION=false
PROJECT_COMMAND_POLICY_CHANGED=false
PROJECT_COMMAND_POLICY_DIGEST_CHANGED=false
PROJECT_COMMAND_NATIVE_PATH_CHANGED=false
PROJECT_COMMAND_FREEZE_CHANGED=false
PATCH_MIGRATED=false
ARBITRARY_SHELL_ADDED=false
WORKFLOW_CHANGED=false
```

Allowed post-freeze changes are limited to security defects, proof defects,
installation defects, compatibility defects, and real user feedback. New
Coding Pack product features and v0.8 implementation do not begin in this
freeze task.
