import { describe, it, expect } from "vitest";
import { ProjectMetadataBuilder } from "../src/project/metadata.js";

describe("ProjectMetadataBuilder", () => {
  it("builds metadata from info", () => {
    const builder = new ProjectMetadataBuilder();
    const result = builder.build({
      name: "TestProject",
      fileCount: 150,
      totalSize: 50000,
      selectedFileCount: 3,
      languages: ["TypeScript", "Rust", "Markdown"],
    });

    expect(result).toContain("Project: TestProject");
    expect(result).toContain("Files Indexed: 150");
    expect(result).toContain("Selected Files: 3");
    expect(result).toContain("TypeScript");
    expect(result).toContain("Rust");
  });

  it("handles empty languages", () => {
    const builder = new ProjectMetadataBuilder();
    const result = builder.build({
      name: "Empty",
      fileCount: 0,
      totalSize: 0,
      selectedFileCount: 0,
      languages: [],
    });
    expect(result).toContain("Project: Empty");
    expect(result).not.toContain("Languages:");
  });

  it("builds from index", () => {
    const builder = new ProjectMetadataBuilder();
    const result = builder.buildFromIndex(
      "MyApp",
      {
        rootPath: "/test",
        files: [
          { path: "a.ts", size: 100, language: "typescript", lastModified: 1 },
          { path: "b.ts", size: 200, language: "typescript", lastModified: 2 },
          { path: "c.rs", size: 300, language: "rust", lastModified: 3 },
        ],
        indexedAt: new Date().toISOString(),
      },
      2,
    );

    expect(result).toContain("Project: MyApp");
    expect(result).toContain("Files Indexed: 3");
    expect(result).toContain("Selected Files: 2");
    expect(result).toContain("typescript");
    expect(result).toContain("rust");
  });
});
