# TypeScript Refactor Skill

Refactor TypeScript code for better type safety and readability.

## Guidelines

- Prefer interfaces over type aliases for object shapes.
- Use discriminated unions for state management.
- Avoid `any` — prefer `unknown` with type guards.
- Extract complex types into named interfaces.
- Use `satisfies` operator for type validation.
- Keep functions pure when possible.

## Checklist

- [ ] No `any` usage
- [ ] Function return types explicit
- [ ] Async functions return proper Promise types
- [ ] Null/undefined handled with proper checks
- [ ] Generic constraints used where appropriate
