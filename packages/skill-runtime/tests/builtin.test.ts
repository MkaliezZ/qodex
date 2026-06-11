import { describe, it, expect } from "vitest";
import { BuiltInDataProvider } from "../src/index.js";

describe("BuiltInDataProvider", () => {
  const p = new BuiltInDataProvider();

  it("lists 3 built-in skills", async () => {
    const ids = await p.listSkills();
    expect(ids).toHaveLength(3);
    expect(ids).toContain("react-review");
    expect(ids).toContain("typescript-refactor");
    expect(ids).toContain("bug-hunter");
  });

  it("loads react-review json", async () => {
    const def = await p.loadJson("react-review");
    expect(def?.name).toBe("React Review");
    expect(def?.enabled).toBe(true);
  });

  it("loads typescript-refactor json", async () => {
    const def = await p.loadJson("typescript-refactor");
    expect(def?.name).toBe("TypeScript Refactor");
  });

  it("loads bug-hunter json (disabled)", async () => {
    const def = await p.loadJson("bug-hunter");
    expect(def?.enabled).toBe(false);
  });

  it("loads react-review markdown", async () => {
    const content = await p.loadMd("react-review");
    expect(content).toContain("React Review");
  });

  it("returns null for unknown skill json", async () => {
    expect(await p.loadJson("ghost")).toBeNull();
  });

  it("returns null for unknown skill md", async () => {
    expect(await p.loadMd("ghost")).toBeNull();
  });
});
