# M14 Architecture Review — Marketplace Foundation

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Source:** ADR-015 — Marketplace Foundation

---

## 1. Marketplace Runtime Ownership

### Owns ✅

| Concern | Description |
|---|---|
| **Skill discovery** | Scan directories, detect formats, list available skills |
| **Skill manifests** | Parse and validate `skill.json` against schema |
| **Skill installation** | Install from local directory or zip archive |
| **Skill removal** | Uninstall and clean up skill files |
| **Skill updates** | Compare installed vs available version, trigger update |
| **Version tracking** | Store installed versions, detect update availability |
| **Compatibility adapters** | Import OpenClaw and Claude Code skill formats |
| **Format detection** | Identify skill format via file presence check |
| **Metadata normalization** | Transform external formats to Qodex manifest |
| **Installation index** | Maintain registry of installed skills with metadata |

### Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| Skill execution | Skill Runtime (M8) |
| MCP execution | MCP Runtime (M9) |
| Provider calls | Provider SDK |
| Agent execution | Agent Runtime → Multi-Agent Runtime |
| Code execution | **NONE — forbidden** |
| Remote registry | Future M15 |
| Auto-installation | **NONE — user-explicit** |
| File writes outside skill dir | **NONE — sandboxed** |

**Boundary rule:** The Marketplace reads and writes metadata. It coordinates skill lifecycle. It never executes code.

---

## 2. Relationship With Skill Runtime

### Boundary

```
Marketplace Runtime (M14)           Skill Runtime (M8)
─────────────────────────           ──────────────────
Discovers skills                    Loads skills
Installs skill files                Validates skill content
Registers manifest                  Registers in skill registry
Triggers skill reload               Resolves keywords
                                    Injects context
```

### Integration Flow

```
User imports skill from directory
    ↓
Marketplace detects format (OpenClaw, Claude Code, Qodex Native)
    ↓
Adapter normalizes to Qodex manifest + SKILL.md
    ↓
Marketplace validates manifest schema
    ↓
Marketplace copies to skill directory
    ↓
Marketplace registers manifest in installation index
    ↓
Skill Runtime reloads skill list
```

### Dependency Direction

```
Marketplace → Skill Runtime (type import of SkillDefinition)
Marketplace → i18n Runtime   (type import for locale resolution)
```

**One-way.** Skill Runtime has zero knowledge of Marketplace. ✅

---

## 3. Relationship With i18n Runtime

### Localization Scope

| Manifest Field | Localized | Fallback |
|---|---|---|
| `name` | ✅ Via `locales` in manifest | `name` field (en default) |
| `description` | ✅ Via `locales` in manifest | `description` field |
| `tags` | ✅ Via `locales` in manifest | `tags` field |
| `author` | ❌ Not localized | N/A |
| `license` | ❌ Not localized | N/A |

### Resolution

```
Marketplace.getSkillDisplay("react-review")
  → reads skill.json locales[activeLocale]
  → fallback to manifest.name if locale missing
  → returns { name, description, tags }
```

---

## 4. Manifest Architecture

### Schema

```typescript
interface SkillManifestV1 {
  id: string;                          // "react-review" (kebab-case, unique)
  name: string;                        // "React Code Review"
  description: string;                 // One-line description
  version: string;                     // "1.2.0" (SemVer)
  author: string;                      // "community"
  license: string;                     // "MIT" (SPDX)
  tags: string[];                      // ["react","review","frontend"]
  compatibility: {
    qodex: string;                     // ">=0.1.0"
    source: "native" | "openclaw" | "claude-code";
  };
  locales?: Record<string, {
    name?: string;
    description?: string;
    tags?: string[];
  }>;
  homepage?: string;
  repository?: string;
  documentation?: string;
  createdAt?: string;
  updatedAt?: string;
}
```

### Validation Rules

| Rule | Check |
|---|---|
| `id` matches `^[a-z0-9-]+$` | ✅ Required |
| `version` is valid SemVer | ✅ Required |
| `compatibility.qodex` is valid range | ✅ Required |
| `license` is known SPDX identifier | ⚠️ Warn on unknown |
| `tags` max 10 items | ✅ Truncate silently |
| No duplicate `id` in registry | ❌ Reject install |

---

## 5. Adapter Architecture

### Adapter Interface

```typescript
interface SkillAdapter {
  format: string;                       // "openclaw", "claude-code"
  version: string;                      // Adapter version
  canHandle(dirPath: string): Promise<boolean>;
  import(dirPath: string): Promise<{
    manifest: SkillManifestV1;
    skillContent: string;              // SKILL.md content
  }>;
}
```

