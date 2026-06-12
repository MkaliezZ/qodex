# ADR-017 — Registry & Sync Runtime

- **Status:** Accepted
- **Date:** 2026-06-13
- **Depends on:** ADR-015 — Marketplace Foundation

---

## Context

M14 Marketplace Foundation introduced local skill installation with manifests, adapters (Qodex Native, OpenClaw, Claude Code), install/update/remove lifecycle, and version tracking. All installation is local — from directory or zip archive.

There is no remote registry. Users cannot:

- Discover community skills
- Check for skill updates automatically
- Search for available packages
- Publish skills for others
- Receive trust information about publishers

M15 must introduce registry metadata, sync capability, and trust infrastructure to connect the local marketplace to a discoverable ecosystem.

---

## Problem

**Current state:** Skills are installed via local directories. Discovery is manual. Updates require manually downloading new versions.

**Without a registry layer:**

- No remote discovery — users must know skill sources
- No automatic update detection — stale skills silently
- No trust model — all imports are equal, no warnings
- No publishing path — creators cannot distribute easily
- No ecosystem growth — community contributions are invisible

A registry runtime is required to bridge local marketplace operations with remote metadata discovery, sync, and trust.

---

## Decision

### Architecture: Extend Marketplace Runtime

**Option A — New `packages/registry-runtime/`:** Rejected. Registry is too tightly coupled to marketplace concepts (skills, adapters, install/update/remove) to be a standalone runtime. MCP/themes/workflows marketplaces are deferred; creating a separate registry now would be premature abstraction.

**Option B — Module inside `packages/marketplace-runtime/`:** **Selected.** The marketplace already owns discovery, installation, versioning, and storage. Adding a `registry/` module extends this naturally without creating a new package boundary.

### Package Location

```
packages/marketplace-runtime/src/registry/
├── registry.ts        # RegistryRuntime
├── source.ts          # RegistrySource config
├── sync.ts            # SyncEngine
├── cache.ts           # LocalRegistryCache
├── trust.ts           # TrustModel
├── entry.ts           # RegistryEntry + validation
├── search.ts          # SearchIndex
└── events.ts          # Registry events
```

**No new package.** Extends existing `@qodex/marketplace-runtime`.

---

## Registry Data Model

### RegistrySource

```typescript
interface RegistrySource {
  id: string;
  name: string;
  url: string;          // Base URL for registry API
  enabled: boolean;
  priority: number;
  lastSyncAt?: number;
}
```

### RegistryEntry

```typescript
interface RegistryEntry {
  id: string;                    // "react-review"
  name: string;                  // "React Code Review"
  description: string;
  packageType: "skill" | "mcp" | "theme";  // M15 = "skill" only
  latestVersion: string;
  versions: RegistryVersion[];
  publisher: PublisherProfile;
  trust: TrustMetadata;
  compatibility: CompatibilityMetadata;
  tags: string[];
  locales?: Record<string, { name: string; description: string }>;
  createdAt: string;
  updatedAt: string;
}
```

### RegistryVersion

```typescript
interface RegistryVersion {
  version: string;               // "1.2.0"
  manifestUrl: string;
  packageUrl: string;            // Download URL
  checksum: string;              // SHA-256
  changelog?: string;
  compatibility: CompatibilityMetadata;
  publishedAt: string;
  deprecated?: boolean;
}
```

### PublisherProfile

```typescript
interface PublisherProfile {
  id: string;
  name: string;
  type: "individual" | "organization";
  url?: string;
}
```

### TrustMetadata

```typescript
interface TrustMetadata {
  level: "local" | "community" | "verified" | "official" | "blocked";
  verified?: boolean;
  warnings?: string[];
  signatureUrl?: string;         // Future: digital signature
}
```

### CompatibilityMetadata

```typescript
interface CompatibilityMetadata {
  qodexVersion: string;          // ">=0.1.0"
  skillRuntimeVersion?: string;
  platform?: string[];
  requiredCapabilities?: string[];
}
```

---

## Sync Engine

### Lifecycle

```
idle → syncing → completed
idle → syncing → failed
```

### Sync Flow

```
1. Fetch {source.url}/index.json
2. Validate response schema
3. Compare entries with local cache
4. Update cache with new/updated entries
5. Mark removed entries as deprecated in cache
6. Emit events per changed entry
7. Persist updated cache
```

### Behavior

