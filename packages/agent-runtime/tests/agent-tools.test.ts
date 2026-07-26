import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS,
  AgentToolRegistry,
  createProjectCommandActionParameters,
  PROJECT_COMMAND_POLICY,
  serializeTrustedProjectCommandPolicy,
} from "../src/index.js";
import type {
  AgentProjectAccess,
  TrustedProjectCommandDefinition,
} from "../src/index.js";

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
    const trustedCommands = (result.data as { commands: TrustedProjectCommandDefinition[] }).commands;
    const commands = trustedCommands.map((command) => command.id);
    expect(commands).toEqual([
      "package-script:build",
      "package-script:test",
      "package-script:test:unit",
      "cargo:test",
      "cargo:check",
    ]);
    expect(commands).not.toContain("package-script:deploy");
    expect(commands).not.toContain("package-script:publish");
    expect(trustedCommands.every((command) => command.policy === PROJECT_COMMAND_POLICY)).toBe(true);
    expect(trustedCommands.find((command) => command.id === "cargo:test")?.catalogDigest)
      .toBe("sha256:e028ed42b3fd293042eb5d844b258b77041e773ea835eed28b3b0d3b2b8cdec1");
    expect(trustedCommands.find((command) => command.id === "cargo:check")?.catalogDigest)
      .toBe("sha256:5bdbb4d8a3cbd4e1c33456766931c4e4944702c8060dfff4eb63d6bca1947a04");
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
    expect(resolved.command).toMatchObject({
      id: "package-script:test",
      label: "pnpm test",
      executable: "pnpm",
      args: ["run", "test"],
      cwd: ".",
      source: "package.json",
      category: "test",
      catalogDigest: "sha256:ae6d762cb7a719a1dce25ddc6dc186a432f6f201fca512b63a40242ce83d0ea5",
      policy: PROJECT_COMMAND_POLICY,
    });
    expect(unknown.result).toMatchObject({ ok: false, code: "unknown_command_id" });
  });

  it("uses immutable KerniQ policy metadata that project metadata cannot override", async () => {
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({
        risk: "read",
        approval: "automatic",
        policyProfileId: "project-selected-policy",
        executable: "sh",
        scripts: { test: "vitest" },
        kerniqProjectCommands: {
          test: {
            risk: "read",
            approval: "automatic",
            policyProfileId: "project-selected-policy",
          },
        },
      }),
    }));
    const result = await registry.executeReadTool({
      id: "commands-policy",
      name: "list_project_commands",
      arguments: {},
    });
    const command = (result.data as { commands: TrustedProjectCommandDefinition[] }).commands[0];

    expect(command.policy).toBe(PROJECT_COMMAND_POLICY);
    expect(command.policy).toEqual({
      actionType: "kerniq.project-command.run",
      risk: "process",
      approval: "explicit_once",
      maxTimeoutMs: 120_000,
      policyProfileId: "kerniq-project-command-v1",
    });
    expect(Object.isFrozen(command.policy)).toBe(true);
    expect(() => {
      (command.policy as unknown as { risk: string }).risk = "read";
    }).toThrow(TypeError);
    expect(command.policy.risk).toBe("process");
  });

  it("serializes trusted policy metadata deterministically", () => {
    const expected =
      "{\"actionType\":\"kerniq.project-command.run\",\"risk\":\"process\",\"approval\":\"explicit_once\",\"maxTimeoutMs\":120000,\"policyProfileId\":\"kerniq-project-command-v1\"}";

    expect(serializeTrustedProjectCommandPolicy()).toBe(expected);
    expect(serializeTrustedProjectCommandPolicy(PROJECT_COMMAND_POLICY)).toBe(expected);
  });

  it("keeps the model command schema strict and rejects policy or process fields", async () => {
    const commandTool = AGENT_TOOLS.find((tool) => tool.name === "run_project_command");
    expect(commandTool?.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["commandId"],
      properties: { commandId: { type: "string", minLength: 1 } },
    });

    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    }));
    const result = await registry.resolveCommand({
      id: "model-policy-override",
      name: "run_project_command",
      arguments: {
        commandId: "package-script:test",
        risk: "read",
        approval: "automatic",
        policyProfileId: "model-selected-policy",
        executable: "sh",
      },
    });

    expect(result.command).toBeUndefined();
    expect(result.result).toMatchObject({ ok: false, code: "invalid_arguments" });
  });

  it("constructs narrow immutable action parameters without invoking execution", async () => {
    let nativeRunnerInvocations = 0;
    const nativeRunner = () => {
      nativeRunnerInvocations += 1;
    };
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
    }));
    const resolved = await registry.resolveCommand({
      id: "contract-only",
      name: "run_project_command",
      arguments: { commandId: "package-script:test" },
    });
    const parameters = await createProjectCommandActionParameters({
      command: resolved.command!,
      projectBindingId: "project-0123456789abcdef01234567",
      projectFingerprint: `sha256:${"a".repeat(64)}`,
    });
    const policyDigestBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(serializeTrustedProjectCommandPolicy()),
    );
    const expectedPolicyDigest = `sha256:${[...new Uint8Array(policyDigestBytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;

    expect(parameters).toEqual({
      commandId: "package-script:test",
      catalogDigest: "sha256:ae6d762cb7a719a1dce25ddc6dc186a432f6f201fca512b63a40242ce83d0ea5",
      commandCategory: "test",
      projectBindingId: "project-0123456789abcdef01234567",
      projectFingerprint: `sha256:${"a".repeat(64)}`,
      policyProfileId: "kerniq-project-command-v1",
      policyDigest: expectedPolicyDigest,
    });
    expect(parameters.policyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.keys(parameters)).toEqual([
      "commandId",
      "catalogDigest",
      "commandCategory",
      "projectBindingId",
      "projectFingerprint",
      "policyProfileId",
      "policyDigest",
    ]);
    expect(Object.isFrozen(parameters)).toBe(true);
    expect(parameters).not.toHaveProperty("executable");
    expect(parameters).not.toHaveProperty("args");
    expect(parameters).not.toHaveProperty("environment");
    expect(parameters).not.toHaveProperty("cwd");
    expect(parameters).not.toHaveProperty("timeout");
    expect(parameters).not.toHaveProperty("approval");
    expect(nativeRunner).toBeTypeOf("function");
    expect(nativeRunnerInvocations).toBe(0);

    await expect(createProjectCommandActionParameters({
      command: {
        ...resolved.command!,
        policy: { ...PROJECT_COMMAND_POLICY },
      } as TrustedProjectCommandDefinition,
      projectBindingId: "project-0123456789abcdef01234567",
      projectFingerprint: `sha256:${"a".repeat(64)}`,
    })).rejects.toThrow("trusted KerniQ catalog");
  });

  it("does not attach trusted policy to malformed or unknown catalog entries", async () => {
    const registry = new AgentToolRegistry(project({
      "package.json": JSON.stringify({
        scripts: {
          test: {
            commandId: "test",
            risk: "read",
            approval: "automatic",
            policyProfileId: "model-selected-policy",
            executable: "sh",
          },
        },
      }),
    }));
    const list = await registry.executeReadTool({
      id: "malformed-catalog",
      name: "list_project_commands",
      arguments: {},
    });
    const unknown = await registry.resolveCommand({
      id: "unknown-catalog",
      name: "run_project_command",
      arguments: { commandId: "package-script:test" },
    });

    expect((list.data as { commands: TrustedProjectCommandDefinition[] }).commands).toEqual([]);
    expect(unknown.command).toBeUndefined();
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
