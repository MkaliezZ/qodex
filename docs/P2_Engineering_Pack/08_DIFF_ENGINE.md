# Qodex Diff Engine

## Purpose

All code modification must go through diff approval.

## Flow

```text
Model output
↓
Patch parser
↓
Validation
↓
Diff viewer
↓
User approval
↓
Apply patch
↓
Audit log
```

## Patch Format

Preferred format:

```diff
diff --git a/src/file.ts b/src/file.ts
--- a/src/file.ts
+++ b/src/file.ts
@@
-old
+new
```

## Validation

Before display:

- Ensure file exists or is marked new
- Ensure patch applies cleanly
- Reject patches outside project root
- Reject secret file modification unless approved

## UI

Diff viewer must support:

- Side-by-side mode
- Inline mode
- File list
- Apply all
- Apply selected file
- Reject

## Audit

Every applied patch creates:

- patch record
- audit log
- optional Git diff snapshot
