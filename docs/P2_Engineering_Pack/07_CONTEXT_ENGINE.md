# Qodex Context Engine

## Goal

Select enough context for good coding results without loading the entire repository.

## Inputs

- User prompt
- Current open files
- Selected files
- Git diff
- Project tree
- Skill instructions
- Session memory
- Rules file

## Ranking Signals

1. Explicit file mention
2. Recently edited files
3. Git modified files
4. Import graph relation
5. File name similarity
6. Semantic similarity
7. Skill requirements

## Context Budget

Each model has different context window.

The context engine should calculate:

```text
system instructions
+ skills
+ project summary
+ selected files
+ retrieved snippets
+ conversation
<= budget
```

## Files

Ignore:

- node_modules
- .git
- dist
- build
- coverage
- vendor
- lock files unless requested

## Rules File

Support:

```text
.qodex/rules.md
```

This file stores project coding style and architecture rules.

## MVP

MVP can start with:

- Manual file selection
- File tree search
- Git diff inclusion
- Project summary

Semantic search can be added later.
