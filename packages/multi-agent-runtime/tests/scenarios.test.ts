import { describe, it, expect } from "vitest";
import { MultiAgentRuntime, TaskPlanner } from "../src/index.js";

describe("Usage Scenarios", () => {
  it("full review workflow", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Review this repository for code quality");
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.summary).toContain("Review");
  });

  it("refactor workflow", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Refactor the main module for better performance");
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("testing workflow", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const report = await rt.execute("Add unit tests for the core module");
    expect(report.findings.length).toBeGreaterThan(0);
  });

  it("mixed workflow matches multiple specialists", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Review and refactor the codebase, then add tests");
    expect(rt.currentPlan!.subTasks.filter((s) => s.agentRole === "review").length).toBeGreaterThan(0);
    expect(rt.currentPlan!.subTasks.filter((s) => s.agentRole === "refactor").length).toBeGreaterThan(0);
    expect(rt.currentPlan!.subTasks.filter((s) => s.agentRole === "testing").length).toBeGreaterThan(0);
  });

  it("report generated after execution", async () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    await rt.execute("Review");
    expect(rt.currentReport).not.toBeNull();
    expect(rt.currentReport!.generatedAt).toBeTruthy();
  });
});
