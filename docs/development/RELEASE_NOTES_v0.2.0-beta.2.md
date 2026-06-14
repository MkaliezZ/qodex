# KerniQ v0.2.0-beta.2 Release Notes

**Release date:** 2026-06-15

---

## What's New

### 🔁 Qodex renamed to KerniQ

The project has been soft-rebranded from **Qodex** to **KerniQ**. All product-facing metadata, documentation, UI titles, contributor guidance, and public project documents now use the KerniQ name.

### 🎨 KerniQ logo and icon assets

- New KerniQ logo — `docs/assets/kerniq-logo.png` (README)
- Tauri icons — all platform-ready sizes (32×32, 128×128, 128×128@2x, icon.ico, icon.icns)
- Favicon — `kerniq-icon.png`

### 🔧 TypeScript build blockers fixed

Resolved TypeScript compilation errors in `apps/desktop/` that prevented clean builds.

### 🤖 GitHub Actions CI added and passing

- Automated CI pipeline with `install → build → test → whitespace check`
- Passing on the latest commit at release time (subsequent commits trigger independent runs)
- CI badge included in README

### ✅ Build and test pipeline validated

- `pnpm build` — all 14 workspace projects build successfully
- `pnpm test` — **1,210 tests** passing across all packages

### 📋 Beta release readiness audit

A comprehensive audit was completed (`docs/development/KERNIQ_BETA_RELEASE_READINESS_AUDIT.md`) verifying build integrity, CI status, brand migration completeness, icon/logo assets, and remaining Qodex references are safe or deferred.

---

## Compatibility

### Intentional compatibility identifiers (unchanged)

The following legacy identifiers are preserved to avoid breaking existing integrations, package imports, persisted data, and marketplace compatibility:

| Identifier | Location | Reason retained |
|------------|----------|-----------------|
| `@qodex/*` | Package scopes | NPM/workspace import compatibility |
| `.qodex` | Local storage paths | Data migration compatibility |
| `qodexVersion` | Schema/marketplace fields | Marketplace skill compatibility |
| `qodex-native` | Marketplace format identifier | Skill manifest format compatibility |
| `com.qodex.desktop` | Tauri bundle identifier | Desktop integration (Dock, notifications, file associations) |

### Known limitations

- **Source-only prerelease** — this release ships source code only. Prebuilt installers (DMG, MSI, AppImage) are **not included**. Users must build from source using `pnpm install && pnpm build && pnpm tauri build`.
- **Installer/release artifact workflow not yet configured** — no automated CI-based build/packaging/release pipeline. Binary distribution requires manual packaging.
- **Stage 2 namespace rename not included** — CSS class names (`qodex-bg`, `qodex-layout`, `qodex-button`, etc.), Rust binary/module names (`qodex-desktop`, `qodex_desktop_lib`), and repository path (`MkaliezZ/qodex`) remain unchanged. These are deferred to a future cleanup phase.
- **GitHub Actions Node.js deprecation warning** — `actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4` are based on Node.js 20, which will be deprecated on the runner starting 2026-06-16. Update to v5+ or set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to extend compatibility.

---

## Full Changelog

```
0db2be2 brand: rename Qodex to KerniQ
feed0b6 brand: add KerniQ logo and icon assets
1a3c0f1 fix(build): resolve desktop TypeScript blockers
1d112e1 ci: add KerniQ GitHub Actions workflow
3ea1567 ci: install pnpm before setup-node cache
d7f57a5 docs: add KerniQ beta release readiness audit
9052048 docs: prepare KerniQ v0.2.0-beta.2 notes
```

---

*KerniQ — Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.*
