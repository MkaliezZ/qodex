# UX Audit — v0.1.0-alpha

## Scope

Desktop shell interaction audit. Identifies false affordances — UI elements that appear clickable but do nothing.

---

## Audit Results

### ProjectRail — Left Navigation

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Files nav item | Button with hover, `active: true`, no `onClick` | KEEP | Add `activeView` support |
| Sessions nav item | Button with hover, `active: false`, no `onClick` | FIX | Wire to `activeView: "sessions"` |
| Skills nav item | Button with hover, `active: false`, no `onClick` | FIX | Wire to `activeView: "skills"` |
| Git nav item | Button with hover, `active: false`, no `onClick` | FIX | Wire to `activeView: "git"` |
| Settings nav item | Button with hover, `active: false`, no `onClick` | FIX | Wire to `activeView: "settings"` |
| Project header | `No project` subtitle, decorative | KEEP | No change |
| Open Project button | Functional, calls `openProject()` | KEEP | No change |
| File tree toggles | Functional, calls `toggleFileSelection()` | KEEP | No change |
| Footer status dot | Decorative, non-interactive | KEEP | No change |

### ProjectRail — File Tree Area

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Directory nodes | Visual indentation, default cursor | KEEP | Confirm non-interactive cursor |
| File nodes | Pointer cursor, calls `toggleFileSelection` | KEEP | Functional |

### PromptBar — Bottom Bar

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Text input | Functional, dispatches `sendPrompt` | KEEP | No change |
| Run button | Functional, dispatches `sendPrompt` | KEEP | No change |
| Model badge | `cursor: pointer`, dropdown arrow ▼, no `onClick` | FIX | Add placeholder click or remove cursor |
| ⊕ Attach files | `cursor: pointer` via `.qodex-button-secondary`, no `onClick` | FIX | Add `onClick` or use default cursor |
| ⊞ Context selector | `cursor: pointer` via `.qodex-button-secondary`, no `onClick` | FIX | Add `onClick` or use default cursor |
| Skill button / drawer | `cursor: pointer`, renders button, no drawer state | FIX | Wire to minimal SkillDrawer popover |

### AgentTimeline — Center Content

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Header | `Agent Workspace` label, non-interactive | KEEP | No change |
| Streaming text | Read-only display | KEEP | No change |
| Empty state | `Type a prompt and click Run` | KEEP | No change |
| DiffViewer preview | Shows diffs, apply/reject buttons functional | KEEP | No change |

### ContextPanel — Right Sidebar

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Model section | Static text `DeepSeek V4 Pro` | KEEP | Improve readability with dividers |
| Context Sources section | Dynamic, shows source list | KEEP | No change |
| Selected Files section | Dynamic count/size | KEEP | No change |
| Tokens section | Dynamic with progress bar | KEEP | No change |
| Mode section | Static `Review Mode` | KEEP | No change |
| Git section | Static `main · 0 changed` | KEEP | No change |

### SkillDrawer Component

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Skill button | Button renders, no drawer | FIX | Wire minimal popover or disable |

### ModelSwitcher Component

| Component | Behavior | Verdict | Action |
|:--|:--|:--:|:--:|
| Model badge | `cursor: pointer`, ▼ arrow, no `onClick` | FIX | Add click handler or remove cursor |

---

## Summary

| Category | Count |
|:--|:--:|
| KEEP | 14 |
| FIX | 8 |
| REMOVE | 0 |

### False Affordances to Fix

1. Sessions nav → wire to `activeView: "sessions"`
2. Skills nav → wire to `activeView: "skills"`
3. Git nav → wire to `activeView: "git"`
4. Settings nav → wire to `activeView: "settings"`
5. Model badge (ModelSwitcher) → add click or remove pointer cursor
6. ⊕ Attach button → add click or remove pointer cursor
7. ⊞ Context button → add click or remove pointer cursor
8. SkillDrawer → wire minimal popover or add disabled feedback

---

*Generated 2026-06-12 for v0.1.0-alpha UX review.*
