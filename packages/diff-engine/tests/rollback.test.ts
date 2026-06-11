import { describe, it, expect } from "vitest";
import { ApplyEngine } from "../src/apply/engine.js";
import type { PatchProposal } from "../src/models/patch.js";

function mkProp(files: { path: string; oldContent: string; newContent: string }[]): PatchProposal {
  return {
    id: "r1", taskId: "t1", summary: "rollback test",
    files: files.map((f) => ({ path: f.path, oldContent: f.oldContent, newContent: f.newContent })),
    createdAt: new Date().toISOString(),
  };
}

describe("Rollback", () => {
  it("rolls back multiple files", async () => {
    const store = new Map<string, string>([
      ["a.ts", "original a"],
      ["b.ts", "original b"],
    ]);

    const engine = new ApplyEngine({
      readFile: async (p) => store.get(p) ?? "",
      writeFile: async (p, c) => { store.set(p, c); },
    });

    const proposal = mkProp([
      { path: "a.ts", oldContent: "original a", newContent: "modified a" },
      { path: "b.ts", oldContent: "original b", newContent: "modified b" },
    ]);

    await engine.apply(proposal);
    expect(store.get("a.ts")).toBe("modified a");
    expect(store.get("b.ts")).toBe("modified b");

    const results = await engine.rollback(proposal);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(store.get("a.ts")).toBe("original a");
    expect(store.get("b.ts")).toBe("original b");
  });

  it("rollback without prior apply returns error", async () => {
    const engine = new ApplyEngine();
    const proposal = mkProp([{ path: "new.ts", oldContent: "old", newContent: "new" }]);
    const results = await engine.rollback(proposal);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("No rollback data");
  });

  it("in-memory apply tracks for rollback", async () => {
    const engine = new ApplyEngine();
    const written = engine.applyInMemory(mkProp([
      { path: "f.ts", oldContent: "pre", newContent: "post" },
    ]));
    expect(written.get("f.ts")).toBe("post");
  });
});
