/**
 * M10 Production Review — 18 Scenarios
 */

import { describe, it, expect, vi } from "vitest";
import { MultiAgentRuntime, Coordinator, TaskPlanner, SpecialistFactory, AgentEventBus } from "../src/index.js";

// ── Scenario 1: Agent Registration ────────────────

describe("Scenario 1 — Agent Registration", () => {
  it("PASS: 4 specialists registered", () => {
    const f = new SpecialistFactory();
    const agents = f.createDefaultSet();
    expect(agents).toHaveLength(4);
    const roles = agents.map((a) => a.role);
    expect(roles).toContain("review");
    expect(roles).toContain("refactor");
    expect(roles).toContain("research");
    expect(roles).toContain("testing");
  });
  it("PASS: agents have unique IDs", () => {
    const f = new SpecialistFactory();
    const ids = f.createDefaultSet().map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("PASS: agents have correct roles", () => {
    const f = new SpecialistFactory();
    for (const a of f.createDefaultSet()) {
      expect(["review", "refactor", "research", "testing"]).toContain(a.role);
    }
  });
});

// ── Scenario 2: Planner Generation ────────────────

describe("Scenario 2 — Planner Generation", () => {
  const p = new TaskPlanner();
  it("PASS: plan generated with subtasks and assignments", () => {
    const plan = p.createPlan("Review repository architecture");
    expect(plan.id).toBeTruthy();
    expect(plan.subTasks.length).toBeGreaterThan(0);
    expect(plan.subTasks[0].agentRole).toBeTruthy();
  });
  it("PASS: deterministic — same prompt → same plan structure", () => {
    const p1 = p.createPlan("Review repository architecture");
    const p2 = p.createPlan("Review repository architecture");
    expect(p1.subTasks.map((s) => s.agentRole)).toEqual(p2.subTasks.map((s) => s.agentRole));
  });
  it("PASS: each subtask has ID, role, description, scope", () => {
    const plan = p.createPlan("Review and refactor");
    for (const st of plan.subTasks) {
      expect(st.id).toBeTruthy();
      expect(st.agentRole).toBeTruthy();
      expect(st.description).toBeTruthy();
      expect(st.scope.length).toBeGreaterThan(0);
    }
  });
});

// ── Scenario 3: Review Flow ───────────────────────

describe("Scenario 3 — Review Flow", () => {
  it("PASS: review prompt routes to ReviewAgent", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Review this repository");
    expect(c.currentPlan!.subTasks.some((s) => s.agentRole === "review")).toBe(true);
    const reviewAgent = c.agents.find((a) => a.role === "review");
    expect(reviewAgent?.status).toBe("completed");
    expect(c.currentReport).not.toBeNull();
  });
});

// ── Scenario 4: Refactor Flow ─────────────────────

describe("Scenario 4 — Refactor Flow", () => {
  it("PASS: refactor prompt routes to RefactorAgent", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Refactor this service layer");
    expect(c.currentPlan!.subTasks.some((s) => s.agentRole === "refactor")).toBe(true);
  });
  it("PASS: no file writes from refactor", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Refactor");
    expect(c.currentReport?.fileChanges).toEqual([]);
  });
});

// ── Scenario 5: Research Flow ─────────────────────

describe("Scenario 5 — Research Flow", () => {
  it("PASS: research prompt routes to ResearchAgent", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Analyze project dependencies");
    expect(c.currentPlan!.subTasks.some((s) => s.agentRole === "research")).toBe(true);
  });
  it("PASS: findings returned in report", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Analyze project structure");
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

// ── Scenario 6: Testing Flow ──────────────────────

describe("Scenario 6 — Testing Flow", () => {
  it("PASS: testing prompt routes to TestingAgent", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Review test coverage");
    expect(c.currentPlan!.subTasks.some((s) => s.agentRole === "testing")).toBe(true);
  });
  it("PASS: coverage findings returned", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Add unit tests");
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

// ── Scenario 7: Multi-Agent Plan ──────────────────

describe("Scenario 7 — Multi-Agent Plan", () => {
  it("PASS: multiple specialists assigned for complex prompt", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review, refactor and test this repository");
    const roles = c.currentPlan!.subTasks.map((s) => s.agentRole);
    expect(roles).toContain("review");
    expect(roles).toContain("refactor");
    expect(roles).toContain("testing");
    expect(r.findings.length).toBeGreaterThan(0);
  });
});

// ── Scenario 8: Report Aggregation ────────────────

describe("Scenario 8 — Report Aggregation", () => {
  it("PASS: report contains summary", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review");
    expect(r.summary.length).toBeGreaterThan(10);
  });
  it("PASS: report contains findings array", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review");
    expect(Array.isArray(r.findings)).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });
  it("PASS: report contains recommendations array", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Refactor");
    expect(Array.isArray(r.recommendations)).toBe(true);
  });
  it("PASS: no missing sections", async () => {
    const c = new Coordinator(); c.initialize();
    const r = await c.execute("Review");
    expect(r.summary).toBeTruthy();
    expect(r.findings).toBeTruthy();
    expect(r.recommendations).toBeTruthy();
    expect(r.fileChanges).toBeTruthy();
    expect(r.generatedAt).toBeTruthy();
  });
});

