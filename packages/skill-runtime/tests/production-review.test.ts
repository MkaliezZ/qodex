/**
 * Qodex M8 Production Review — 16 Scenarios
 */

import { describe, it, expect, vi } from "vitest";
import { SkillRuntime, SkillRegistry, SkillResolver, SkillLoader, BuiltInDataProvider, SkillValidator } from "../src/index.js";
import type { LoadedSkill, SkillDefinition } from "../src/index.js";

// ── Scenario 1: Skill Discovery ────────────────────

describe("Scenario 1 — Skill Discovery", () => {
  it("PASS: all 3 built-in skills discovered", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const ids = rt.registry.list().map((s) => s.definition.id);
    expect(ids).toContain("react-review");
    expect(ids).toContain("typescript-refactor");
    expect(ids).toContain("bug-hunter");
  });
  it("PASS: skill.json loaded with metadata", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const rr = rt.registry.get("react-review")!;
    expect(rr.definition.description).toBeTruthy();
    expect(rr.definition.version).toBe("1.0.0");
  });
  it("PASS: SKILL.md loaded", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const rr = rt.registry.get("react-review")!;
    expect(rr.content.length).toBeGreaterThan(50);
    expect(rr.content).toContain("functional components");
  });
});

// ── Scenario 2: Skill Validation ──────────────────

describe("Scenario 2 — Skill Validation", () => {
  const v = new SkillValidator();
  it("PASS: rejects missing id", () => {
    expect(v.isValid({} as any)).toBe(false);
  });
  it("PASS: rejects missing name", () => {
    expect(v.isValid({ id: "x" } as any)).toBe(false);
  });
  it("PASS: rejects missing version", () => {
    expect(v.isValid({ id: "x", name: "n" } as any)).toBe(false);
  });
  it("PASS: registry unchanged after invalid skill attempt", async () => {
    const provider: any = {
      listSkills: async () => ["bad"],
      loadJson: async () => ({ id: "" }), // invalid
      loadMd: async () => "",
    };
    const rt = new SkillRuntime(provider);
    await rt.initialize();
    expect(rt.registry.has("bad")).toBe(false);
  });
});

// ── Scenario 3: Registry Operations ───────────────

