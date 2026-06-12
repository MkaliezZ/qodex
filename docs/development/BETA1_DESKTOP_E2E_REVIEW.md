# Beta 1 — Desktop E2E Test Architecture Review

**Date:** 2026-06-12  
**Status:** Pre-Implementation Review  
**Depends On:** Beta 0.1 Provider Integration (Production Approved)

---

## 1. E2E Scope Definition

### Mock-Backed E2E (CI-safe, deterministic)

| # | Test Area | Checks |
|---|---|---|
| 1 | App Launch | Shell renders, 3-column layout visible |
| 2 | Sidebar Navigation | Files/Sessions/Skills/Git/Settings all switch views |
| 3 | Settings View | ProviderSettings component renders |
| 4 | Provider Configuration | Dropdown, masked input, show/hide, connection test |
| 5 | Prompt Input | Text entry, Enter/button submission |
| 6 | Mock Streaming | Response appears in AgentTimeline after send |
| 7 | Mock Fallback | No provider → mock runtime still works |
| 8 | Provider Switching | UI reflects provider change |
| 9 | Model Selection | Models load after connection |
| 10 | Empty States | No project, no session, etc. render |

### Env-Gated Real Provider E2E (requires API keys)

| # | Test Area | Env Var |
|---|---|---|
| 11 | Real OpenAI request | `OPENAI_API_KEY` |
| 12 | Real DeepSeek request | `DEEPSEEK_API_KEY` |
| 13 | Real streaming response | `OPENAI_API_KEY` |
| 14 | Real provider switching | Multiple keys |
| 15 | Invalid API key error | None (mock error) |

### Security E2E (always run)

| # | Check |
|---|---|
| 16 | API key input masked default |
| 17 | Show/Hide toggle works |
| 18 | API key not in DOM after blur |
| 19 | localStorage empty of API keys |
| 20 | sessionStorage empty of API keys |
| 21 | Console free of API keys |

### Error Flow E2E (always run)

| # | Check |
|---|---|
| 22 | Connection test failure → error message |
| 23 | Empty prompt → no send |
| 24 | Missing provider → mock fallback works |
| 25 | Provider config cleared → returns to mock |

**Total: ~25-30 E2E tests**

---

## 2. Tooling Review

| Tool | Pros | Cons | Verdict |
|---|---|---|---|
| **Playwright** | Industry standard, screenshots, video, CI-native | Heavy; requires browser launch | ✅ Recommended |
| Vitest browser mode | Same test runner as unit tests | Less mature; fewer debugging tools | ⚠️ Alternative |
| Tauri-specific | Tests within real Tauri window | Slow; complex setup | ❌ Not yet |

### Recommendation: **Playwright**

- Mature, well-documented, CI-friendly
- `page.evaluate()` for React state inspection
- Screenshot/video on failure
- `test.skip()` for env-gated real-provider tests
- Works against Vite dev server (no Tauri needed for web-level tests)

**Dependencies:** `@playwright/test`, `playwright`  
**Test command:** `pnpm --filter desktop e2e` or `npx playwright test`  
**CI:** Run mock-backed tests only; skip real-provider tests when keys absent  
**Local:** Same as CI + optional `OPENAI_API_KEY=sk-... npx playwright test`

---

## 3. Test Architecture

```
apps/desktop/e2e/
├── app-launch.spec.ts            # Shell, layout, nav rendering
├── navigation.spec.ts            # All 5 sidebar views
├── provider-settings.spec.ts     # Dropdown, key input, toggle, connection
├── provider-runtime.spec.ts      # Mock send, streaming, switch
├── mock-fallback.spec.ts         # No provider → mock works
├── security.spec.ts              # Masking, no persistence, no console leak
├── error-flows.spec.ts           # Bad key, timeout, empty prompt
├── env-real-provider.spec.ts     # [ENV-GATED] Real API requests
└── fixtures/
    └── app-harness.ts            # Shared setup: start dev server, navigate
```

### Fixture Strategy

```typescript
// app-harness.ts
export async function setupApp(page: Page) {
  await page.goto("http://localhost:1420");
  await page.waitForSelector("[data-testid='app-shell']");
}
```

### Test ID Strategy

Add `data-testid` attributes to key elements (Phase A of implementation):

