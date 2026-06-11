import { describe, it, expect } from "vitest";
import { PatchParser } from "../src/parser/parser.js";

describe("PatchParser", () => {
  const parser = new PatchParser();

  it("parses unified diff text into proposal", () => {
    const diff = `--- a/test.ts\n+++ b/test.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n`;
    const proposal = parser.parse(diff, "t1", "Simple change");
    expect(proposal.taskId).toBe("t1");
    expect(proposal.summary).toBe("Simple change");
    expect(proposal.files).toHaveLength(1);
    expect(proposal.files[0].path).toBe("test.ts");
  });

  it("serializes a proposal back to diff text", () => {
    const proposal = {
      id: "p1", taskId: "t1", summary: "test",
      files: [{ path: "f.ts", oldContent: "a\n", newContent: "b\n" }],
      createdAt: new Date().toISOString(),
    };
    const text = parser.serialize(proposal);
    expect(text).toContain("--- a/f.ts");
    expect(text).toContain("+++ b/f.ts");
    expect(text).toContain("@@");
  });

  it("parses multi-block diffs", () => {
    const proposals = parser.parseMulti(
      ["--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,1 @@\n-x\n+y\n"],
      "t1",
    );
    expect(proposals).toHaveLength(1);
  });
});
