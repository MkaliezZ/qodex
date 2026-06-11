# Qodex MVP GitHub Issue Backlog

## Milestone 0: Repository Setup

- [ ] Create monorepo
- [ ] Add pnpm workspace
- [ ] Add Tauri desktop app
- [ ] Add shared TypeScript config
- [ ] Add ESLint and Prettier
- [ ] Add basic CI

## Milestone 1: Desktop Shell

- [ ] Build AppShell
- [ ] Build Welcome screen
- [ ] Build Workspace layout
- [ ] Build Left Rail
- [ ] Build Right Context Panel
- [ ] Add routing

## Milestone 2: Provider SDK

- [ ] Define provider interfaces
- [ ] Implement OpenAI provider
- [ ] Implement DeepSeek provider
- [ ] Implement OpenRouter provider
- [ ] Implement Custom OpenAI-compatible provider
- [ ] Add provider settings UI
- [ ] Add connection test

## Milestone 3: Agent Chat

- [ ] Build AgentTimeline
- [ ] Build PromptBar
- [ ] Implement streaming response
- [ ] Persist messages
- [ ] Add task records
- [ ] Add tool call cards

## Milestone 4: Project Runtime

- [ ] Open local folder
- [ ] Store project path
- [ ] Read file tree
- [ ] Search files
- [ ] Select context files
- [ ] Display Git status

## Milestone 5: Diff Workflow

- [ ] Parse patch
- [ ] Validate patch
- [ ] Build DiffViewer
- [ ] Apply patch
- [ ] Reject patch
- [ ] Persist patch history

## Milestone 6: Skill Engine

- [ ] Load `.qodex/skills`
- [ ] Parse `skill.json`
- [ ] Parse `SKILL.md`
- [ ] Implement `$skill-name`
- [ ] Inject skill context
- [ ] Display active skills

## Milestone 7: Permission Layer

- [ ] Implement permission modes
- [ ] Add shell approval modal
- [ ] Add write approval modal
- [ ] Block secrets by default
- [ ] Add audit logs

## Milestone 8: MVP Polish

- [ ] Add loading states
- [ ] Add error states
- [ ] Add empty states
- [ ] Add keyboard shortcuts
- [ ] Package macOS build
