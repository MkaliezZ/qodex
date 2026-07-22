import type { Page } from "@playwright/test";

interface ProjectFixtureState {
  files: Record<string, string>;
  writes: number;
}

interface AgentCommandFixtureState {
  starts: number;
  cancellations: number;
}

interface PersistentSessionFixtureState {
  sessions: Record<string, Record<string, unknown>>;
  entries: Record<string, Array<Record<string, unknown>>>;
  bindings: Record<string, Record<string, unknown>>;
}

declare global {
  interface Window {
    __kerniqProjectFixture?: ProjectFixtureState;
    __kerniqCommandFixture?: AgentCommandFixtureState;
  }
}

export async function installAgentCommandFixture(
  page: Page,
  passingFileContent: string,
): Promise<void> {
  await page.addInitScript((passingContent) => {
    const commandState: AgentCommandFixtureState = { starts: 0, cancellations: 0 };
    window.__kerniqCommandFixture = commandState;
    window.__kerniqTestCommandRunner = {
      run: async (command) => {
        commandState.starts += 1;
        const passed = window.__kerniqProjectFixture?.files["src/math.ts"] === passingContent;
        return {
          commandId: command.id,
          approved: true,
          started: true,
          exitCode: passed ? 0 : 1,
          stdout: passed ? "1 test passed" : "AssertionError: expected 12 to be 3",
          stderr: "",
          timedOut: false,
          cancelled: false,
          stdoutTruncated: false,
          stderrTruncated: false,
          durationMs: 5,
        };
      },
      cancel: async () => {
        commandState.cancellations += 1;
      },
    };
  }, passingFileContent);
}

export async function installDelayedAgentCommandFixture(page: Page, delayMs = 5000): Promise<void> {
  await page.addInitScript((delay) => {
    const storageKey = "kerniq-e2e-command-counts";
    if (!sessionStorage.getItem("kerniq-command-fixture-initialized")) {
      localStorage.setItem(storageKey, JSON.stringify({ starts: 0, cancellations: 0 }));
      sessionStorage.setItem("kerniq-command-fixture-initialized", "1");
    }
    const read = (): AgentCommandFixtureState => JSON.parse(localStorage.getItem(storageKey) ?? "{\"starts\":0,\"cancellations\":0}");
    const write = (state: AgentCommandFixtureState) => localStorage.setItem(storageKey, JSON.stringify(state));
    window.__kerniqCommandFixture = read();
    window.__kerniqTestCommandRunner = {
      run: async (command) => {
        const state = read();
        state.starts += 1;
        write(state);
        window.__kerniqCommandFixture = state;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          commandId: command.id,
          approved: true,
          started: true,
          exitCode: 0,
          stdout: "completed",
          stderr: "",
          timedOut: false,
          cancelled: false,
          stdoutTruncated: false,
          stderrTruncated: false,
          durationMs: delay,
        };
      },
      cancel: async () => {
        const state = read();
        state.cancellations += 1;
        write(state);
        window.__kerniqCommandFixture = state;
      },
    };
  }, delayMs);
}

export async function readAgentCommandFixture(page: Page): Promise<AgentCommandFixtureState> {
  return page.evaluate(() => {
    const persisted = localStorage.getItem("kerniq-e2e-command-counts");
    if (persisted) return JSON.parse(persisted) as AgentCommandFixtureState;
    return {
      starts: window.__kerniqCommandFixture?.starts ?? 0,
      cancellations: window.__kerniqCommandFixture?.cancellations ?? 0,
    };
  });
}

export async function installPersistentSessionStore(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const storageKey = "kerniq-e2e-session-ledger";
    if (!sessionStorage.getItem("kerniq-session-store-initialized")) {
      localStorage.removeItem(storageKey);
      sessionStorage.setItem("kerniq-session-store-initialized", "1");
    }
    const empty = (): PersistentSessionFixtureState => ({ sessions: {}, entries: {}, bindings: {} });
    const read = (): PersistentSessionFixtureState => JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify(empty()));
    const write = (state: PersistentSessionFixtureState) => localStorage.setItem(storageKey, JSON.stringify(state));
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    window.__kerniqTestSessionStore = {
      createSession: async (session, firstEntry) => {
        const state = read();
        if (state.sessions[session.id]) throw new Error("Session already exists.");
        state.sessions[session.id] = clone(session) as unknown as Record<string, unknown>;
        state.entries[session.id] = [clone(firstEntry) as unknown as Record<string, unknown>];
        write(state);
      },
      appendEntry: async (entry, mutation) => {
        const state = read();
        const session = state.sessions[entry.sessionId];
        if (!session) throw new Error("Session not found.");
        state.entries[entry.sessionId].push(clone(entry) as unknown as Record<string, unknown>);
        state.sessions[entry.sessionId] = { ...session, ...clone(mutation) };
        write(state);
      },
      getSession: async (id) => clone((read().sessions[id] ?? null) as never),
      listSessions: async () => Object.values(read().sessions).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))) as never,
      listEntries: async (sessionId) => clone((read().entries[sessionId] ?? []) as never),
      deleteSession: async (id) => {
        const state = read();
        const existed = Boolean(state.sessions[id]);
        delete state.sessions[id];
        delete state.entries[id];
        write(state);
        return existed;
      },
      upsertProjectBinding: async (binding) => {
        const state = read();
        state.bindings[binding.bindingId] = clone(binding) as unknown as Record<string, unknown>;
        write(state);
        const { privateRootPath: _, ...safe } = binding;
        return safe;
      },
      getProjectBinding: async (bindingId) => {
        const binding = read().bindings[bindingId];
        if (!binding) return null;
        const { privateRootPath: _, ...safe } = binding;
        return clone(safe) as never;
      },
      verifyProjectBinding: async (bindingId, candidate) => {
        const binding = read().bindings[bindingId];
        return Boolean(binding
          && binding.privateRootPath === candidate.privateRootPath
          && binding.projectFingerprint === candidate.projectFingerprint);
      },
      getPersistenceInfo: async () => ({
        kind: "test",
        persistent: true,
        location: "fixture://kerniq-session-ledger",
        schemaVersion: 2,
        message: "Deterministic reload persistence is active for this Playwright scenario.",
      }),
    };
  });
}

