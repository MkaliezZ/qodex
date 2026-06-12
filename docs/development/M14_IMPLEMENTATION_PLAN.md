# M14 Implementation Plan — Marketplace Foundation

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** ADR-015, M14 Architecture Review, M8 Skill Runtime

---

## 1. Package Structure

```
packages/marketplace-runtime/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── runtime/
│   │   └── runtime.ts              # MarketplaceRuntime
│   ├── manifest/
│   │   ├── schema.ts               # Manifest schema + validation
│   │   └── parser.ts               # skill.json parser
│   ├── adapters/
│   │   ├── registry.ts             # AdapterRegistry
│   │   ├── base.ts                 # SkillAdapter interface
│   │   ├── qodex.ts                # QodexNativeAdapter
│   │   ├── openclaw.ts             # OpenClawAdapter
│   │   └── claude-code.ts          # ClaudeCodeAdapter
│   ├── installer/
│   │   └── installer.ts            # Install, remove, update, rollback
│   ├── versioning/
│   │   └── versioning.ts           # SemVer parsing + comparison
│   ├── discovery/
│   │   └── discoverer.ts           # Directory scan + format detection
│   └── models/
│       ├── manifest.ts
│       ├── adapter.ts
│       └── install.ts
└── tests/
    ├── manifest.test.ts
    ├── adapter.test.ts
    ├── installer.test.ts
    ├── updater.test.ts
    ├── versioning.test.ts
    ├── discovery.test.ts
    ├── security.test.ts
    ├── integration.test.ts
    ├── edge.test.ts
    └── load.test.ts
```

---

## 2. Core Interfaces

### 2.1 SkillManifest

```typescript
interface SkillManifestV1 {
  id: string; name: string; description: string;
  version: string; author: string; license: string;
  tags: string[];
  compatibility: { qodex: string; source: "native" | "openclaw" | "claude-code"; };
  locales?: Record<string, { name?: string; description?: string; tags?: string[]; }>;
  homepage?: string; repository?: string; documentation?: string;
  createdAt?: string; updatedAt?: string;
}
```

### 2.2 MarketplaceRuntime

```typescript
class MarketplaceRuntime {
  constructor(options?: { storagePath?: string });

  // Discovery
  discover(dirPath: string): Promise<SkillManifestV1[]>;
  detectFormat(dirPath: string): Promise<string | null>;

  // Installation
  install(dirPath: string): Promise<InstallResult>;
  uninstall(skillId: string): Promise<void>;
  update(skillId: string, dirPath: string): Promise<InstallResult>;

  // Query
  listInstalled(): SkillManifestV1[];
  getInstalled(id: string): SkillManifestV1 | null;
  checkUpdates(): Array<{ id: string; installed: string; available: string }>;

  // Adapters
  registerAdapter(adapter: SkillAdapter): void;
  importExternal(dirPath: string): Promise<SkillManifestV1>;

  // Index
  loadIndex(): Promise<void>;
  saveIndex(): Promise<void>;
}
```

### 2.3 SkillAdapter

```typescript
interface SkillAdapter {
  format: string;
  version: string;
  canHandle(dirPath: string): Promise<boolean>;
  import(dirPath: string): Promise<{ manifest: SkillManifestV1; skillContent: string }>;
}
```

---

## 3. Test Plan

**Target: 100 tests**

| Suite | Tests | Focus |
|---|---|---|
| `manifest.test.ts` | 12 | Validate ID format, SemVer, required fields, oversized |
| `versioning.test.ts` | 8 | Parse, compare, compatibility check |
| `adapter.test.ts` | 10 | Detection + import (native, openclaw, claude-code) |
| `discovery.test.ts` | 8 | Scan dir, format detection, multi-skill dirs |
| `installer.test.ts` | 12 | Full install, remove, duplicate reject, rollback |
| `updater.test.ts` | 8 | Version compare, update, downgrade |
| `security.test.ts` | 10 | Malformed manifest, directory traversal, oversized, no-exec |
| `integration.test.ts` | 10 | End-to-end: discover → install → list → update → remove |
| `edge.test.ts` | 8 | Empty dir, missing files, corrupted skill.json |
| `load.test.ts` | 6 | 100-skill scan, bulk install |
| **Total** | **82** + misc = **~90** | |

---

## 4. Forbidden Changes

- ❌ Modify any M0–M13 package
- ❌ Execute code during import
- ❌ Access network
- ❌ Call MCP Runtime
- ❌ Call Provider SDK
- ❌ Write outside `~/.qodex/skills/`

### What M14 MAY Do

- ✅ Create `packages/marketplace-runtime/`
- ✅ Implement manifest schema + validators
- ✅ Implement 3 adapters (native, openclaw, claude-code)
- ✅ Implement local installer with rollback
- ✅ Implement SemVer versioning
- ✅ Write ~90 tests

---

## 5. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | Manifest schema validates all required fields |
| 2 | SemVer comparison correctly detects version differences |
| 3 | OpenClaw adapter detects and imports OpenClaw skills |
| 4 | Claude Code adapter detects and imports Claude Code skills |
| 5 | Install flow: discover → validate → copy → register |
| 6 | Duplicate skill ID installation rejected |
| 7 | Remove flow: unregister → delete files |
| 8 | Update preserves backup and updates index |
| 9 | Directory traversal blocked (`../` rejected) |
| 10 | No code execution during any adapter operation |
| 11 | ~90 tests passing |
| 12 | No regressions in existing 1105 tests |

---

## 6. Milestone Exit Criteria

M14 is complete when:

- [ ] Package `packages/marketplace-runtime/` exists
- [ ] 3 adapters implemented and tested
- [ ] Install/remove/update lifecycle complete
- [ ] All acceptance criteria met
- [ ] DEVLOG updated
- [ ] ADR-015 status updated to "Accepted"
- [ ] Production review passes
- [ ] No regressions in 1105 existing tests

---

*Implementation Plan — 2026-06-12*