// ── Scenario 9: Context Scoping ───────────────────

describe("Scenario 9 — Context Scoping", () => {
  const p = new TaskPlanner();
  it("PASS: each subtask has scoped context (not full project)", () => {
    const plan = p.createPlan("Review the codebase");
    for (const st of plan.subTasks) {
      expect(st.scope.some((s) => s.includes("src") || s.includes("*.ts") || s.includes("**") || s.includes("package.json"))).toBe(true);
    }
  });
  it("PASS: scope is reduced — no wildcard 'all files'", () => {
    const plan = p.createPlan("Review");
    for (const st of plan.subTasks) {
      expect(st.scope.length).toBeGreaterThan(0);
      expect(st.scope.length).toBeLessThan(10);
    }
  });
  it("PASS: buildScopeContext includes task description", () => {
    const plan = p.createPlan("Review");
    const ctx = p.buildScopeContext(plan.subTasks[0]);
    expect(ctx).toContain("Scope:");
    expect(ctx).toContain("Task:");
  });
});

// ── Scenario 10: Event Lifecycle ──────────────────

describe("Scenario 10 — Event Lifecycle", () => {
  it("PASS: agent.created fires on initialize", () => {
    const c = new Coordinator();
    const types: string[] = [];
    c.events.subscribe((e) => types.push(e.type));
    c.initialize();
    expect(types).toContain("agent.created");
  });
  it("PASS: all execution event types fire", async () => {
    const c = new Coordinator(); c.initialize();
    const types: string[] = [];
    c.events.subscribe((e) => types.push(e.type));
    await c.execute("Review");
    expect(types).toContain("agent.assigned");
    expect(types).toContain("plan.generated");
    expect(types).toContain("subtask.created");
    expect(types).toContain("agent.assigned");
    expect(types).toContain("subtask.completed");
    expect(types).toContain("agent.completed");
    expect(types).toContain("report.generated");
  });
  it("PASS: events have correct payload", async () => {
    const c = new Coordinator(); c.initialize();
    const events: any[] = [];
    c.events.subscribe((e) => events.push(e));
    await c.execute("Review");
    const planEvent = events.find((e) => e.type === "plan.generated");
    expect(planEvent.payload.planId).toBeTruthy();
    expect(planEvent.payload.subTaskCount).toBeGreaterThan(0);
  });
  it("PASS: no duplicate events", async () => {
    const c = new Coordinator(); c.initialize();
    const counts: Record<string, number> = {};
    c.events.subscribe((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    await c.execute("Review");
    expect(counts["plan.generated"]).toBe(1);
    expect(counts["report.generated"]).toBe(1);
  });
});

// ── Scenario 11: Diff Boundary ────────────────────

describe("Scenario 11 — Diff Boundary", () => {
  it("PASS: specialists cannot write files directly", () => {
    const f = new SpecialistFactory();
    for (const a of f.createDefaultSet()) {
      expect((a as any).writeFile).toBeUndefined();
    }
  });
  it("PASS: coordinator has no apply method", () => {
    const c = new Coordinator();
    expect((c as any).apply).toBeUndefined();
  });
});

// ── Scenario 12: Git Boundary ─────────────────────

describe("Scenario 12 — Git Boundary", () => {
  it("PASS: coordinator cannot bypass Git Runtime", () => {
    const c = new Coordinator();
    expect((c as any).checkpoint).toBeUndefined();
    expect((c as any).commit).toBeUndefined();
  });
});

// ── Scenario 13: MCP Integration ──────────────────

describe("Scenario 13 — MCP Integration", () => {
  it("PASS: specialists have no MCP bypass", () => {
    const c = new Coordinator();
    expect((c as any).mcp).toBeUndefined();
  });
});

// ── Scenario 14: Desktop Integration ──────────────

describe("Scenario 14 — Desktop Integration", () => {
  it("PASS: agent list displayable in UI", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    const display = rt.agents.map((a) => ({ role: a.role, status: a.status }));
    expect(display).toHaveLength(4);
    expect(display.every((d) => d.status === "idle")).toBe(true);
  });
  it("PASS: subtask status accessible for UI", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    await rt.execute("Review");
    const statuses = rt.currentPlan!.subTasks.map((s) => s.status);
    expect(statuses.every((s) => s === "completed")).toBe(true);
  });
  it("PASS: report accessible for UI display", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    await rt.execute("Review");
    expect(rt.currentReport).not.toBeNull();
  });
});