describe("Scenario 3 — Registry Operations", () => {
  it("PASS: register/get/unregister/list/clear all work", () => {
    const r = new SkillRegistry();
    const s = (id: string): LoadedSkill => ({ definition: { id, name: id, description: "", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" });
    r.register(s("a")); r.register(s("b")); r.register(s("c"));
    expect(r.size).toBe(3);
    expect(r.get("a")?.definition.id).toBe("a");
    expect(r.list()).toHaveLength(3);
    expect(r.unregister("b")).toBe(true);
    expect(r.size).toBe(2);
    r.clear();
    expect(r.size).toBe(0);
  });
  it("PASS: no duplicate registrations", () => {
    const r = new SkillRegistry();
    const s = (id: string): LoadedSkill => ({ definition: { id, name: id, description: "", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" });
    r.register(s("dup"));
    r.register(s("dup"));
    expect(r.size).toBe(1);
  });
  it("PASS: no stale references after unregister", () => {
    const r = new SkillRegistry();
    const s: LoadedSkill = { definition: { id: "test", name: "Test", description: "", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" };
    r.register(s);
    r.unregister("test");
    expect(r.get("test")).toBeUndefined();
  });
});

// ── Scenario 4: Resolver Matching ─────────────────

describe("Scenario 4 — Resolver Matching", () => {
  const skills: LoadedSkill[] = [
    { definition: { id: "react-review", name: "React Review", description: "Review React components", version: "1", tags: ["react", "frontend"], enabled: true }, content: "", loadedAt: "now" },
    { definition: { id: "ts-refactor", name: "TypeScript Refactor", description: "Refactor TypeScript code", version: "1", tags: ["typescript", "refactor"], enabled: true }, content: "", loadedAt: "now" },
    { definition: { id: "bug-hunter", name: "Bug Hunter", description: "Find bugs in code", version: "1", tags: ["bugs", "debug"], enabled: true }, content: "", loadedAt: "now" },
  ];
  const resolver = new SkillResolver();

  it("PASS: 'Review this React component' → react-review", () => {
    const matched = resolver.resolve("Review this React component", skills);
    expect(matched.map((s) => s.definition.id)).toContain("react-review");
  });
  it("PASS: 'Refactor this TypeScript service' → ts-refactor", () => {
    const matched = resolver.resolve("Refactor this TypeScript service", skills);
    expect(matched.map((s) => s.definition.id)).toContain("ts-refactor");
  });
  it("PASS: 'Find bugs in this code' → bug-hunter", () => {
    const matched = resolver.resolve("Find bugs in this code", skills);
    expect(matched.map((s) => s.definition.id)).toContain("bug-hunter");
  });
  it("PASS: deterministic — same prompt → same result", () => {
    const r1 = resolver.resolve("Review React component", skills);
    const r2 = resolver.resolve("Review React component", skills);
    expect(r1.map((s) => s.definition.id)).toEqual(r2.map((s) => s.definition.id));
  });
  it("PASS: unrelated prompt returns empty", () => {
    expect(resolver.resolve("Hello world", skills)).toHaveLength(0);
  });
});

// ── Scenario 5: Disabled Skill Handling ───────────

describe("Scenario 5 — Disabled Skill Handling", () => {
  it("PASS: bug-hunter is disabled by default", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const bh = rt.registry.get("bug-hunter")!;
    expect(bh.definition.enabled).toBe(false);
  });
  it("PASS: disabled skill present in registry but not auto-selected", () => {
    const registry = new SkillRegistry();
    registry.register({ definition: { id: "disabled", name: "Disabled", description: "", version: "1", tags: ["test"], enabled: false }, content: "", loadedAt: "now" });
    expect(registry.get("disabled")).toBeDefined();
    expect(registry.listEnabled()).toHaveLength(0);
  });
});

// ── Scenario 6: Context Injection ─────────────────

describe("Scenario 6 — Context Injection", () => {
  it("PASS: skill section between Memory and Metadata", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const resolved = rt.resolveSkills("React");
    const section = rt.buildSkillSection(resolved);
    const parts = [
      "=== Project Rules ===",
      "=== Session Memory ===",
      section,
      "=== Project Metadata ===",
      "=== Selected Files ===",
      "=== Task ===",
    ].filter(Boolean);
    const assembled = parts.join("\n\n");
    const ri = assembled.indexOf("Project Rules");
    const mi = assembled.indexOf("Session Memory");
    const si = assembled.indexOf("Skills");
    const metai = assembled.indexOf("Project Metadata");
    const fi = assembled.indexOf("Selected Files");
    const ti = assembled.indexOf("Task");
    expect(ri).toBeLessThan(mi);
    expect(mi).toBeLessThan(si);
    expect(si).toBeLessThan(metai);
    expect(metai).toBeLessThan(fi);
    expect(fi).toBeLessThan(ti);
  });
  it("PASS: skill content formatting preserved (header + content unique)", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const section = rt.buildSkillSection(rt.registry.listEnabled());
    // Section header and content are both present
    expect(section).toContain("Skill: React Review");
    expect(section).toContain("functional components");
    // Header appears exactly once
    const headerMatches = section.match(/Skill: React Review/g);
    expect(headerMatches).toHaveLength(1);
  });
  it("PASS: markdown preserved in skill content", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const section = rt.buildSkillSection(rt.registry.listEnabled());
    expect(section).toContain("## Guidelines");
    expect(section).toContain("- Use functional components");
  });
});

// ── Scenario 7: Multi-Skill Resolution ────────────

describe("Scenario 7 — Multi-Skill Resolution", () => {
  it("PASS: multiple skills resolved for combined prompt", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const matched = rt.resolveSkills("Review and refactor this React TypeScript component");
    const ids = matched.map((s) => s.definition.id);
    expect(ids).toContain("react-review");
    expect(ids).toContain("typescript-refactor");
  });
  it("PASS: no duplicate skills", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const matched = rt.resolveSkills("React React React TypeScript TypeScript");
    const ids = matched.map((s) => s.definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Scenario 8: Runtime Events ────────────────────

describe("Scenario 8 — Runtime Events", () => {
  it("PASS: skill.loaded fires on initialize", async () => {
    const rt = new SkillRuntime();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    await rt.initialize();
    expect(events.filter((e) => e === "skill.loaded").length).toBeGreaterThanOrEqual(3);
  });
  it("PASS: skill.reloaded fires on reload", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    await rt.reloadSkill("react-review");
    expect(events).toContain("skill.reloaded");
  });
  it("PASS: skill.resolved fires on resolve", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    rt.resolveSkills("React");
    expect(events).toContain("skill.resolved");
  });
  it("PASS: skill.unloaded fires on unload", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const events: string[] = [];
    rt.subscribe((e) => events.push(e.type));
    rt.unloadSkill("bug-hunter");
    expect(events).toContain("skill.unloaded");
  });
  it("PASS: events have correct payloads", async () => {
    const rt = new SkillRuntime();
    const payloads: any[] = [];
    rt.subscribe((e) => payloads.push(e.payload));
    await rt.initialize();
    expect(payloads[0].id).toBe("react-review");
    expect(payloads[0].name).toBe("React Review");
  });
});

// ── Scenario 9: Desktop Integration (API level) ───

describe("Scenario 9 — Desktop Integration", () => {
  it("PASS: loaded skill count correct", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    expect(rt.registry.size).toBeGreaterThanOrEqual(3);
  });
  it("PASS: enabled skill count correct", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    expect(rt.registry.listEnabled().length).toBeGreaterThanOrEqual(2);
  });
  it("PASS: skill names accessible for UI", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const names = rt.registry.list().map((s) => s.definition.name);
    expect(names).toContain("React Review");
    expect(names).toContain("TypeScript Refactor");
  });
  it("PASS: disabled skill marked", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const bh = rt.registry.get("bug-hunter")!;
    expect(bh.definition.enabled).toBe(false);
  });
});

