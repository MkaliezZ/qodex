import { describe, it, expect } from "vitest";
import { MultiAgentRuntime, Coordinator } from "../src/index.js";

describe("Integration", () => {
  it("full workflow: init → execute → report", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Review and refactor the codebase");
    expect(report.summary).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(rt.reports).toHaveLength(1);
  });

  it("multiple executions produce multiple reports", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Review");
    await rt.execute("Refactor");
    expect(rt.reports).toHaveLength(2);
  });

  it("latestReport is the most recent", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("First");
    await rt.execute("Second");
    expect(rt.latestReport?.summary).toContain("Second");
  });

  it("reports contain finding details", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Add tests for core module");
    expect(report.findings[0]).toBeTruthy();
    expect(report.recommendations[0]).toBeTruthy();
  });

  it("multiple coordinators are independent", () => {
    const c1 = new Coordinator();
    const c2 = new Coordinator();
    c1.initialize();
    c2.initialize();
    expect(c1.agents).toHaveLength(4);
    expect(c2.agents).toHaveLength(4);
    expect(c1.agents[0].id).not.toBe(c2.agents[0].id);
  });
});
