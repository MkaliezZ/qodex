import { describe, it, expect } from "vitest";
import { Coordinator } from "../src/index.js";

describe("Coordinator Lifecycle", () => {
  it("starts with no currentPlan", () => {
    const c = new Coordinator();
    expect(c.currentPlan).toBeNull();
  });

  it("starts with no currentReport", () => {
    const c = new Coordinator();
    expect(c.currentReport).toBeNull();
  });

  it("starts with no agents before init", () => {
    const c = new Coordinator();
    expect(c.agents).toHaveLength(0);
  });

  it("has agents after init", () => {
    const c = new Coordinator();
    c.initialize();
    expect(c.agents).toHaveLength(4);
  });

  it("has plan after execute", async () => {
    const c = new Coordinator();
    c.initialize();
    await c.execute("Review");
    expect(c.currentPlan).not.toBeNull();
  });

  it("has report after execute", async () => {
    const c = new Coordinator();
    c.initialize();
    await c.execute("Review");
    expect(c.currentReport).not.toBeNull();
  });

  it("plan has subtasks", async () => {
    const c = new Coordinator();
    c.initialize();
    await c.execute("Review and refactor");
    expect(c.currentPlan!.subTasks.length).toBeGreaterThan(0);
  });
});