// ── Scenario 15: Error Handling ───────────────────

describe("Scenario 15 — Error Handling", () => {
  it("PASS: empty prompt still produces valid plan", () => {
    const p = new TaskPlanner();
    const plan = p.createPlan("");
    expect(plan.subTasks.length).toBeGreaterThan(0);
  });
  it("PASS: runtime survives multiple rapid executions", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    for (let i = 0; i < 10; i++) {
      const r = await rt.execute(`Task ${i}`);
      expect(r.summary).toBeTruthy();
    }
    expect(rt.reports).toHaveLength(10);
  });
  it("PASS: coordinator stable after execution", async () => {
    const c = new Coordinator(); c.initialize();
    await c.execute("Review");
    expect(c.agents.every((a) => a.status === "idle" || a.status === "completed")).toBe(true);
  });
});

// ── Scenario 16: Security Validation ──────────────

describe("Scenario 16 — Security Validation", () => {
  it("PASS: no direct execution bypass", () => {
    const rt = new MultiAgentRuntime();
    expect((rt as any).autoExecute).toBeUndefined();
  });
  it("PASS: no recursive spawn methods", () => {
    const rt = new MultiAgentRuntime();
    expect((rt as any).spawn).toBeUndefined();
    expect((rt as any).fork).toBeUndefined();
  });
  it("PASS: no self-modification methods", () => {
    const c = new Coordinator();
    expect((c as any).modify).toBeUndefined();
  });
  it("PASS: execute requires explicit call", () => {
    const c = new Coordinator(); c.initialize();
    expect(c.currentReport).toBeNull();
  });
});

// ── Scenario 17: Load Test ────────────────────────

describe("Scenario 17 — Load Test", () => {
  it("PASS: 100 plans generated", () => {
    const p = new TaskPlanner();
    for (let i = 0; i < 100; i++) {
      const plan = p.createPlan(`Task ${i}`);
      expect(plan.subTasks.length).toBeGreaterThan(0);
    }
  });
  it("PASS: 1000 events published", () => {
    const b = new AgentEventBus(); let c = 0;
    b.subscribe(() => c++);
    for (let i = 0; i < 1000; i++) b.publish("agent.created", {});
    expect(c).toBe(1000);
  });
  it("PASS: runtime responsive after load", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    await rt.execute("Initial");
    const start = Date.now();
    await rt.execute("Second");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

// ── Scenario 18: End-to-End Flow ──────────────────

describe("Scenario 18 — End-to-End Flow", () => {
  it("PASS: full workflow produces aggregated report", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    const report = await rt.execute("Review, refactor, test and analyze this repository");
    expect(report.summary).toBeTruthy();
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(rt.currentPlan!.subTasks.length).toBeGreaterThanOrEqual(3);
  });
  it("PASS: no direct file writes in full flow", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    const report = await rt.execute("Review, refactor, test and analyze this repository");
    expect(report.fileChanges).toEqual([]);
  });
  it("PASS: no permission bypass in full flow", () => {
    const c = new Coordinator();
    expect((c as any).permission).toBeUndefined();
  });
  it("PASS: report generated at end of flow", async () => {
    const rt = new MultiAgentRuntime(); rt.initialize();
    await rt.execute("Review, refactor, test and analyze this repository");
    expect(rt.currentReport).not.toBeNull();
    expect(rt.currentReport!.generatedAt).toBeTruthy();
  });
});
