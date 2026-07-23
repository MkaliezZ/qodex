# KerniQ Installation Guide

## macOS

### Prerequisites

```bash
# Install Node.js (recommended via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20

# Install pnpm
corepack enable pnpm

# Verify
node --version  # Should be 18+
pnpm --version  # Should be 9+

# Optional: Rust for Tauri
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Install KerniQ

```bash
git clone <repo-url>
cd <repo-directory>
pnpm install
```

### Run

```bash
# Development (browser)
cd apps/desktop && pnpm dev

# Production (Tauri desktop — requires Rust)
cd apps/desktop && pnpm tauri build
```

Agent Mode command execution is available only in the Tauri desktop application.
Commands are limited to discovered project metadata, require approval each time,
and run inside the explicitly selected project. Project scripts are not an OS
sandbox and may have side effects.

### Local Session Data

The Tauri desktop application stores the v0.5 session ledger in
`kerniq-sessions.sqlite3` inside the platform application-data directory for the
existing `com.qodex.desktop` compatibility identifier. On macOS this is normally
`~/Library/Application Support/com.qodex.desktop/`; Windows and Linux use their
platform application-data location. The database is local-only and is not a
cloud backup or cross-device synchronization mechanism.

Private project roots are kept in a separate binding table and are excluded
from redacted session exports. After restart, recovered project actions require
the user to reopen the same project and explicitly approve the action again.
The browser development server uses memory-only session storage, so browser
sessions do not survive a page or process restart.

---

## Windows

### Prerequisites

```powershell
# Install Node.js (download from https://nodejs.org)
# Or via winget:
winget install OpenJS.NodeJS.LTS

# Install pnpm
corepack enable pnpm

# Verify
node --version
pnpm --version

# Optional: Rust for Tauri
# Download from https://www.rust-lang.org/tools/install

# Optional: WebView2 (required for Tauri on Windows)
# Included with Windows 10 (1803+) and Windows 11
```

### Install KerniQ

```powershell
git clone <repo-url>
cd <repo-directory>
pnpm install
```

### Run

```powershell
cd apps/desktop
pnpm dev
```

---

## Linux

### Prerequisites (Ubuntu/Debian)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
corepack enable pnpm

# Tauri dependencies
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libgtk-3-dev libsoup-3.0-dev

# Verify
node --version
pnpm --version
```

### Install KerniQ

```bash
git clone <repo-url>
cd <repo-directory>
pnpm install
```

### Run

```bash
cd apps/desktop && pnpm dev
```

---

## Troubleshooting

### pnpm install fails

```
Error: Cannot find module '@qodex/...'
```

Run from the monorepo root:
```bash
pnpm install
```
This links all workspace packages.

### Vite dev server won't start

Ensure port 1420 is free:
```bash
lsof -ti :1420 | xargs kill -9
```

### Tests fail

```bash
cd packages/<name>
pnpm install  # Ensure package dependencies installed
pnpm test
```

### Tauri build fails

Ensure Rust toolchain is up to date:
```bash
rustup update
```

### Browser showDirectoryPicker not working

This browser-development API requires a secure context; the Tauri desktop app uses its native directory dialog instead:
- Localhost works: http://localhost:1420
- For remote access, HTTPS is required.

---

## Development Quick Reference

```bash
pnpm -r test              # Run all tests
pnpm -r test --watch      # Watch mode
pnpm -r typecheck         # TypeScript type checking
```

See `docs/QUICK_START.md` for the 10-minute quick start guide.