export async function installProjectFixture(
  page: Page,
  files: Record<string, string>,
  options: { persistent?: boolean } = {},
): Promise<void> {
  await page.addInitScript(({ initialFiles, persistent }) => {
    const storageKey = "kerniq-e2e-project-state";
    if (persistent && !sessionStorage.getItem("kerniq-project-fixture-initialized")) {
      localStorage.setItem(storageKey, JSON.stringify({ files: initialFiles, writes: 0 }));
      sessionStorage.setItem("kerniq-project-fixture-initialized", "1");
    }
    const state: ProjectFixtureState = persistent
      ? JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify({ files: initialFiles, writes: 0 }))
      : { files: { ...initialFiles }, writes: 0 };
    const persist = () => {
      if (persistent) localStorage.setItem(storageKey, JSON.stringify(state));
    };
    window.__kerniqProjectFixture = state;

    class TestFileHandle {
      readonly kind = "file";

      constructor(readonly name: string, private path: string) {}

      async getFile() {
        return new File([state.files[this.path] ?? ""], this.name, { type: "text/plain" });
      }

      async createWritable() {
        let replacement = "";
        return {
          write: async (content: string) => { replacement = content; },
          close: async () => {
            state.files[this.path] = replacement;
            state.writes += 1;
            persist();
          },
        };
      }
    }

    class TestDirectoryHandle {
      readonly kind = "directory";

      constructor(readonly name: string, private prefix: string) {}

      async *entries() {
        const children = new Map<string, "file" | "directory">();
        for (const path of Object.keys(state.files)) {
          if (!path.startsWith(this.prefix)) continue;
          const remainder = path.slice(this.prefix.length);
          if (!remainder) continue;
          const [name, ...rest] = remainder.split("/");
          children.set(name, rest.length > 0 ? "directory" : "file");
        }

        for (const [name, kind] of [...children.entries()].sort(([left], [right]) => left.localeCompare(right))) {
          const path = `${this.prefix}${name}`;
          yield [
            name,
            kind === "directory"
              ? new TestDirectoryHandle(name, `${path}/`)
              : new TestFileHandle(name, path),
          ];
        }
      }
    }

    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => new TestDirectoryHandle("kerniq-smoke", ""),
    });
  }, { initialFiles: files, persistent: options.persistent === true });
}

export async function changePersistentProjectFile(page: Page, path: string, content: string): Promise<void> {
  await page.evaluate(({ targetPath, replacement }) => {
    const state = window.__kerniqProjectFixture;
    if (!state) throw new Error("Project fixture is unavailable.");
    state.files[targetPath] = replacement;
    localStorage.setItem("kerniq-e2e-project-state", JSON.stringify(state));
  }, { targetPath: path, replacement: content });
}

export async function readProjectFixture(page: Page): Promise<ProjectFixtureState> {
  return page.evaluate(() => ({
    files: { ...(window.__kerniqProjectFixture?.files ?? {}) },
    writes: window.__kerniqProjectFixture?.writes ?? 0,
  }));
}

export async function configureDeterministicProvider(page: Page, response: string): Promise<void> {
  await page.route("**/chat/completions", async (route) => {
    const chunk = JSON.stringify({ choices: [{ delta: { content: response } }] });
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `data: ${chunk}\n\ndata: [DONE]\n\n`,
    });
  });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.selectOption('[data-testid="provider-select"]', "custom");
  await page.fill('[data-testid="base-url-input"]', "https://kerniq.test/v1");
  await page.fill('[data-testid="api-key-input"]', "test-only-key");
  await page.fill('[data-testid="manual-model-input"]', "deterministic-model");
  await page.getByRole("button", { name: "Agent" }).click();
}
