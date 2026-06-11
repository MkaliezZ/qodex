import { describe, it, expect } from "vitest";
import { ApplyEngine } from "../src/apply/engine.js";
import type { PatchProposal } from "../src/models/patch.js";

function makeProposal(files: { path: string; oldContent: string; newContent: string }[]): PatchProposal {
  return {
    id: "p1", taskId: "t1", summary: "test",
    files: files.map((f) => ({ path: f.path, oldContent: f.oldContent, newContent: f.newContent })),
    createdAt: new Date().toISOString(),
  };
}

describe("ApplyEngine", () => {
  it("creates preview string", async () => {
    const engine = new ApplyEngine();
    const proposal = makeProposal([{ path: "test.ts", oldContent: "a\n", newContent: "b\n" }]);
    const preview = await engine.preview(proposal);
    expect(preview).toContain("test.ts");
    expect(preview).toContain("Summary:");
  });

  it("applies in memory", () => {
    const engine = new ApplyEngine();
    const proposal = makeProposal([{ path: "f.ts", oldContent: "old", newContent: "new" }]);
    const result = engine.applyInMemory(proposal);
    expect(result.get("f.ts")).toBe("new");
  });

  it("reject does not throw", () => {
    const engine = new ApplyEngine();
    const proposal = makeProposal([{ path: "f.ts", oldContent: "a", newContent: "b" }]);
    engine.reject(proposal);
    // No error = pass
  });

  it("applies with target", async () => {
    const written = new Map<string, string>();
    const engine = new ApplyEngine({
      readFile: async (path) => written.get(path) ?? "",
      writeFile: async (path, content) => { written.set(path, content); },
    });

    const proposal = makeProposal([{ path: "f.ts", oldContent: "old", newContent: "new" }]);
    const results = await engine.apply(proposal);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].path).toBe("f.ts");
  });

  it("rolls back applied patches", async () => {
    const written = new Map<string, string>();
    const engine = new ApplyEngine({
      readFile: async (path) => written.get(path) ?? "original",
      writeFile: async (path, content) => { written.set(path, content); },
    });

    const proposal = makeProposal([{ path: "f.ts", oldContent: "original", newContent: "modified" }]);
    await engine.apply(proposal);
    expect(written.get("f.ts")).toBe("modified");

    const rollbackResults = await engine.rollback(proposal);
    expect(rollbackResults[0].success).toBe(true);
    expect(written.get("f.ts")).toBe("original");
  });

  it("handles apply errors gracefully", async () => {
    const engine = new ApplyEngine({
      readFile: async () => "",
      writeFile: async () => { throw new Error("Permission denied"); },
    });

    const proposal = makeProposal([{ path: "f.ts", oldContent: "a", newContent: "b" }]);
    const results = await engine.apply(proposal);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("Permission denied");
  });
});
