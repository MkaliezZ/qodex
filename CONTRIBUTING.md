# Contributing to Qodex

Thanks for your interest in Qodex!

## Setup

```bash
git clone <repo>
cd Qodex
pnpm install              # Install all workspace dependencies
cd apps/desktop && pnpm dev  # Start the desktop app (Vite dev server)
```

## Development

Qodex is organized as a pnpm monorepo. Each package lives under `packages/` with its own `package.json`, `tsconfig.json`, and test suite.

```bash
pnpm -r test              # Run all tests across all packages
cd packages/<name> && pnpm test  # Run tests for a specific package
```

## Branch Naming

- `feat/<description>` — New features
- `fix/<description>` — Bug fixes
- `docs/<description>` — Documentation
- `chore/<description>` — Maintenance

## Commit Conventions

Follow conventional commits:

```
feat(provider-sdk): add Gemini provider
fix(context-engine): handle empty prompt edge case
docs: update architecture diagram
chore(release): freeze v0.1.0-beta
```

## Pull Request Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run `pnpm -r test` — all tests must pass
4. Submit a PR with a clear description of changes
5. Ensure PR title follows conventional commit format

## Testing Requirements

- All new code must include tests
- All existing tests must continue to pass
- Minimum test coverage: commensurate with existing coverage
- Tests use vitest — no Jest migration

## ADR Process

Significant architectural decisions should be documented as Architecture Decision Records (ADRs) in `qodex-config/adr/`. See existing ADRs for format.

## Code Style

- TypeScript strict mode
- No `any` unless absolutely necessary
- Prefer interfaces over type aliases for object shapes
- Follow existing patterns in the package you're modifying

## Questions?

Open an issue or refer to the documentation in `docs/`.
