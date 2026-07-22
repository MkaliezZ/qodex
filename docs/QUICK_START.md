# KerniQ Quick Start Guide

Goal: Running KerniQ within 10 minutes.

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
cd <repo-directory>
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
│ [Q] KerniQ                                           │
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

## Step 4: Open a Project

Click "Open Project" in the left sidebar.

Select any local directory from the file picker dialog.

The file tree will appear in the left panel.

- Tauri desktop mode uses the native directory picker and native file access.
- Browser development mode uses the browser File System Access API.

The selected directory is the project access boundary for the current session.
KerniQ may require you to select it again after restarting. Only selected,
existing text files can be replaced through explicit Diff Engine approval;
arbitrary terminal execution and published installer artifacts are not part of
this build.

---

## Step 5: Your First Prompt

Select a file from the tree (e.g., `README.md`).

Type a prompt in the input bar:

```
Explain this project structure
```

Click "Run" or press Enter.

KerniQ will process the prompt through:
1. ContextEngine (Rules + Memory + Metadata + selected files)
2. AgentRuntime (task lifecycle)
3. MockStreamingProvider (streams a pre-defined response)

You'll see the response stream live in the Agent Workspace.

---

## Step 6: Working with Patches

With a provider configured, ask KerniQ to modify one or more selected text files.
When the model returns a valid `KERNIQ_PATCH_V1` proposal, KerniQ validates the
current file contents and shows the exact unified diff in the Diff Viewer.

- Review the summary, changed paths, additions, and removals
- Click "Apply changes" to write and verify the approved replacements
- Click "Reject" to discard the proposal without modifying files
- Click "Rollback" after a successful apply to restore and verify the original contents

Malformed, unsafe, stale, or unsupported proposals are shown as errors and do not
write any files. Rollback data is kept only for the current application session.

---

## Step 7: Agent Mode

With an opened project and a verified OpenAI-compatible provider/model, KerniQ
can inspect the project across multiple bounded model turns. Read-only search and
file reads appear in the Agent timeline and run without approval.

Patches pause at the Diff Viewer. Applying a patch does not approve a command.
When the model requests a trusted test, check, lint, typecheck, or build script,
KerniQ displays the exact cataloged command and pauses again. Deny starts no
process; Approve applies to that execution only. Command output and exit status
are returned to the model so it can propose a corrective patch within hard
iteration limits.

Native command execution requires the Tauri desktop application. Browser mode
supports inspection, approved existing-file patches, and rollback but reports
commands as unavailable. Project scripts are not OS-sandboxed and may have side
effects. KerniQ provides no arbitrary shell or "Always allow" option.

---

## What's Next?

- `docs/INSTALLATION.md` — Full setup for MacOS/Windows/Linux
- `docs/ARCHITECTURE.md` — Understanding the system
- `docs/development/DEVLOG.md` — Development history
