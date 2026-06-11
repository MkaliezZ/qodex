# Qodex Installation Guide

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

### Install Qodex

```bash
git clone <repo-url>
cd Qodex
pnpm install
```

### Run

```bash
# Development (browser)
cd apps/desktop && pnpm dev

# Production (Tauri desktop — requires Rust)
cd apps/desktop && pnpm tauri build
```

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

### Install Qodex

```powershell
git clone <repo-url>
cd Qodex
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

### Install Qodex

```bash
git clone <repo-url>
cd Qodex
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

### showDirectoryPicker not working

This API requires a secure context:
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
