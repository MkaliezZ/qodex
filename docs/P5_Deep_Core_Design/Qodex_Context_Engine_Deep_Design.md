# Qodex Context Engine Deep Design

## 1. Purpose

The Context Engine is responsible for selecting, compressing, ranking, and injecting project context into model prompts.

Its primary goal is:

> Make different models behave consistently inside the same codebase.

This directly addresses the core Qodex problem:

- GPT may prefer one architecture style.
- DeepSeek may prefer another.
- Claude may refactor aggressively.
- Chinese models may follow different conventions.

The Context Engine must prevent style drift by always grounding agents in project rules, architecture decisions, current files, and relevant diffs.

---

## 2. Inputs

The Context Engine receives:

```ts
interface ContextRequest {
  projectId: string;
  taskId: string;
  prompt: string;
  selectedFiles: string[];
  activeSkills: string[];
  activeModelId: string;
  maxTokens: number;
  mode: "fast" | "balanced" | "deep";
}
```

Sources:

1. User prompt
2. Explicit selected files
3. Open files
4. Git diff
5. Project tree
6. Import graph
7. Symbol index
8. Project memory
9. Session memory
10. Skill instructions
11. `.qodex/rules.md`
12. `.qodex/architecture.md`
13. Previous patches
14. Test errors

---

## 3. Output

```ts
interface ContextBundle {
  systemContext: string;
  projectRules: string;
  memoryContext: string;
  skillContext: string;
  fileContexts: FileContext[];
  diffContext?: string;
  tokenUsageEstimate: number;
  omittedFiles: OmittedFile[];
}
```

---

## 4. Ranking Algorithm

Each candidate file receives a score.

```text
score =
  explicitReference * 0.40 +
  recentEdit * 0.15 +
  gitDiff * 0.15 +
  importGraph * 0.10 +
  semanticSimilarity * 0.10 +
  skillWeight * 0.05 +
  testFailure * 0.05
```

### 4.1 Explicit Reference

Highest weight.

Examples:

- User says `src/api/shipment.ts`
- User says “the login page”
- User selects files manually

### 4.2 Recent Edit

Files recently modified by user or agent.

### 4.3 Git Diff

Files currently modified have high priority.

### 4.4 Import Graph

If selected file imports another file, include it if small enough.

### 4.5 Semantic Similarity

Optional after MVP.

Implementation options:

- SQLite FTS first
- Embeddings later
- Hybrid retrieval in v0.5

### 4.6 Skill Weight

Skills may request required file types.

Example:

SEO skill prefers:

- routes
- metadata
- sitemap
- robots
- page components

### 4.7 Test Failure

If a test error mentions a file or symbol, boost it.

---

## 5. Token Budget

Default allocation:

```text
System Instructions: 8%
Project Rules: 12%
Memory: 15%
Skills: 10%
Conversation: 15%
Files: 35%
Diff/Test Errors: 5%
```

For coding tasks:

```text
Files: 50%
Conversation: 10%
Memory: 15%
Rules: 10%
Skills: 10%
Diff: 5%
```

For review tasks:

```text
Diff: 40%
Rules: 20%
Files: 20%
Memory: 10%
Conversation: 10%
```

---

## 6. Context Modes

### Fast Mode

- Selected files only
- Git diff
- Project rules
- No semantic search

### Balanced Mode

- Selected files
- Top-ranked files
- Import neighbors
- Memory

### Deep Mode

- Repository map
- Top-ranked files
- Import graph
- Similar files
- Previous patches
- Test outputs

---

## 7. Repository Map

The repository map is a compact structure.

```ts
interface RepoMap {
  projectId: string;
  rootPath: string;
  files: RepoFileSummary[];
  generatedAt: string;
}

interface RepoFileSummary {
  path: string;
  language?: string;
  exports: string[];
  imports: string[];
  symbols: string[];
  summary?: string;
}
```

This is not full code. It is a map for navigation.

---

## 8. Chunk Strategy

### Code Files

Chunk by symbol boundaries:

- function
- class
- interface
- route handler
- component
- schema definition

Fallback:

- 150-300 lines per chunk

### Docs

- 500-1500 tokens per chunk

### Config

Include whole file if small.

### Lock Files

Ignore unless explicitly requested.

---

## 9. Ignore Rules

Default ignore:

```text
.git
node_modules
dist
build
coverage
.next
.nuxt
.turbo
vendor
*.lock
pnpm-lock.yaml
package-lock.json
yarn.lock
```

Exception:

- Package lock can be included when dependency issue is detected.

---

## 10. Style Consistency Layer

Always inject project rules before task context.

Priority:

1. Qodex system policy
2. Security policy
3. Project rules
4. Architecture decisions
5. Skills
6. User task
7. Retrieved files

Example `.qodex/rules.md`:

```md
# Project Rules

- Use TypeScript strict mode.
- Do not introduce Redux.
- Use existing service layer.
- Do not change database schema unless explicitly requested.
- Keep API response format stable.
```

---

## 11. Anti-Drift Rules

Before any model writes code, inject:

```text
Follow existing project architecture.
Do not introduce new patterns unless explicitly requested.
Prefer local consistency over model preference.
Do not rename public APIs without approval.
Do not modify database schema without approval.
```

---

## 12. MVP Implementation Plan

### Phase 1

- Manual selected files
- File tree
- Git diff
- Rules injection

### Phase 2

- Repository map
- Import graph
- Recent edit tracking

### Phase 3

- SQLite FTS
- Symbol extraction
- Context compression

### Phase 4

- Embeddings
- Hybrid retrieval
- Multi-agent shared context

---

## 13. Acceptance Criteria

Context Engine is acceptable when:

- It never loads full repository by default.
- It prioritizes user-selected files.
- It includes project rules in every task.
- It includes Git diff in review tasks.
- It tracks omitted files.
- It estimates token usage.
- It produces stable output across models.
