import { describe, it, expect } from "vitest";
import { PatchValidator } from "../src/validation/validator.js";
import type { PatchProposal } from "../src/models/patch.js";

describe("PatchValidator", () => {
  it("passes valid proposal", async () => {
    const validator = new PatchValidator();
    const proposal: PatchProposal = {
      id: "p1",
      taskId: "t1",
      summary: "Fix bug",
      files: [{ path: "test.ts", oldContent: "old", newContent: "new" }],
      createdAt: new Date().toISOString(),
    };
    const conflicts = await validator.validateProposal(proposal);
    expect(conflicts).toHaveLength(0);
  });

  it("detects empty path", async () => {
    const validator = new PatchValidator();
    const proposal: PatchProposal = {
      id: "p1", taskId: "t1", summary: "bad",
      files: [{ path: "", oldContent: "a", newContent: "b" }],
      createdAt: new Date().toISOString(),
    };
    const conflicts = await validator.validateProposal(proposal);
    expect(conflicts.some((c) => c.type === "empty_patch")).toBe(true);
  });

  it("detects no-change patches", async () => {
    const validator = new PatchValidator();
    const proposal: PatchProposal = {
      id: "p1", taskId: "t1", summary: "noop",
      files: [{ path: "same.ts", oldContent: "same", newContent: "same" }],
      createdAt: new Date().toISOString(),
    };
    const conflicts = await validator.validateProposal(proposal);
    expect(conflicts.some((c) => c.type === "empty_patch")).toBe(true);
  });

  it("detects content mismatch with provider", async () => {
    const validator = new PatchValidator({
      readFile: async (path) => {
        if (path === "stale.ts") return "current content";
        throw new Error("not found");
      },
    });

    const conflict = await validator.validateFile("stale.ts", "old content", "new content");
    expect(conflict?.type).toBe("content_mismatch");
  });

  it("detects missing files with provider", async () => {
    const validator = new PatchValidator({
      readFile: async () => { throw new Error("not found"); },
    });
    const conflict = await validator.validateFile("missing.ts", "old", "new");
    expect(conflict?.type).toBe("file_not_found");
  });

  it("validates multiple files", async () => {
    const validator = new PatchValidator();
    const proposal: PatchProposal = {
      id: "p1", taskId: "t1", summary: "multi",
      files: [
        { path: "", oldContent: "a", newContent: "b" },
        { path: "valid.ts", oldContent: "x", newContent: "y" },
      ],
      createdAt: new Date().toISOString(),
    };
    const conflicts = await validator.validateProposal(proposal);
    expect(conflicts).toHaveLength(1); // Only the empty path
  });
});