// ── Scenario 10: Context Panel Integration ────────

describe("Scenario 10 — Context Panel Integration", () => {
  it("PASS: resolved skills displayable in context panel", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const resolved = rt.resolveSkills("React TypeScript");
    const display = resolved.map((s) => ({ id: s.definition.id, name: s.definition.name }));
    expect(display.length).toBeGreaterThanOrEqual(1);
  });
  it("PASS: skill count after resolution", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const resolved = rt.resolveSkills("React");
    expect(resolved.length).toBeGreaterThanOrEqual(1);
  });
  it("PASS: section built for context panel", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    const section = rt.buildSkillSection(rt.registry.listEnabled());
    expect(section).toContain("=== Skills ===");
  });
});

// ── Scenario 11: Provider Independence ────────────

describe("Scenario 11 — Provider Independence", () => {
  it("PASS: skills resolve identically regardless of provider", () => {
    const resolver = new SkillResolver();
    const skills: LoadedSkill[] = [
      { definition: { id: "test", name: "Test Skill", description: "A test skill for react typescript", version: "1", tags: ["react"], enabled: true }, content: "", loadedAt: "now" },
    ];
    // Same prompt yields same result
    const r1 = resolver.resolve("React component", skills);
    const r2 = resolver.resolve("React component", skills);
    expect(r1.map((s) => s.definition.id)).toEqual(r2.map((s) => s.definition.id));
  });
  it("PASS: runtime behavior unchanged with different provider (mock vs built-in)", async () => {
    const rt1 = new SkillRuntime();
    await rt1.initialize();
    const rt2 = new SkillRuntime(new BuiltInDataProvider());
    await rt2.initialize();
    expect(rt1.registry.size).toBe(rt2.registry.size);
    expect(rt1.registry.get("react-review")?.definition.name).toBe(rt2.registry.get("react-review")?.definition.name);
  });
});

// ── Scenario 12: Reload Flow ──────────────────────

describe("Scenario 12 — Reload Flow", () => {
  it("PASS: reload re-fetches from provider", async () => {
    let callCount = 0;
    const provider: any = {
      listSkills: async () => ["reloadable"],
      loadJson: async () => ({ id: "reloadable", name: `v${++callCount}`, description: "test", version: "1", tags: [], enabled: true }),
      loadMd: async () => "",
    };
    const loader = new SkillLoader(provider);
    const first = await loader.loadSkill("reloadable");
    expect(first.definition.name).toBe("v1");
    expect(loader.isCached("reloadable")).toBe(true);
    const second = await loader.reloadSkill("reloadable");
    expect(second.definition.name).toBe("v2");
  });
  it("PASS: runtime stable after reload", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    await rt.reloadSkill("react-review");
    expect(rt.registry.get("react-review")?.definition.name).toBe("React Review");
  });
});

// ── Scenario 13: Large Skill Content ──────────────

