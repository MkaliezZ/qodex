# Beta 1 — Desktop E2E Implementation Plan

**Date:** 2026-06-12  
**Status:** Pre-Implementation  
**Depends On:** Beta 0.1 Production Review (Passed)

---

## 1. Tooling Decision

**Playwright** selected. Rationale: industry standard, CI-native, screenshot/video, `page.evaluate()`, maturity.

```bash
pnpm --filter desktop add -D @playwright/test playwright
npx playwright install chromium
```

---

## 2. Production Code Changes (Minimal)

Add `data-testid` attributes to 8 elements:

| File | Element | testid |
|---|---|---|
| `AppShell.tsx` | Root layout div | `app-shell` |
| `ProviderSettings.tsx` | Provider `<select>` | `provider-select` |
| `ProviderSettings.tsx` | API key `<input>` | `api-key-input` |
| `ProviderSettings.tsx` | Show/Hide `<button>` | `api-key-toggle` |
| `ProviderSettings.tsx` | Connection test `<button>` | `connection-test-button` |
| `ProviderSettings.tsx` | Connection status `<span>` | `connection-status` |
| `ProviderSettings.tsx` | Model `<select>` | `model-select` |
| `PromptBar.tsx` | Text `<input>` | `prompt-input` |
| `PromptBar.tsx` | Run `<button>` | `send-button` |
| `AgentTimeline.tsx` | Streaming container | `agent-timeline` |
| `ModelSwitcher.tsx` | Provider badge | `model-switcher` |

**Total: 11 test IDs across 4 files.**

---

## 3. Test File Structure

```
apps/desktop/e2e/
├── app-launch.spec.ts            (3 tests)
├── navigation.spec.ts            (5 tests)
├── provider-settings.spec.ts     (6 tests)
├── provider-runtime.spec.ts      (5 tests)
├── mock-fallback.spec.ts         (3 tests)
├── security.spec.ts              (5 tests)
├── error-flows.spec.ts           (3 tests)
├── env-real-provider.spec.ts     (4 tests) [ENV-GATED]
└── fixtures/
    └── app-harness.ts
```

---

## 4. Test Plan

### app-launch.spec.ts (3 tests)
| # | Test |
|---|---|
| 1 | App shell renders with 3-column layout |
| 2 | Agent workspace header visible |
| 3 | Prompt input and send button visible |

### navigation.spec.ts (5 tests)
| # | Test |
|---|---|
| 4 | Click Files nav → FilesView renders |
| 5 | Click Sessions nav → "Session history coming soon" |
| 6 | Click Skills nav → Skills list renders |
| 7 | Click Git nav → "main" branch visible |
| 8 | Click Settings nav → ProviderSettings renders |

### provider-settings.spec.ts (6 tests)
| # | Test |
|---|---|
| 9 | Provider dropdown has 4 options |
| 10 | API key input is masked (type=password) |
| 11 | Show/Hide toggle changes input type |
| 12 | Connection test shows error for invalid key |
| 13 | Connection status updates on success/failure |
| 14 | Model selector loads after connection |

### provider-runtime.spec.ts (5 tests)
| # | Test |
|---|---|
| 15 | Mock send renders response in timeline |
| 16 | Prompt clears after send |
| 17 | Run button disabled during execution |
| 18 | Provider switch → next task uses new provider |
| 19 | ModelSwitcher reflects current provider |

### mock-fallback.spec.ts (3 tests)
| # | Test |
|---|---|
| 20 | No provider → mock runtime works |
| 21 | API key cleared → mock runtime restored |
| 22 | Mock streaming text appears |

### security.spec.ts (5 tests)
| # | Test |
|---|---|
| 23 | API key input is type=password by default |
| 24 | API key not visible in DOM after configuration |
| 25 | localStorage does not contain API key |
| 26 | sessionStorage does not contain API key |
| 27 | No API key in console (no log/error containing key) |

### error-flows.spec.ts (3 tests)
| # | Test |
|---|---|
| 28 | Empty prompt submit does nothing |
| 29 | Connection test with bad key shows error |
| 30 | Connection test without key shows error |

### env-real-provider.spec.ts (4 tests, ENV-GATED)
| # | Test | Env Var |
|---|---|---|
| 31 | Real OpenAI: configure → connect → prompt → streaming | `OPENAI_API_KEY` |
| 32 | Real DeepSeek: configure → connect → prompt → streaming | `DEEPSEEK_API_KEY` |
| 33 | Real provider switch: OpenAI → DeepSeek | Both keys |
| 34 | Real streaming contains expected content | `OPENAI_API_KEY` |

**Total: 34 tests (30 CI-safe + 4 env-gated)**

---

## 5. Playwright Config

```typescript
// apps/desktop/playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: "http://localhost:1420",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    port: 1420,
    reuseExistingServer: true,
  },
});
```

---

## 6. CI Strategy

| Environment | Tests Run | API Keys |
|---|---|---|
| CI (PR) | Mock-backed only (30 tests) | None |
| CI (main) | Mock-backed only (30 tests) | None |
| Local | All 34 tests (keys optional) | From env |

**Real-provider tests never run in CI.** Cost: $0.

---

## 7. Acceptance Criteria

| # | Criterion |
|---|---|
| 1 | All 30 mock-backed tests pass in CI |
| 2 | All 4 env-gated tests skip cleanly when keys absent |
| 3 | Zero real API key leaks in test output |
| 4 | Screenshots on failure |
| 5 | No production code regression (1145 existing tests green) |
| 6 | Test IDs added to production code (11 total) |

---

## 8. Forbidden

- ❌ Commit API keys
- ❌ Run real-provider tests in CI
- ❌ Modify Provider SDK
- ❌ Modify Agent Runtime
- ❌ Change component behavior for testability

---

*Implementation Plan — 2026-06-12*
