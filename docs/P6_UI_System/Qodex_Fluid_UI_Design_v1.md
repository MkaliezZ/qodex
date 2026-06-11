# Qodex Fluid UI Design Specification v1.0

## 1. Design Direction

Qodex should feel like:

- Codex Desktop
- Raycast
- Linear
- Arc Browser
- macOS Liquid Glass
- A high-end AI cockpit

The UI should be fluid, calm, focused, and slightly futuristic.

Core visual phrase:

> A liquid-glass coding agent cockpit.

---

## 2. Design Keywords

- Fluid
- Glass
- Soft depth
- Dark elegance
- Smooth motion
- Ambient glow
- Minimal chrome
- High contrast content
- Low friction workflow

Avoid:

- Heavy enterprise dashboard feeling
- Too many borders
- Sharp boxed layouts
- Busy IDE look
- Traditional CLI feeling

---

## 3. Layout

Main layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar                                                      │
├───────────────┬───────────────────────────┬──────────────────┤
│ Project Rail  │ Agent Conversation        │ Context Panel    │
│               │                           │                  │
│ Files         │ Chat / Task Flow          │ Model            │
│ Skills        │ Diff Cards                │ Skills           │
│ Sessions      │ Tool Calls                │ Git              │
│               │                           │ Permissions      │
└───────────────┴───────────────────────────┴──────────────────┘
```

Recommended proportions:

- Left rail: 240px
- Center conversation: flexible
- Right context panel: 320px
- Diff viewer: modal or bottom sheet

---

## 4. Main Screens

## 4.1 Welcome Screen

Purpose:

- Open project
- Select recent project
- Configure model
- Install skills

Visual style:

- Large Qodex logo
- Fluid gradient background
- Floating glass cards
- Minimal CTA

Primary CTA:

```text
Open Local Project
```

Secondary CTA:

```text
Configure Models
Browse Skills
```

---

## 4.2 Workspace Screen

Core areas:

### Left Rail

Sections:

- Current project
- Files
- Sessions
- Skills
- Git
- Settings

Style:

- Translucent glass
- Soft rounded corners
- Hover glow
- Compact icons

### Center Agent Panel

Contains:

- User prompts
- Agent responses
- Tool call cards
- File references
- Patch previews
- Status timeline

The conversation should not look like a normal chatbot.
It should feel like an execution console.

### Right Context Panel

Contains:

- Active model
- Selected skills
- Context files
- Token estimate
- Permission mode
- Git status

---

## 5. Visual System

## 5.1 Color Palette

### Dark Mode First

Background:

```text
#070A12
#0B1020
#101729
```

Glass surfaces:

```text
rgba(255, 255, 255, 0.06)
rgba(255, 255, 255, 0.08)
rgba(255, 255, 255, 0.12)
```

Accent colors:

```text
Electric Blue: #5B8CFF
Violet: #9B5CFF
Cyan: #48D6FF
Mint: #4FFFC2
```

Warning:

```text
Amber: #FFB020
```

Danger:

```text
Red: #FF5C7A
```

Success:

```text
Green: #4DFF9D
```

---

## 5.2 Fluid Gradient

Primary background gradient:

```css
background:
  radial-gradient(circle at 20% 20%, rgba(91, 140, 255, 0.22), transparent 32%),
  radial-gradient(circle at 80% 10%, rgba(155, 92, 255, 0.18), transparent 30%),
  radial-gradient(circle at 60% 90%, rgba(72, 214, 255, 0.14), transparent 36%),
  #070A12;
```

---

## 5.3 Glass Card

```css
.qodex-glass {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.10);
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  border-radius: 24px;
}
```

---

## 5.4 Typography

Recommended:

- Inter
- Geist
- SF Pro
- JetBrains Mono for code

Type scale:

```text
Display: 40 / 48
Title: 24 / 32
Section: 18 / 26
Body: 14 / 22
Caption: 12 / 18
Code: 13 / 20
```

---

## 6. Motion Design

Qodex should feel alive but not distracting.

Use:

- Framer Motion
- Spring transitions
- Soft easing
- Small scale changes
- Sliding panels
- Morphing cards

Motion rules:

```text
Panel open: 180ms
Hover: 120ms
Modal open: 220ms
Task state change: 300ms
Background gradient drift: slow, 20s+
```

Avoid:

- Bouncy cartoon animation
- Fast flashing
- Excessive particles

---

## 7. Key UI Components

## 7.1 Model Switcher

Must be first-class.

Placement:

- Bottom-right of prompt box
- Also visible in right context panel

Example:

```text
DeepSeek V4 Pro ▼
```

Dropdown groups:

```text
Recommended
- GPT-5.5 Codex
- Claude Sonnet
- DeepSeek V4

China Models
- Qwen
- GLM
- MiniMax
- Xiaomi MiMo
- Kimi

Aggregators
- OpenRouter
- SiliconFlow

Local
- Ollama
- LM Studio

Custom
- Add Provider
```

---

## 7.2 Skill Drawer

Visual:

- Cards with icons
- Skill name
- Description
- Permission badges

Example:

```text
$code-review
Review code consistency and safety.
Permissions: Read files
```

Skill states:

- Installed
- Active
- Suggested
- Needs permission

---

## 7.3 Tool Call Card

Tool calls should be visible.

Example:

```text
Reading files
src/api/shipment.ts
src/db/schema.ts
```

Risk badges:

- Low
- Medium
- High

High-risk actions require approval.

---

## 7.4 Diff Viewer

Must be beautiful and clear.

Features:

- Side-by-side diff
- Inline comments
- Apply / Reject buttons
- File-by-file navigation
- Summary of changed files

Visual style:

- Monaco Editor
- Glass modal shell
- Sticky action bar

---

## 7.5 Prompt Box

The prompt box is the command center.

Features:

- Multi-line input
- Model switcher
- Skill quick insert
- Context file picker
- Permission mode selector

Example:

```text
Ask Qodex to modify your project...
[$ Skill] [Files] [Model: DeepSeek] [Run]
```

---

## 8. Permission UX

Modes:

```text
Safe Mode
- Read only
- No file write
- No shell

Review Mode
- Generate diff
- User approves write

Agent Mode
- Can run approved tools
- Still requires risky confirmations
```

Default:

```text
Review Mode
```

---

## 9. Empty States

Empty states should be elegant.

Examples:

```text
No project opened.
Open a repository to start building with Qodex.

No skills installed.
Add your first skill to teach Qodex a workflow.

No model configured.
Connect OpenAI, DeepSeek, OpenRouter, or a custom provider.
```

---

## 10. Brand Identity

Name:

```text
Qodex
```

Logo idea:

- Letter Q
- Fluid ring
- Inner code cursor
- Gradient glass effect

Icon style:

- Rounded
- Dark glass base
- Blue-violet fluid highlight

---

## 11. MVP UI Checklist

v0.1 must include:

- Welcome screen
- Project workspace
- Agent chat
- Prompt box
- Model switcher
- Provider settings
- Skill drawer
- Diff viewer
- Permission modal
- Settings page

---

## 12. Product Feel

Qodex should feel like:

```text
A calm but powerful AI engineer sitting inside a liquid-glass desktop cockpit.
```

The UI must make users feel:

- In control
- Safe
- Fast
- Focused
- Technically powerful