| Operation | Description |
|---|---|
| `sync(sourceId?)` | Full sync from all sources or specific source |
| `checkUpdates(installed)` | Compare installed versions against cache |
| `getUpdateCandidates()` | Return list of { id, installed, available } |
| `autosync` | Not in M15 — manual only |

### Rules

- ❌ Never auto-install after sync
- ❌ Never auto-execute remote content
- ✅ User must explicitly approve updates
- ✅ Sync failures must not corrupt cache
- ✅ Offline: use cached data, show "last synced" timestamp

---

## Trust Model

### Trust Levels

| Level | Display | Install Behavior |
|---|---|---|
| `local` | No badge | Default (user-installed) |
| `community` | "Community" | Normal install |
| `verified` | "✓ Verified" | Normal install |
| `official` | "Official" | Normal install |
| `blocked` | "⚠ Blocked" | **Reject install** |

### Rules

- `blocked` entries cannot be installed
- `community` with warnings shows caution message
- Trust is a display concern; it never blocks manual installs except `blocked`
- Checksum mismatch on download → reject + error
- Publisher unknown → default to `community`

---

## Storage Design

```
~/.qodex/registry/
├── sources.json        # Registry source configurations
├── cache.json          # Local registry index cache
├── sync-state.json     # Per-source sync metadata
```

### Storage Rules

- ❌ Never store API keys
- ❌ Never store provider credentials
- ❌ Never store user secrets
- ❌ Never store executable content
- ✅ Cache TTL: 24 hours default
- ✅ Corrupt cache → reset and re-sync
- ✅ Atomic writes (write to temp, then rename)

---

## Marketplace Integration

```
Registry Runtime          Marketplace Runtime
─────────────────          ───────────────────
discovers remote entries   installs packages
detects updates            removes packages
validates trust            validates manifests
caches metadata            manages adapters
searches index             tracks installed versions
```

### Flow

```
User searches registry → Registry returns entries
User selects entry → Registry resolves version + packageUrl
User approves → Marketplace downloads + installs
                    Marketplace validates manifest
                    Skill Runtime loads skill
```

**Registry finds. Marketplace installs. Skill Runtime executes.** Clear separation.

---

## Security Threat Model

| Threat | Severity | Mitigation |
|---|---|---|
| Registry poisoning (fake entries) | 🔴 High | Schema validation; trust model; URL allowlisting |
| Malicious package metadata | 🔴 High | Manifests validated before install; no code execution |
| Fake publisher identity | 🟡 Medium | Trust levels; "verified" requires explicit |
| Version spoofing | 🟡 Medium | Checksum verification on download |
| Checksum mismatch | 🔴 High | Reject download; clear error |
| Downgrade attack | 🟡 Medium | Display installed vs available version |
| Metadata XSS in Desktop | 🟡 Medium | Sanitize display strings |
| Cache corruption | 🟡 Medium | Atomic writes; corrupt cache auto-reset |
| Install without user approval | 🔴 High | User must explicitly click install |
| Malicious packageUrl | 🔴 High | Allowlist HTTPS origins; reject file:// |

---

## Desktop UI

**Deferred to M15.1.** M15 implements runtime foundation only. Desktop UI (search, update badges, trust indicators) is a separate implementation phase.

---

## Consequences

### Benefits

- Skill ecosystem becomes discoverable
- Update detection prevents stale skills
- Trust model provides safety signals
- Local cache enables offline operation
- Foundation for MCP/themes/workflows marketplaces

### Tradeoffs

- Additional complexity within marketplace-runtime
- Remote data introduces new validation surface
- Sync adds network dependency (with offline fallback)
- Storage grows with registry cache

---

## Future Work

| Milestone | Description |
|---|---|
| M15 | Registry & Sync Runtime (this ADR) |
| M15.1 | Desktop Registry UI (search, badges, update flow) |
| M16 | MCP Marketplace |
| M17 | Theme Marketplace |
| M18 | Workflow Marketplace |

---

## Alternatives Considered

### Option A: New `packages/registry-runtime/`

**Rejected.** Premature abstraction. Registry is specialized to marketplace concepts. MCP/themes/workflows don't need registry yet.

### Option B: Extend marketplace-runtime

**Selected.** Simple, testable, minimal new surface. Registry module is 7 files inside existing package.

### Option C: Desktop-only registry

**Rejected.** Registry metadata is fundamentally a runtime concern — caching, validation, sync state, trust model — not a UI concern.

---

## Decision Outcome

**Proposed.** Pending implementation in M15 — Registry & Sync Runtime (module in `packages/marketplace-runtime/src/registry/`).
