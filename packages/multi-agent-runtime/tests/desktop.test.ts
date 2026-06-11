import { describe, it, expect } from "vitest";
import { MultiAgentRuntime, Coordinator } from "../src/index.js";

describe("Desktop Integration", () => {
  it("agent list displayable in UI", () => {
    const rt = new MultiAgentRuntime();
    rt.initialize();
    const agents = rt.agents.map((a) => ({ name: a.name, role: a.role, status: a.status }));
    expect(agents).toHaveLength(4);
    expect(agents[0].status).toBe("idle");
  });

  it("subtask status accessible for UI", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Review");
    const statuses = c.currentPlan!.subTasks.map((s) => s.status);
    expect(statuses.every((s) => s === "completed")).toBe(true);
  });

  it("report generated for UI display", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    await rt.execute("Review");
    expect(rt.currentReport).not.toBeNull();
  });

  it("findings count for UI badge", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review code");
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("subtask count for UI", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Review and refactor and test");
    expect(c.currentPlan!.subTasks.length).toBeGreaterThanOrEqual(2);
  });
});
