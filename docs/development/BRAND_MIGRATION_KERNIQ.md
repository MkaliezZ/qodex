# KerniQ Brand Migration

**Date:** 2026-06-15
**Status:** Product-facing rename completed

The product-facing brand has changed from **Qodex** to **KerniQ**. The desktop
UI, application titles, current documentation, contributor guidance, and public
project metadata now use the KerniQ name.

## Compatibility Boundary

The following legacy identifiers remain unchanged to preserve existing package
imports, integrations, persisted local data, and historical accuracy:

- `@qodex/*` package scope
- `qodex-config/` workspace directory
- `qodexVersion` schema fields
- `qodex-native` marketplace format identifier
- `.qodex` local storage paths
- `com.qodex.desktop` Tauri application identifier
- Cargo package and library identifiers
- Historical specifications, ADRs, release notes, tags, and published records

These identifiers must not be globally renamed. Any future migration should use
versioned deprecation, aliases, and explicit data migration where required.

## Administrative Follow-ups

The local repository directory and GitHub repository URL still use the legacy
name. Renaming either is a separate administrative operation and is not part of
this source-level brand migration.
