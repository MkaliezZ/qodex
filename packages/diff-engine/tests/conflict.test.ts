import { describe, it, expect } from "vitest";
import { DiffEngine } from "../src/engine.js";
import { PatchValidator } from "../src/validation/validator.js";

describe("Conflict Detection", () => {
  it("detects stale content", async () => {
    const validator = new PatchValidator({
      readFile: async () => "current content",
    });
    const conflict = await validator.validateFile("stale.ts", "old content", "new content");
    expect(conflict?.type).toBe("content_mismatch");
  });

  it("detects missing files", async () => {
    const validator = new PatchValidator({
      readFile: async () => { throw new Error("ENOENT"); },
    });
    const conflict = await validator.validateFile("missing.ts", "a", "b");
    expect(conflict?.type).toBe("file_not_found");
  });

  it("detects empty patches", async () => {
    const validator = new PatchValidator();
    const conflict = await validator.validateFile("", "a", "b");
    expect(conflict?.type).toBe("empty_patch");
  });

  it("prevents apply on conflicted proposal", async () => {
    const engine = new DiffEngine({
      readFile: async () => { throw new Error("not found"); },
    });

    const proposal = engine.createProposal("t1", "conflict", [
      { path: "missing.ts", oldContent: "old", newContent: "new" },
    ]);

    const results = await engine.apply(proposal);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("file_not_found");
  });
});
