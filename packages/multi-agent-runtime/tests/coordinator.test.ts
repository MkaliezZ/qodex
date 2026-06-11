import { describe, it, expect } from "vitest";
import { Coordinator } from "../src/index.js";

describe("Coordinator", () => {
  it("initializes with 4 specialist agents", () => {
    const c = new Coordinator();
    c.initialize();
    expect(c.agents).toHaveLength(4);
    expect(c.agents.map((a) => a.role)).toContain("review");
    expect(c.agents.map((a) => a.role)).toContain("refactor");
    expect(c.agents.map((a) => a.role)).toContain("research");
    expect(c.agents.map((a) => a.role)).toContain("testing");
  });

  it("executes full workflow and returns report", async () => {
    const c = new Coordinator();
    c.initialize();
    const report = await c.execute("Review the codebase and add tests");
    expect(report.summary).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("planner generates subtasks on execute", async () => {
    const c = new Coordinator();
    c.initialize();
    await c.execute("Refactor the main module");
    expect(c.currentPlan).not.toBeNull();
    expect(c.currentPlan!.subTasks.length).toBeGreaterThan(0);
  });

  it("fires agent.created events on init", () => {
    const c = new Coordinator();
    const events: string[] = [];
    c.events.subscribe((e) => events.push(e.type));
    c.initialize();
    expect(events.filter((e) => e === "agent.created")).toHaveLength(4);
  });

  it("fires plan.generated event", async () => {
    const c = new Coordinator();
    c.initialize();
    const events: string[] = [];
    c.events.subscribe((e) => events.push(e.type));
    await c.execute("Review project");
    expect(events).toContain("plan.generated");
  });

  it("fires report.generated event", async () => {
    const c = new Coordinator();
    c.initialize();
    const events: string[] = [];
    c.events.subscribe((e) => events.push(e.type));
    await c.execute("Review");
    expect(events).toContain("report.generated");
  });

  it("report has summary", async () => {
    const c = new Coordinator();
    c.initialize();
    const report = await c.execute("Test the application");
    expect(report.summary.length).toBeGreaterThan(10);
  });

  it("report has generatedAt", async () => {
    const c = new Coordinator();
    c.initialize();
    const report = await c.execute("x");
    expect(report.generatedAt).toBeTruthy();
  });

  it("executeSubTask returns mock output", async () => {
    const c = new Coordinator();
    c.initialize();
    const plan = c.planner.createPlan("Review");
    const output = await c.executeSubTask(plan.subTasks[0]);
    expect(output.length).toBeGreaterThan(10);
  });
});
