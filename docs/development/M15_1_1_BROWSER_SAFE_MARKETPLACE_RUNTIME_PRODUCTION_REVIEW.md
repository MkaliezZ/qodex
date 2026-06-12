# M15.1.1 — Browser-Safe Marketplace Runtime — Final Production Review

**Date:** 2026-06-13  
**Reviewer:** Qodex Team  
**Status:** ✅ **PASSED**

---

## 1. Executive Summary

The M15.1 Desktop Registry UI rendered a blank page because `@qodex/marketplace-runtime` root export contained Node.js `fs`-dependent modules (SkillInstaller, Adapters, SkillDiscoverer, LocalRegistryCache) that cannot be resolved in the browser. The fix split the package into browser-safe root exports (`@qodex/marketplace-runtime`) and Node-only exports (`@qodex/marketplace-runtime/node`). Real Chrome smoke test confirms full app rendering with all navigation including Marketplace.

---

## 2. Root Cause — Full Import Chain

```
apps/desktop/src/components/RegistryContext.tsx
  import { RegistryRuntime } from "@qodex/marketplace-runtime"
    ↓ Vite alias resolution
packages/marketplace-runtime/src/index.ts
  → exports RegistryRuntime  ✅ (safe)
  → exports SkillInstaller   ❌ (→ installer.ts → import fs)
  → exports AdapterRegistry  ❌ (→ adapters.ts → import fs)
  → exports SkillDiscoverer  ❌ (→ discoverer.ts → import fs)
    ↓ Vite resolves ALL exports in dev mode
Browser tries to load installer.ts → import { cpSync, mkdirSync } from "fs"
  → fs not available in browser runtime → runtime error → blank screen
```

---

## 3. Fix Timeline

| Commit | Fix | Scope |
|---|---|---|
| `bca4cb9` | Vite alias for `@qodex/marketplace-runtime` | Build config |
| `3e021f4` | Workspace import fix | Desktop registry components |
| `71b9590` | `MemoryRegistryCache` / `LocalRegistryCache` split | Registry cache boundary |
| `9f029f3` | Root `index.ts` browser-safe only; Node modules → `node.ts` | **Package entry point** |

---

## 4. Browser-Safe Root Export

Exports from `@qodex/marketplace-runtime` (root):

| Export | Category | Browser-Safe |
|---|---|---|
| `RegistryRuntime` | Core runtime | ✅ |
| `MemoryRegistryCache` | Cache (in-memory) | ✅ |
| `SourceManager` | Registry sources | ✅ |
| `SyncEngine` | Registry sync | ✅ |
| `SearchIndex` | Search | ✅ |
| `evaluateTrust` / `isBlocked` | Trust | ✅ |
| `validateEntry` | Validation | ✅ |
| `parseVersion` / `compareVersions` | Versioning | ✅ |
| All `Registry*` types | Types | ✅ |

---

## 5. Node-Only Export

Exports from `@qodex/marketplace-runtime/node`:

| Export | Module | Node Dependency |
|---|---|---|
| `LocalRegistryCache` | `cache.node.ts` | `fs` |
| `SkillInstaller` | `installer.ts` | `fs` |
| `AdapterRegistry` | `adapters.ts` | `fs` |
| `QodexNativeAdapter` | `adapters.ts` | `fs` |
| `OpenClawAdapter` | `adapters.ts` | `fs` |
| `ClaudeCodeAdapter` | `adapters.ts` | `fs` |
| `SkillDiscoverer` | `discoverer.ts` | `fs` |
| `MarketplaceRuntime` | `runtime.ts` | `fs` |

---

## 6. Desktop Import Verdict

| Import | Used? | Status |
|---|---|---|
| `import { RegistryRuntime } from "@qodex/marketplace-runtime"` | ✅ | Clean |
| `import type { ... } from "@qodex/marketplace-runtime"` | ✅ | Clean (types only) |
| `import from "@qodex/marketplace-runtime/node"` | ❌ Not used | ✅ Clean |

---

## 7. Chrome Smoke Test — PASS

| Check | Result |
|---|---|
| Three-column dark glassmorphism layout | ✅ |
| Sidebar navigation (Files/Sessions/Skills/Git/Settings/Marketplace) | ✅ |
| Agent Workspace with prompt input and Run button | ✅ |
| Context Panel (Model/Context/Tokens/Mode/Git) | ✅ |
| Marketplace nav item visible | ✅ |
| No blank page | ✅ |
| No `fs` module resolution error | ✅ |
| No React runtime error | ✅ |

---

## 8. Test Results

| Suite | Tests | Result |
|---|---|---|
| marketplace-runtime | 85/85 | ✅ |
| Desktop TypeScript | 0 errors | ✅ |
| Desktop build (Vite) | Compiles | ✅ |
| Full workspace | All passing | ✅ |

---

## 9. Security Audit

| Check | Result |
|---|---|
| No `fs` in browser-safe root export | ✅ |
| No `node:fs` in browser-safe modules | ✅ |
| No dangerouslySetInnerHTML | ✅ |
| No API key exposure | ✅ |
| No auto-install/auto-sync/auto-execute | ✅ |
| Desktop imports only browser-safe path | ✅ |

---

## 10. Known Gaps

| Gap | Target |
|---|---|
| Browser uses `MemoryRegistryCache` (no disk persistence) | Tauri backend integration |
| `package.json` `exports` field not configured | Future |
| Public registry server not implemented | Future |

---

## Final Verdict

## ✅ PASS — Desktop app renders with clean browser-safe marketplace runtime boundary

| 最终提交 |
|---|
| `9f029f3` — restrict root exports to browser-safe modules only |
