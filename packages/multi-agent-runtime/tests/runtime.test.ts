import { describe, it, expect } from "vitest";
import { MultiAgentRuntime } from "../src/index.js";

describe("MultiAgentRuntime", () => {
  it("initializes with 4 agents", () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    expect(rt.agents).toHaveLength(4);
  });

  it("executes and returns report", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Review the repository");
    expect(report.summary).toBeTruthy();
    expect(rt.reports).toHaveLength(1);
  });

  it("latestReport returns most recent", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Review");
    const latest = rt.latestReport;
    expect(latest).not.toBeNull();
    expect(latest!.taskId).toBeTruthy();
  });

  it("currentPlan accessible after execute", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Refactor");
    expect(rt.currentPlan).not.toBeNull();
  });

  it("currentReport accessible after execute", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Test");
    expect(rt.currentReport).not.toBeNull();
  });

  it("fires events during execution", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const events: string[] = [];
    rt.events.subscribe((e) => events.push(e.type));
    await rt.execute("Review project");
    expect(events).toContain("plan.generated");
    expect(events).toContain("subtask.created");
    expect(events).toContain("agent.assigned");
    expect(events).toContain("subtask.completed");
    expect(events).toContain("agent.completed");
    expect(events).toContain("report.generated");
  });
});
