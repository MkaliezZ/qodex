import type { Page } from "@playwright/test";

interface ProjectFixtureState {
  files: Record<string, string>;
  writes: number;
}

interface AgentCommandFixtureState {
  starts: number;
  cancellations: number;
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

export async function readAgentCommandFixture(page: Page): Promise<AgentCommandFixtureState> {
  return page.evaluate(() => ({
    starts: window.__kerniqCommandFixture?.starts ?? 0,
    cancellations: window.__kerniqCommandFixture?.cancellations ?? 0,
  }));
}

export async function installProjectFixture(
  page: Page,
  files: Record<string, string>,
): Promise<void> {
  await page.addInitScript((initialFiles) => {
    const state: ProjectFixtureState = {
      files: { ...initialFiles },
      writes: 0,
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
  }, files);
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
