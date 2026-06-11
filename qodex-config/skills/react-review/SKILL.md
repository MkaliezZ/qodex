# React Review Skill

Review React components for consistency, performance, and best practices.

## Guidelines

- Use functional components with hooks.
- Prefer TypeScript strict mode.
- Avoid prop drilling — use context or composition.
- Keep components under 200 lines.
- Extract reusable logic into custom hooks.
- Use React.memo only when profiling shows benefit.

## Checklist

- [ ] TypeScript strict mode enabled
- [ ] Props typed with interface
- [ ] No unused imports
- [ ] Hooks follow rules of hooks
- [ ] Side effects isolated in useEffect
- [ ] Event handlers use useCallback when passed as props
- [ ] Expensive computations wrapped in useMemo
