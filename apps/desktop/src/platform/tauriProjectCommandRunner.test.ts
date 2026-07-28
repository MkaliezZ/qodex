import { describe, expect, it, vi } from "vitest";
import { createTauriProjectCommandRunner } from "./tauriProjectCommandRunner";

describe("createTauriProjectCommandRunner", () => {
  it("sends only the hidden root, run ID, and catalog command ID", async () => {
    const invoke = vi.fn().mockResolvedValue({ commandId: "package-script:test", exitCode: 0 });
    const runner = createTauriProjectCommandRunner("/private/project", invoke);
    await runner.run({
      id: "package-script:test",
      label: "pnpm test",
      executable: "pnpm",
      args: ["run", "test"],
      cwd: ".",
      source: "package.json",
      category: "test",
      catalogDigest: "sha256:fixture",
    }, "run-1");

    expect(invoke).toHaveBeenCalledWith("run_project_command", {
      request: {
        runId: "run-1",
        projectRoot: "/private/project",
        commandId: "package-script:test",
        catalogDigest: "sha256:fixture",
      },
    });
    const serialized = JSON.stringify(invoke.mock.calls[0][1]);
    expect(serialized).not.toContain("executable");
    expect(serialized).not.toContain("args");
    expect(serialized).not.toContain("environment");
  });

  it("uses the dedicated cancellation command", async () => {
    const invoke = vi.fn().mockResolvedValue(true);
    const runner = createTauriProjectCommandRunner("/private/project", invoke);
    await runner.cancel?.("run-2");
    expect(invoke).toHaveBeenCalledWith("cancel_project_command", { runId: "run-2" });
  });

  it("coalesces one active native run ID and rejects identity transfer", async () => {
    let resolve!: (value: { commandId: string; exitCode: number }) => void;
    const result = new Promise<{ commandId: string; exitCode: number }>((settle) => {
      resolve = settle;
    });
    const invoke = vi.fn().mockReturnValue(result);
    const runner = createTauriProjectCommandRunner("/private/project", invoke);
    const command = {
      id: "package-script:test",
      label: "pnpm test",
      executable: "pnpm",
      args: ["run", "test"],
      cwd: ".",
      source: "package.json" as const,
      category: "test" as const,
      catalogDigest: "sha256:fixture",
    };

    const first = runner.run(command, "run-duplicate");
    const duplicate = runner.run(command, "run-duplicate");
    await expect(runner.run({
      ...command,
      id: "package-script:build",
      catalogDigest: "sha256:other",
    }, "run-duplicate")).rejects.toThrow("already bound");

    expect(invoke).toHaveBeenCalledTimes(1);
    resolve({ commandId: command.id, exitCode: 0 });
    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { commandId: command.id, exitCode: 0 },
      { commandId: command.id, exitCode: 0 },
    ]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
