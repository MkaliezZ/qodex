# ADR-015 — Marketplace Foundation

- **Status:** Accepted
- **Date:** 2026-06-12
- **Depends on:** ADR-008 — Skill Runtime, ADR-013 — Execution Graph Runtime

---

## Context

Qodex now provides the complete core runtime infrastructure:

- Provider SDK (M2)
- Agent Runtime (M3)
- Project Runtime (M4)
- Context Engine (M5)
- Diff Engine (M6)
- Git Runtime (M7)
- Skill Runtime (M8)
- MCP Runtime (M9)
- Multi-Agent Runtime (M10)
- Planning Runtime (M11)
- Execution Graph Runtime (M12)
- Internationalization Runtime (M13)

All 12 packages are tested (1105/1105 passing), documented, and production-approved.

However, there is no ecosystem layer. Users cannot discover, install, update, share, or import community skills. Skills are bundled locally with no manifest standard, no version management, and no compatibility layer.

The next milestone must introduce an ecosystem foundation to enable skill distribution, discovery, and interoperability.

---

## Problem

**Current state:**

- Skills are hardcoded in the desktop app (`SkillsView.tsx` contains inline definitions)
- Discovery is manual — users must know skill names
- Installation is not supported — no file import or directory loading
- No version management — skills lack version numbers
- No manifest standard — no formal `skill.json` schema
- No compatibility layer — cannot import OpenClaw or Claude Code skills

**As Qodex grows, users will need:**

- Reusable, shareable skills
- Community skill contributions
- Version tracking and update detection
- Import/export between instances
- Compatibility with existing skill ecosystems

A marketplace architecture is required.

---

## Scope Decision

Three options were evaluated:

| Option | Scope | Risk | Value |
|---|---|---|---|
| A — Skills Only | Skill manifest, discovery, install, compat | 🟢 Low | 🟢 High |
| B — Skills + MCP | Option A + MCP tool marketplace | 🟡 Medium | 🟡 Medium |
| C — Full | Option B + Themes + Workflows | 🔴 High | 🟡 Medium |

### Decision: **Option A — Skills Only**

**Rationale:**

- Skill Runtime (M8) already provides loading, validation, and context injection — the marketplace builds directly on existing architecture
- Lowest implementation risk — skills are markdown + metadata, no executable content
- Immediate ecosystem value — users can share, discover, and import skills immediately
- Allows future expansion — MCP marketplace, theme marketplace, and workflow marketplace can be added later without redesign

**Explicitly deferred:**

- ❌ MCP marketplace (complex — tools have permission implications)
- ❌ Theme marketplace (orthogonal concern)
- ❌ Workflow marketplace (depends on M11/M12 maturity)

---

## Responsibilities

### Marketplace Foundation Owns ✅

| Concern | Description |
|---|---|
| **Skill manifests** | Formal `skill.json` schema for skill metadata |
| **Skill discovery** | Scan local directories, list available skills |
| **Skill installation** | Install from local directory, zip archive |
| **Skill removal** | Uninstall skills, remove from registry |
| **Skill update** | Check installed version against available version |
| **Skill versioning** | Semantic version tracking per skill |
| **Compatibility adapters** | Import OpenClaw and Claude Code skill formats |
| **Format detection** | Identify skill format and route to correct adapter |

### Marketplace Foundation Does NOT Own ❌

| Concern | Delegated To |
|---|---|
| Skill execution | Skill Runtime (M8) |
| MCP execution | MCP Runtime (M9) |
| Provider calls | Provider SDK |
| Code execution | **NONE — forbidden for marketplace** |
| Remote marketplace server | Future M15 |
| Auto-installation | **NONE — must be user-explicit** |

---

## Supported Skill Formats

### Native Format

```
qodex-skill/
├── skill.json          # Manifest (required)
├── SKILL.md            # Skill definition (required)
└── assets/             # Optional bundled assets
```

### Compatibility Format — OpenClaw

```
openclaw-skill/
├── SKILL.md
└── (other files...)
```

**Adapter behavior:** Extract `name` and `description` from SKILL.md frontmatter. Generate manifest with `compatibility` flag. Import into Qodex skill registry.

### Compatibility Format — Claude Code

```
claude-skill/
├── CLAUDE.md
└── (other files...)
```

**Adapter behavior:** Extract instruction blocks from CLAUDE.md. Wrap in Qodex SKILL.md format. Generate manifest.

---

## Compatibility Layer

### SkillAdapter Interface

```typescript
interface SkillAdapter {
  format: string;
  canHandle(directoryPath: string): Promise<boolean>;
  import(directoryPath: string): Promise<{ manifest: SkillManifest; skill: string }>;
}

interface AdapterRegistry {
  register(adapter: SkillAdapter): void;
  detectFormat(directoryPath: string): Promise<string | null>;
  importSkill(directoryPath: string): Promise<ImportResult>;
}
```

### Constraints

- **Adapters must never execute code** from the imported skill directory
- **Adapters transform metadata only** — they read files and produce Qodex-compatible output
- **Adapters never call providers, MCP, shell, or filesystem writes** outside their sandbox
- **Failed adapters must not corrupt the skill registry**

---

## Skill Manifest Schema

