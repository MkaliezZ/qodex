import { describe, it, expect } from "vitest";
import { DiffEngine } from "../src/engine.js";

describe("Large / Edge Case Patches", () => {
  it("generates diff for 100+ line file", () => {
    const engine = new DiffEngine();
    const oldLines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const newLines = [...oldLines.slice(0, 50), "inserted", ...oldLines.slice(50)];

    const result = engine.generateDiff({
      path: "big.ts",
      oldContent: oldLines.join("\n") + "\n",
      newContent: newLines.join("\n") + "\n",
    });

    expect(result.additions).toBeGreaterThan(0);
    expect(result.hunks).toBeDefined();
  });

  it("handles complete file replacement", () => {
    const engine = new DiffEngine();
    const diff = engine.generateUnifiedDiff({
      path: "full.ts",
      oldContent: "line1\nline2\nline3\n",
      newContent: "#!/usr/bin/env node\nimport { x } from './y';\n\nconsole.log(x);\n",
    });
    expect(diff).toContain("-line1");
    expect(diff).toContain("+#!/usr/bin/env node");
  });

  it("handles adding content to empty file", () => {
    const engine = new DiffEngine();
    const result = engine.generateDiff({
      path: "new.ts",
      oldContent: "",
      newContent: "// new file\nconst x = 1;\n",
    });
    expect(result.additions).toBeGreaterThan(0);
  });

  it("handles removing all content", () => {
    const engine = new DiffEngine();
    const result = engine.generateDiff({
      path: "remove-all.ts",
      oldContent: "keep\nnothing\n",
      newContent: "",
    });
    expect(result.deletions).toBeGreaterThan(0);
  });

  it("serializes and deserializes complex proposal", () => {
    const engine = new DiffEngine();
    const proposal = engine.createProposal("t1", "Complex change", [
      {
        path: "src/a.ts",
        oldContent: "import { b } from './b';\nconst x = 1;\nexport { x };\n",
        newContent: "import { b } from './b';\nconst x = 2;\nexport { x, y };\nconst y = 3;\n",
      },
      {
        path: "src/b.ts",
        oldContent: "export const z = 0;\n",
        newContent: "export const z = 1;\n",
      },
    ]);
    expect(proposal.files).toHaveLength(2);
  });
});