| Element | testid |
|---|---|
| App shell root | `app-shell` |
| Provider dropdown | `provider-select` |
| API key input | `api-key-input` |
| Show/Hide toggle | `api-key-toggle` |
| Connection test button | `connection-test-button` |
| Connection status | `connection-status` |
| Model select | `model-select` |
| Model switcher badge | `model-switcher` |
| Prompt input | `prompt-input` |
| Send button | `send-button` |
| Agent timeline | `agent-timeline` |
| Sidebar Files nav | `nav-files` |
| Sidebar Sessions nav | `nav-sessions` |
| Sidebar Settings nav | `nav-settings` |

---

## 4. Provider E2E Strategy

### Level 1 — Mock Provider (CI ✅)

```typescript
test("sends prompt and renders streaming response", async ({ page }) => {
  await page.fill("[data-testid='prompt-input']", "Hello");
  await page.click("[data-testid='send-button']");
  await expect(page.locator("[data-testid='agent-timeline']")).toContainText("Hello");
});
```

### Level 2 — Real Provider (ENV-GATED)

```typescript
test("real OpenAI request", async ({ page }) => {
  const key = process.env.OPENAI_API_KEY;
  test.skip(!key, "OPENAI_API_KEY not set");

  // Configure provider
  await page.selectOption("[data-testid='provider-select']", "openai");
  await page.fill("[data-testid='api-key-input']", key);
  await page.click("[data-testid='connection-test-button']");
  await expect(page.locator("[data-testid='connection-status']")).toContainText("Connected");

  // Send prompt
  await page.click("[data-testid='nav-files']"); // leave settings
  await page.click("[data-testid='send-button']");

  // Verify real response
  await expect(page.locator("[data-testid='agent-timeline']")).not.toBeEmpty({ timeout: 20000 });
});
```

### Level 3 — Manual Checklist

Documented in the production review; not automated.

---

## 5. UI Testability — Required Selectors

| Selector | Currently Exists | Action Required |
|---|---|---|
| `data-testid='app-shell'` | ❌ | Add to AppShell root div |
| `data-testid='provider-select'` | ❌ | Add to ProviderSettings |
| `data-testid='api-key-input'` | ❌ | Add to ProviderSettings |
| `data-testid='connection-test-button'` | ❌ | Add to ProviderSettings |
| `data-testid='prompt-input'` | ❌ | Add to PromptBar |
| `data-testid='send-button'` | ❌ | Add to PromptBar |
| `data-testid='agent-timeline'` | ❌ | Add to AgentTimeline |
| Sidebar nav buttons | ✅ (button text) | Use existing button text selectors |

**~8 test IDs to add. Minimal production code impact.**

---

## 6. CI Strategy

```yaml
# .github/workflows/e2e.yml (future)
e2e:
  steps:
    - pnpm install
    - pnpm --filter desktop dev &  # start dev server
    - npx playwright test --grep-invert "real-provider"  # mock only
```

- **CI runs:** Mock-backed tests only
- **Cost:** $0 (no API calls)
- **Time:** <2 minutes for ~20 tests
- **Real-provider tests:** Manual or scheduled (never per-PR)
- **Failure handling:** Screenshot + video artifact

---

## 7. Risk Matrix

| Risk | Severity | Mitigation |
|---|---|---|
| Playwright adds build complexity | 🟢 Low | Separate dev dependency; optional |
| Test IDs clutter production DOM | 🟢 Low | `data-testid` is standard; 8 attributes total |
| Real-provider tests incur API cost | 🟡 Medium | Env-gated, short prompts, manual-only |
| Dev server port conflicts | 🟢 Low | Configurable port; cleanup in afterAll |
| Flaky tests from timing | 🟡 Medium | `waitForSelector` with generous timeouts |

---

## 8. Recommendation

### ✅ READY for Beta 1 Desktop E2E Implementation

| Metric | Value |
|---|---|
| Tooling | Playwright |
| Test files | 8 spec files |
| Test count | ~25-30 |
| Production code changes | ~8 `data-testid` attributes |
| Test IDs to add | ~8 |
| CI-enabled | Yes (mock-backed) |
| Real-provider path | Env-gated |
| Blockers | None |

---

*Architecture Review — 2026-06-12*
