import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/context/engine.js";
import { RulesLoader } from "../src/rules/loader.js";
import { MemoryLoader } from "../src/memory/loader.js";
import { TokenEstimator } from "../src/budget/estimator.js";

/**
 * Full pipeline integration test.
 * Simulates the real flow: M4 ProjectRuntime → M5 ContextEngine → M3 AgentRuntime.
 */
describe("Full Pipeline Integration", () => {
  it("assembles a complete ContextBundle from all sources", async () => {
    const engine = new ContextEngine({
      rulesLoader: new RulesLoader({
        getRules: () => "# Rules\n- Use strict mode\n- No Redux",
      }),
      memoryLoader: new MemoryLoader({
        getMemory: () => "# Memory\n- Working on M5\n- Context Engine done",
      }),
    });

    engine.setProjectInfo("Qodex", {
      rootPath: "/projects/qodex",
      files: [
        { path: "src/main.ts", size: 500, language: "typescript", lastModified: 1 },
        { path: "src/utils.ts", size: 300, language: "typescript", lastModified: 2 },
        { path: "config.json", size: 50, language: "json", lastModified: 3 },
      ],
      indexedAt: new Date().toISOString(),
    });

    const bundle = await engine.buildContext({
      prompt: "Add a new utility function",
      selectedFiles: [
        { path: "src/utils.ts", content: "export const add = (a: number, b: number) => a + b;", language: "typescript" },
      ],
    });

    // 1. Assembles prompt with all sources
    expect(bundle.assembledPrompt).toContain("Project Rules");
    expect(bundle.assembledPrompt).toContain("Session Memory");
    expect(bundle.assembledPrompt).toContain("Project Metadata");
    expect(bundle.assembledPrompt).toContain("Selected Files");
    expect(bundle.assembledPrompt).toContain("Task");
    expect(bundle.assembledPrompt).toContain("Add a new utility function");

    // 2. Sources are isolated
    expect(bundle.sources.projectRules).toContain("Use strict mode");
    expect(bundle.sources.memory).toContain("Working on M5");
    expect(bundle.sources.projectMetadata).toContain("Files Indexed: 3");
    expect(bundle.sources.selectedFiles).toContain("src/utils.ts");

    // 3. Token estimate is reasonable
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
    expect(bundle.estimatedTokens).toBeLessThan(500); // Small context

    // 4. Estimated from estimator matches
    const estimator = new TokenEstimator();
    expect(bundle.estimatedTokens).toBe(estimator.estimate(bundle.assembledPrompt));
  });

  it("works without project metadata", async () => {
    const engine = new ContextEngine();
    const bundle = await engine.buildContext({
      prompt: "Hello",
      selectedFiles: [],
    });
    // Should still produce something (rules + memory fallback)
    expect(bundle.assembledPrompt).toBeTruthy();
    expect(bundle.sources.projectMetadata).toBe("");
  });

  it("produces consistent output across multiple calls", async () => {
    const engine = new ContextEngine({
      rulesLoader: new RulesLoader({
        getRules: () => "Stable rules",
      }),
      memoryLoader: new MemoryLoader({
        getMemory: () => "Stable memory",
      }),
    });

    const bundle1 = await engine.buildContext({
      prompt: "Task A",
      selectedFiles: [{ path: "a.ts", content: "aaa", language: "typescript" }],
    });

    const bundle2 = await engine.buildContext({
      prompt: "Task B",
      selectedFiles: [{ path: "b.ts", content: "bbb", language: "typescript" }],
    });

    // Rules and memory are stable
    expect(bundle1.sources.projectRules).toBe(bundle2.sources.projectRules);
    expect(bundle1.sources.memory).toBe(bundle2.sources.memory);

    // Files differ
    expect(bundle1.sources.selectedFiles).toContain("a.ts");
    expect(bundle2.sources.selectedFiles).toContain("b.ts");
  });
});