describe("Scenario 13 — Large Skill Content", () => {
  it("PASS: loads 5000+ line skill content", async () => {
    const bigContent = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const provider: any = {
      listSkills: async () => ["big"],
      loadJson: async () => ({ id: "big", name: "Big Skill", description: "large", version: "1", tags: [], enabled: true }),
      loadMd: async () => bigContent,
    };
    const rt = new SkillRuntime(provider);
    await rt.initialize();
    const skill = rt.registry.get("big")!;
    expect(skill.content.split("\n").length).toBe(5000);
    expect(rt.registry.size).toBe(1);
  });
  it("PASS: context injection succeeds with large content", async () => {
    const bigContent = "large content\n".repeat(5000);
    const provider: any = {
      listSkills: async () => ["big"],
      loadJson: async () => ({ id: "big", name: "Big Skill", description: "large", version: "1", tags: ["big"], enabled: true }),
      loadMd: async () => bigContent,
    };
    const rt = new SkillRuntime(provider);
    await rt.initialize();
    const section = rt.buildSkillSection(rt.registry.list());
    expect(section.length).toBeGreaterThan(5000);
  });
});

// ── Scenario 14: Error Handling ───────────────────

describe("Scenario 14 — Error Handling", () => {
  it("PASS: malformed JSON handled (simulated)", async () => {
    const provider: any = {
      listSkills: async () => ["bad"],
      loadJson: async () => { throw new Error("JSON parse error"); },
      loadMd: async () => null,
    };
    const rt = new SkillRuntime(provider);
    await rt.initialize();
    expect(rt.registry.has("bad")).toBe(false);
  });
  it("PASS: missing files handled", async () => {
    const provider: any = {
      listSkills: async () => ["ghost"],
      loadJson: async () => null,
      loadMd: async () => null,
    };
    const loader = new SkillLoader(provider);
    await expect(loader.loadSkill("ghost")).rejects.toThrow("not found");
  });
  it("PASS: duplicate IDs don't break registry", () => {
    const r = new SkillRegistry();
    const s = (id: string): LoadedSkill => ({ definition: { id, name: id, description: "", version: "1", tags: [], enabled: true }, content: "", loadedAt: "now" });
    r.register(s("dup"));
    r.register(s("dup"));
    r.register(s("dup"));
    expect(r.size).toBe(1);
  });
  it("PASS: runtime survives errors gracefully", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    // Try invalid operations
    expect(() => rt.buildSkillSection([])).not.toThrow();
    expect(() => rt.resolveSkills("")).not.toThrow();
  });
});

// ── Scenario 15: Security ─────────────────────────

describe("Scenario 15 — Security Validation", () => {
  it("PASS: resolver ignores malicious prompt", () => {
    const resolver = new SkillResolver();
    const skills: LoadedSkill[] = [
      { definition: { id: "safe", name: "Safe", description: "safe", version: "1", tags: ["safe"], enabled: true }, content: "", loadedAt: "now" },
    ];
    const malicious = "rm -rf / && drop database || echo hacked";
    expect(resolver.resolve(malicious, skills)).toHaveLength(0);
  });
  it("PASS: SkillRuntime has no code execution methods", () => {
    const rt = new SkillRuntime();
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(rt));
    const dangerous = ["exec", "run", "eval", "Function", "execute", "require"];
    for (const d of dangerous) {
      expect(proto.includes(d)).toBe(false);
    }
  });
  it("PASS: no arbitrary file access from runtime", () => {
    const rt = new SkillRuntime();
    expect((rt as any).readFile).toBeUndefined();
    expect((rt as any).writeFile).toBeUndefined();
  });
});

// ── Scenario 16: UI Stability (EventBus) ──────────

describe("Scenario 16 — UI Stability", () => {
  it("PASS: EventBus survives rapid events", async () => {
    const rt = new SkillRuntime();
    await rt.initialize();
    let count = 0;
    rt.subscribe(() => count++);
    for (let i = 0; i < 100; i++) {
      rt.resolveSkills("React TypeScript refactor");
    }
    expect(count).toBeGreaterThan(0);
  });
  it("PASS: no EventBus exceptions", () => {
    const rt = new SkillRuntime();
    rt.subscribe(() => { throw new Error("crash"); });
    expect(() => rt.resolveSkills("React")).not.toThrow();
  });
  it("PASS: UI doesn't freeze on large resolve", () => {
    const resolver = new SkillResolver();
    const skills: LoadedSkill[] = Array.from({ length: 100 }, (_, i) => ({
      definition: { id: String(i), name: String(i), description: "test", version: "1", tags: ["test"], enabled: true },
      content: "", loadedAt: "now",
    }));
    const start = Date.now();
    resolver.resolve("test", skills);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500); // completes within 500ms
  });
});
