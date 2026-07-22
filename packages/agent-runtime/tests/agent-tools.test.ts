import { describe, expect, it } from "vitest";
import { AgentToolRegistry } from "../src/agent-loop/tools.js";
import type { AgentProjectAccess } from "../src/agent-loop/types.js";

function project(files: Record<string, string>, commandExecutionAvailable = true): AgentProjectAccess {
  return {
    listFiles: () => Object.keys(files).map((path) => ({ path, size: files[path].length })),
    readFile: async (path) => {
      if (!(path in files)) throw new Error("not found");
      return files[path];
    },
    commandExecutionAvailable,
  };
}

describe("AgentToolRegistry", () => {
  it("performs bounded literal search with relative paths and line numbers", async () => {
    const registry = new AgentToolRegistry(project({
      "src/a.ts": "one\nDivide here\nthree",
      "src/b.ts": "divide again",
    }));
    const result = await registry.executeReadTool({
      id: "search-1",
      name: "search_files",
      arguments: { query: "divide", maxResults: 1 },
    });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      matches: [{ path: "src/a.ts", line: 2, excerpt: "Divide here" }],
      truncated: true,
    });
  });

  it("reads only a bounded requested line range", async () => {
    const registry = new AgentToolRegistry(project({ "src/a.ts": "one\ntwo\nthree\nfour" }));
    const result = await registry.executeReadTool({
      id: "read-1",
      name: "read_file",
      arguments: { path: "src/a.ts", startLine: 2, endLine: 3 },
    });
    expect(result.data).toMatchObject({
      path: "src/a.ts", content: "two\nthree", startLine: 2, endLine: 3, totalLines: 4,
    });
  });

  it("rejects unsafe paths and invalid argument shapes", async () => {
    const registry = new AgentToolRegistry(project({ "src/a.ts": "one" }));
    const unsafe = await registry.executeReadTool({
      id: "read-unsafe", name: "read_file", arguments: { path: "../secret" },
    });
    const invalid = await registry.executeReadTool({
      id: "search-invalid", name: "search_files", arguments: { query: "one", regex: true },
    });
    expect(unsafe).toMatchObject({ ok: false, code: "unsafe_path" });
    expect(invalid).toMatchObject({ ok: false, code: "invalid_arguments" });
  });

  it("does not read project files that were excluded from the project index", async () => {
    let ignoredRead = false;
    const registry = new AgentToolRegistry({
      listFiles: () => [{ path: "src/a.ts", size: 3 }],
      readFile: async (path) => {
        if (path === ".env") ignoredRead = true;
        return "secret";
      },
      commandExecutionAvailable: false,
    });
    const result = await registry.executeReadTool({
      id: "read-ignored", name: "read_file", arguments: { path: ".env" },
    });
    expect(result).toMatchObject({ ok: false, code: "file_not_found" });
    expect(ignoredRead).toBe(false);
  });

  it("rejects unknown tools without invoking project access", async () => {
    const registry = new AgentToolRegistry(project({}));
    const result = await registry.executeReadTool({ id: "bad", name: "write_file", arguments: {} });
    expect(result).toMatchObject({ ok: false, code: "unknown_tool" });
  });

  it("discovers only safe package and Cargo commands", async () => {
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({
        scripts: {
          test: "vitest",
          "test:unit": "vitest unit",
          build: "vite build",
          deploy: "curl example.test",
          publish: "npm publish",
        },
      }),
      "Cargo.toml": "[package]\nname='fixture'",
    }));
    const result = await registry.executeReadTool({ id: "commands", name: "list_project_commands", arguments: {} });
    const commands = (result.data as { commands: Array<{ id: string }> }).commands.map((command) => command.id);
    expect(commands).toEqual([
      "package-script:build",
      "package-script:test",
      "package-script:test:unit",
      "cargo:test",
      "cargo:check",
    ]);
    expect(commands).not.toContain("package-script:deploy");
    expect(commands).not.toContain("package-script:publish");
  });

  it("resolves commands only by catalog ID", async () => {
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    }));
    const resolved = await registry.resolveCommand({
      id: "run-1", name: "run_project_command", arguments: { commandId: "package-script:test" },
    });
    const unknown = await registry.resolveCommand({
      id: "run-2", name: "run_project_command", arguments: { commandId: "raw:rm" },
    });
    expect(resolved.command).toMatchObject({ executable: "pnpm", args: ["run", "test"], cwd: "." });
    expect(unknown.result).toMatchObject({ ok: false, code: "unknown_command_id" });
  });

  it("reports native commands as unsupported in browser mode", async () => {
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    }, false));
    const resolved = await registry.resolveCommand({
      id: "run-browser", name: "run_project_command", arguments: { commandId: "package-script:test" },
    });
    expect(resolved.result).toMatchObject({ ok: false, code: "command_unavailable" });
  });
});
