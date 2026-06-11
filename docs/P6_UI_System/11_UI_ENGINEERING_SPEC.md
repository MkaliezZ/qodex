# Qodex UI Engineering Spec

## Design Direction

Qodex UI should feel like:

- macOS native
- Arc Browser
- Linear
- Raycast
- Liquid glass
- AI command cockpit

## Layout

```text
Left Rail | Agent Workspace | Right Context Panel
```

## Required Screens

1. Welcome
2. Open Project
3. Workspace
4. Provider Settings
5. Skills Manager
6. Diff Review
7. Permissions Modal
8. MCP Manager
9. Settings

## Core Components

- AppShell
- ProjectRail
- AgentTimeline
- PromptBar
- ModelSwitcher
- SkillDrawer
- ToolCallCard
- DiffViewer
- ContextPanel
- ProviderSettings
- PermissionDialog

## Visual System

Dark mode first.

Use:

- glass panels
- blurred backgrounds
- soft shadows
- blue/violet/cyan accents
- rounded corners
- smooth transitions

## Prompt Bar

Must include:

- text input
- model switcher
- skill insert
- context selector
- run button

## Model Switcher

Groups:

- Recommended
- China Models
- Aggregators
- Local
- Custom

## Diff Viewer

Must include:

- file list
- side-by-side diff
- apply
- reject
- summary
