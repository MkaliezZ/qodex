# Bug Hunter Skill

Analyze code for common bugs, edge cases, and runtime errors.

## Guidelines

- Check for null/undefined access.
- Verify array bounds before indexing.
- Look for race conditions in async code.
- Validate error handling in Promise chains.
- Check for memory leaks in subscriptions/event listeners.
- Verify correct closure variable capture.

## Checklist

- [ ] No potential null reference
- [ ] Error boundaries in async chains
- [ ] Cleanup functions in useEffect
- [ ] Proper Promise error handling
- [ ] No floating Promises
