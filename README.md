# Qodex

> Desktop-first, multi-model, skill-enabled, MCP-compatible, diff-first AI coding agent.

**Core philosophy:** Codex Workflow, Any Model, Skills Included.

Qodex is NOT a chatbot wrapper, NOT an IDE replacement, and NOT OpenAI-only.

---

## Quick Start

```
pnpm install
pnpm dev
```

Requirements: Node.js 18+, pnpm, Rust (for Tauri).

---

## Reading Order

Before development, read in this order:

1. `docs/P0_Project_Definition/Qodex_Agent_Startup_Guide.md` — Start here
2. `docs/P0_Project_Definition/` — PRD, Roadmap, Product Requirements
3. `docs/P1_Architecture/` — System Architecture
4. `docs/P2_Engineering_Pack/` — Engineering specs (Provider SDK, Agent Runtime, etc.)
5. `docs/P4_Core_Protocols/` — Core protocols (Context, Memory, Security, etc.)
6. `qodex/rules.md` — Project rules
7. `qodex/memory.md` — Session memory
8. `qodex/adr/` — Architecture Decision Records

---

## Repository Structure

```
qodex/               — AI agent workspace (rules, memory, ADRs)
docs/                — All documentation, organized by category
  P0_Project_Definition/   — PRD, roadmap, startup guide
  P1_Architecture/         — System architecture, tech stack
  P2_Engineering_Pack/    — Engineering implementation specs
  P3_Source_of_Truth/     — Database schema, API contracts, DSL
  P4_Core_Protocols/      — Context, multi-agent, memory, security
  P5_Deep_Core_Design/    — Deep design documents
  P6_UI_System/           — UI design blueprints, components
  P7_Runtime_Specs/       — Runtime compatibility, tool specs
  P8_Agent_Handoff/       — Agent handoff prompts
  assets/                 — Images, diagrams
starter/             — Starter monorepo skeleton (pnpm workspace)
```

See `docs/DOCUMENT_INDEX.md` for a complete file listing.

---

## Development Milestones

| # | Milestone | Status |
|:--|:--|:--:|
| M0 | Repo Setup | ⬜ |
| M1 | Desktop Shell (Tauri + React) | ⬜ |
| M2 | Provider SDK | ⬜ |
| M3 | Agent Runtime | ⬜ |
| M4 | Project Runtime | ⬜ |
| M5 | Diff Engine | ⬜ |
| M6 | Skill Engine | ⬜ |
| M7 | Permission Layer | ⬜ |
| M8 | Git Runtime | ⬜ |
| M9 | MCP Runtime | ⬜ |

---

## License

Proprietary — All rights reserved.
