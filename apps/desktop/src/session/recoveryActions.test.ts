import { describe, expect, it } from "vitest";
import { commandsMatch, recoveredCommand, recoveredPatch } from "./recoveryActions";

describe("recovery action validation", () => {
  it("reconstructs only project-relative patch evidence", () => {
    expect(recoveredPatch({
      actionId: "patch-1",
      taskId: "task-1",
      summary: "Patch",
      createdAt: "2026-01-01T00:00:00Z",
      files: [{ path: "src/a.ts", oldContent: "old", newContent: "new" }],
    })?.files[0].path).toBe("src/a.ts");
    expect(recoveredPatch({ actionId: "patch-1", files: [] })).toBeNull();
  });

  it("blocks a changed command definition", () => {
    const stored = recoveredCommand({
      actionId: "call-1",
      command: {
        id: "package-script:test",
        label: "pnpm test",
        executable: "pnpm",
        args: ["run", "test"],
        cwd: ".",
        source: "package.json",
        category: "test",
        catalogDigest: "sha256:original",
      },
    });
    if (!stored) throw new Error("missing command fixture");
    expect(commandsMatch(stored, { ...stored })).toBe(true);
    expect(commandsMatch(stored, { ...stored, args: ["run", "test:changed"] })).toBe(false);
    expect(commandsMatch(stored, { ...stored, executable: "node" })).toBe(false);
    expect(commandsMatch(stored, { ...stored, catalogDigest: "sha256:changed" })).toBe(false);
  });
});
