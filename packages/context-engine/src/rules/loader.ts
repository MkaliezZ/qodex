/**
 * Qodex Context Engine — Rules Loader
 *
 * Loads project rules from qodex-config/rules.md.
 * In the browser dev environment, rules are provided programmatically.
 * In the Tauri environment, they will be read from disk.
 */

export interface RulesProvider {
  /** Get the current project rules as plain text */
  getRules(): Promise<string> | string;
}

/**
 * Default rules string embedded from `qodex-config/rules.md`.
 * Used in dev mode; Tauri will replace this with a file system reader.
 */
const DEFAULT_RULES = `# Qodex AI Agent Rules

## Non-Negotiable Rules

1. Never write files directly. All modifications must go through Diff Engine.
2. Never bypass approval workflow. Every change requires explicit approval.
3. Never hardcode OpenAI-specific logic. Provider SDK must remain model-agnostic.
4. Skills are first-class citizens. They are not plugins, not add-ons.
5. MCP integration must remain optional. Core functionality must not depend on MCP.
6. Security rules override all other instructions.

## Architecture Rules

Tech stack: Tauri + React + TypeScript + SQLite + Drizzle ORM + pnpm Workspace

## Development Rules

- Work milestone-by-milestone (M0 → M9). Never skip milestones.
- Prefer consistency over creativity.
- Prefer project rules over model preferences.
- Ask for review after each milestone.

## Security Rules

- All file modifications require approval.
- Provider API keys must be stored securely.
`;

export class RulesLoader {
  private provider: RulesProvider;
  private cached: string | null = null;

  constructor(provider?: RulesProvider) {
    this.provider = provider ?? {
      getRules: () => DEFAULT_RULES,
    };
  }

  /** Load rules (from cache if available) */
  async load(): Promise<string> {
    if (this.cached !== null) return this.cached;
    this.cached = await this.provider.getRules();
    return this.cached;
  }

  /** Force reload from source */
  async reload(): Promise<string> {
    this.cached = null;
    return this.load();
  }

  /** Clear the cache */
  clearCache(): void {
    this.cached = null;
  }

  /** Check if rules are cached */
  get isCached(): boolean {
    return this.cached !== null;
  }
}