### `skill.json`

```json
{
  "id": "react-review",
  "name": "React Code Review",
  "description": "Review React components for best practices",
  "version": "1.2.0",
  "author": "community",
  "license": "MIT",
  "tags": ["react", "review", "frontend"],
  "compatibility": {
    "qodex": ">=0.1.0",
    "source": "native"
  },
  "locales": {
    "en": { "name": "React Code Review", "description": "Review React components..." },
    "zh-CN": { "name": "React 代码审查", "description": "审查 React 组件..." }
  },
  "homepage": "https://github.com/example/react-review",
  "repository": "https://github.com/example/react-review",
  "documentation": "README.md",
  "createdAt": "2026-06-12T00:00:00Z",
  "updatedAt": "2026-06-12T00:00:00Z"
}
```

### Required Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier (kebab-case) |
| `name` | string | Human-readable name |
| `description` | string | One-line description |
| `version` | string | Semantic version |
| `author` | string | Author identifier |
| `license` | string | SPDX license identifier |
| `compatibility` | object | Qodex version range + source format |

### Optional Fields

| Field | Description |
|---|---|
| `tags` | Search keywords |
| `locales` | Localized name/description |
| `homepage` | Project URL |
| `repository` | Source code URL |
| `documentation` | Documentation file path |

---

## Versioning

### Semantic Versioning (SemVer)

```
MAJOR.MINOR.PATCH

1.0.0 — Initial release
1.1.0 — Backward-compatible new features
2.0.0 — Breaking changes
1.0.1 — Backward-compatible bug fixes
```

### Marketplace Tracking

| Field | Source |
|---|---|
| `installed.version` | Local manifest |
| `available.version` | Discovery scan |
| `update.available` | `available > installed` |

---

## Installation Model

### M14: Local Installation Only

| Source | Method |
|---|---|
| Local directory | `installFromPath(dir)` |
| Zip archive | `installFromZip(path)` |
| Git clone | Future (M15+) |
| Remote registry | Future (M15+) |

No remote marketplace server in M14. All installation is local and user-explicit.

---

## Security Constraints

The Marketplace Foundation **MUST NOT:**

- Auto-execute skills on import
- Run arbitrary code from imported directories
- Bypass the Skill Runtime permission model
- Install MCP servers
- Download executable content
- Execute shell commands during import
- Access network during import
- Write to locations outside the Qodex skill directory

**Skill import = metadata extraction + markdown copying only.** The Marketplace Foundation reads manifests and text files. It never executes code.

---

## Relationship to Existing Packages

```
Marketplace Foundation (M14)
    │
    ├──→ Skill Runtime (M8)        — Register imported skills
    └──→ Adapters                  — Format detection + transformation
    ↛ MCP Runtime                  — No relationship
    ↛ Multi-Agent Runtime          — No relationship
    ↛ Provider SDK                 — No relationship
```

**No runtime coupling to execution packages.** The marketplace coordinates skill metadata; execution remains delegated to the Skill Runtime.

---

## Future Expansion

| Milestone | Description |
|---|---|
| M14 | Marketplace Foundation (skills only, this ADR) |
| M15 | Marketplace Registry (remote registry, sync, download) |
| M16 | MCP Marketplace (tool discovery, installation, compatibility) |
| M17 | Theme Marketplace (UI theme distribution) |
| M18 | Workflow Marketplace (execution graph templates) |

---

## Risks

| Risk | Severity | Mitigation | Test Strategy |
|---|---|---|---|
| Incompatible skill formats | 🟡 Medium | Adapter registry with format detection; explicit error on unknown format | Bad-format test; missing manifest test |
| Malicious skill metadata | 🟢 Low | Manifest validation (schema enforcement); no code execution during import | Schema validation test; oversized field test |
| Manifest drift (version mismatch) | 🟡 Medium | Strict SemVer comparison; update-notification | Version comparison test |
| Skill installation corruption | 🟡 Medium | Atomic install (write to temp, then move); rollback on failure | Partial install recovery test |
| Duplicate skill IDs | 🟢 Low | Unique ID enforcement at installation time | Duplicate install test |
| Adapter code execution risk | 🔴 High | Adapters are metadata-only; read-text, never eval; sandboxed | Adapter security audit; code-execution forbidden test |

---

## Success Criteria

| # | Criterion |
|---|---|
| 1 | Manifest schema defined and documented |
| 2 | Versioning strategy defined (SemVer) |
| 3 | Adapter strategy defined (OpenClaw + Claude Code) |
| 4 | Installation model defined (local-only for M14) |
| 5 | Security boundaries defined (no code execution) |
| 6 | Future expansion path documented |
| 7 | Scope limited to skills only |

---

## Related ADRs

- ADR-001 — Monorepo Architecture
- ADR-007 — Skill Runtime
- ADR-008 — MCP Runtime
- ADR-013 — Execution Graph Runtime

---

## Decision Outcome

**Accepted.** Implemented in M14 — Marketplace Foundation (40 tests, 40/40 passing, cross-package total 1145). M14 completes the M0–M14 milestone cycle.

**Scope:** Skills only (Option A). MCP marketplace, themes, and workflows deferred to future milestones.