### Adapters

| Adapter | Format | Detection | Import Strategy |
|---|---|---|---|
| `OpenClawAdapter` | OpenClaw | `SKILL.md` present, no `skill.json` | Extract name/desc from frontmatter |
| `ClaudeCodeAdapter` | Claude Code | `CLAUDE.md` present | Extract instruction blocks |
| `QodexNativeAdapter` | Native | `skill.json` + `SKILL.md` present | Direct import |

### Safety Constraints

- ❌ Adapters never `eval()` or `require()` content
- ❌ Adapters never execute imported files
- ❌ Adapters never create network connections
- ✅ Adapters only read text files and transform metadata
- ✅ Failed adaptation returns error, never corrupts registry

---

## 6. Installation Model

### Lifecycle

```
discovered → validated → installed → active
                                     → update_available
                                     → removed
```

### Operations

| Operation | Description |
|---|---|
| `discover(dirPath)` | Scan directory, detect format |
| `validate(manifest)` | Schema validation, compatibility check |
| `install(dirPath)` | Copy to skill storage, register manifest |
| `uninstall(skillId)` | Remove from storage, unregister |
| `update(skillId, dirPath)` | Replace files, update version |
| `list()` | Return installed skill manifest list |
| `checkUpdates()` | Compare installed vs available |

### Storage: `~/.qodex/skills/`

```
~/.qodex/skills/
├── index.json                  # Installed skill registry
├── react-review/
│   ├── skill.json
│   └── SKILL.md
├── typescript-refactor/
│   ├── skill.json
│   └── SKILL.md
```

No database. No remote storage. Plain JSON + markdown files.

---

## 7. Versioning Model

### Rules

- **Single version per skill** — only one version installed at a time
- **SemVer comparison** — `1.2.0 > 1.1.0` for update detection
- **Compatibility check** — `semver.satisfies(qodexVersion, compatibility.qodex)`
- **Downgrade not blocked** — user can install older versions (no forced upgrades)

### Update Flow

```
installed: 1.0.0
available: 1.2.0  → update available ✅
    ↓
user initiates update
    ↓
backup: 1.0.0 saved to .qodex/skills/.backup/
    ↓
install: 1.2.0 replaces files
    ↓
index updated: version = 1.2.0
```

---

## 8. Security Review

| Risk | Severity | Mitigation |
|---|---|---|
| Malicious manifest (oversized fields) | 🟢 Low | Truncate name to 200 chars, desc to 500 |
| Format spoofing | 🟡 Medium | Content-based detection (file existence, not extension) |
| Adapter code execution | 🔴 High | Adapters only read text; manifest strict JSON parse |
| Directory traversal in install path | 🔴 High | Resolve all paths against storage root; reject `../` |
| Duplicate skill ID installation | 🟡 Medium | Unique ID enforcement; reject on collision |
| Corrupted skill.json (invalid JSON) | 🟡 Medium | Graceful parse error → reject install; no partial state |

---

## 9. Testing Strategy

**Target: 100 tests**

| Suite | Tests | Focus |
|---|---|---|
| `manifest.test.ts` | 12 | Schema validation, required/optional fields, SemVer |
| `adapter.test.ts` | 10 | OpenClaw, Claude Code, native detection + import |
| `installer.test.ts` | 12 | Install, remove, duplicate, rollback |
| `updater.test.ts` | 8 | Version comparison, update, downgrade |
| `versioning.test.ts` | 8 | SemVer parsing, compatibility checking |
| `discovery.test.ts` | 8 | Directory scan, format detection |
| `security.test.ts` | 10 | Oversized, traversal, spoof, code-exec forbidden |
| `integration.test.ts` | 10 | Full install→list→update→remove lifecycle |
| `skill-runtime-integration.test.ts` | 8 | Skill Runtime reload after install |
| `edge.test.ts` | 8 | Empty dir, missing files, unreadable files |
| `load.test.ts` | 6 | 100-skill install, bulk operations |
| **Total** | **100** | |

---

## 10. Recommendation

### ✅ READY for M14 implementation

**Rationale:**

- Builds directly on M8 Skill Runtime — zero new execution concepts
- Clear scope boundary: metadata management, not code execution
- Adapters are text-readers, not code-executors
- Local-only storage model — no network, no registry, no sync
- All 12 existing packages unaffected
- Lowest-risk milestone in the entire M0-M14 plan

---

*Architecture Review — 2026-06-12*
