import { describe, it, expect } from "vitest";
import { Coordinator } from "../src/index.js";

describe("Agent Report", () => {
  it("report contains findings array", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review");
    expect(Array.isArray(r.findings)).toBe(true);
  });

  it("report contains recommendations array", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Refactor");
    expect(Array.isArray(r.recommendations)).toBe(true);
  });

  it("report contains fileChanges array", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Test");
    expect(Array.isArray(r.fileChanges)).toBe(true);
  });

  it("findings include agent role prefix", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review and refactor");
    const hasPrefix = r.findings.some((f) => f.startsWith("[review]") || f.startsWith("[refactor]"));
    expect(hasPrefix).toBe(true);
  });

  it("report generatedAt is valid date", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("x");
    expect(new Date(r.generatedAt).getTime()).not.toBeNaN();
  });

  it("summary includes prompt excerpt", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Please review the authentication module");
    expect(r.summary).toContain("authentication module");
  });
});
