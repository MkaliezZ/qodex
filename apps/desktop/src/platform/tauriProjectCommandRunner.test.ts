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
    }, "run-1");

    expect(invoke).toHaveBeenCalledWith("run_project_command", {
      request: {
        runId: "run-1",
        projectRoot: "/private/project",
        commandId: "package-script:test",
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
});
