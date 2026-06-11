import { describe, it, expect } from "vitest";
import { Coordinator, MultiAgentRuntime, SpecialistFactory } from "../src/index.js";

describe("Security", () => {
  it("Coordinator has no exec methods", () => {
    const c = new Coordinator();
    expect((c as any).exec).toBeUndefined();
    expect((c as any).spawn).toBeUndefined();
  });

  it("MultiAgentRuntime has no file write methods", () => {
    const rt = new MultiAgentRuntime();
    expect((rt as any).writeFile).toBeUndefined();
    expect((rt as any).readFile).toBeUndefined();
  });

  it("specialists don't auto-write files", () => {
    const f = new SpecialistFactory();
    const agents = f.createDefaultSet();
    for (const a of agents) {
      expect(typeof (a as any).writeFile).toBe("undefined");
    }
  });

  it("execute requires explicit call", () => {
    const c = new Coordinator();
    c.initialize();
    // No auto-execution on init
    expect(c.currentReport).toBeNull();
  });
});
