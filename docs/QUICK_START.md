# Qodex Quick Start Guide

Goal: Running Qodex within 10 minutes.

---

## Requirements

- **Node.js** 18+ (recommended: 20+)
- **pnpm** 9+
- A modern browser (Chrome, Edge, or Firefox)

Optional:
- Rust toolchain (for Tauri desktop build — not required for development)

---

## Step 1: Install

```bash
git clone <repo-url>
cd Qodex
pnpm install
```

This installs all workspace dependencies across 9 packages.

---

## Step 2: Start the Desktop UI

```bash
cd apps/desktop
pnpm dev
```

This starts the Vite dev server on http://localhost:1420.

Open that URL in your browser.

You should see:

```
┌─────────────────────────────────────────────────────┐
│ [Q] Qodex                                           │
│ No project                                          │
│                                                     │
│ Files          │  Agent Workspace          │ Model   │
│ Sessions       │                         │ Context │
│ Skills         │                         │ Files   │
│ Git            │   Type a prompt and      │ Tokens  │
│ Settings       │   click Run to start.    │ Mode    │
│                │                          │ Git     │
│ [Open Project] │                         │         │
│ Ready          │  ┌──────────────────┐   │         │
│                │  │ Diff Preview     │   │         │
│                │  │ No changes.      │   │         │
│                │  └──────────────────┘   │         │
│                │  [Input ________________] [▶ Run] │
└─────────────────────────────────────────────────────┘
```

---

## Step 3: Run Tests

```bash
pnpm -r test
```

This runs all tests across all packages. Expected: 887+ tests passing.

---

## Step 4: Open a Project (Browser)

Click "Open Project" in the left sidebar.

Select any local directory from the file picker dialog.

The file tree will appear in the left panel.

---

## Step 5: Your First Prompt

Select a file from the tree (e.g., `README.md`).

Type a prompt in the input bar:

```
Explain this project structure
```

Click "Run" or press Enter.

Qodex will process the prompt through:
1. ContextEngine (Rules + Memory + Metadata + selected files)
2. AgentRuntime (task lifecycle)
3. MockStreamingProvider (streams a pre-defined response)

You'll see the response stream live in the Agent Workspace.

---

## Step 6: Working with Patches

After files are selected, Qodex generates a patch proposal in the Diff Viewer.

- Click "Apply" to apply the changes
- Click "Reject" to discard
- Navigate to "Diff Preview" to review all changes

---

## What's Next?

- `docs/INSTALLATION.md` — Full setup for MacOS/Windows/Linux
- `docs/ARCHITECTURE.md` — Understanding the system
- `docs/development/DEVLOG.md` — Development history
