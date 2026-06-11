import { describe, it, expect, beforeEach } from "vitest";
import { ContextEngine } from "../src/context/engine.js";
import { RulesLoader } from "../src/rules/loader.js";
import { MemoryLoader } from "../src/memory/loader.js";

describe("ContextEngine", () => {
  let engine: ContextEngine;

  beforeEach(() => {
    engine = new ContextEngine({
      rulesLoader: new RulesLoader({ getRules: () => "Test rules." }),
      memoryLoader: new MemoryLoader({ getMemory: () => "Test memory." }),
    });
  });

  it("builds a ContextBundle from prompt only", async () => {
    const bundle = await engine.buildContext({
      prompt: "Hello",
      selectedFiles: [],
    });

    expect(bundle.assembledPrompt.length).toBeGreaterThan(0);
    expect(bundle.assembledPrompt).toContain("Hello");
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });

  it("includes rules in the bundle", async () => {
    const bundle = await engine.buildContext({
      prompt: "Test",
      selectedFiles: [],
    });
    expect(bundle.sources.projectRules).toBe("Test rules.");
    expect(bundle.assembledPrompt).toContain("Test rules.");
  });

  it("includes memory in the bundle", async () => {
    const bundle = await engine.buildContext({
      prompt: "Test",
      selectedFiles: [],
    });
    expect(bundle.sources.memory).toBe("Test memory.");
    expect(bundle.assembledPrompt).toContain("Test memory.");
  });

  it("includes selected files in the bundle", async () => {
    const bundle = await engine.buildContext({
      prompt: "Refactor",
      selectedFiles: [
        { path: "src/main.ts", content: "const x = 1;", language: "typescript" },
      ],
    });

    expect(bundle.sources.selectedFiles).toContain("src/main.ts");
    expect(bundle.assembledPrompt).toContain("src/main.ts");
    expect(bundle.assembledPrompt).toContain("const x = 1;");
  });

  it("includes project metadata when index is set", async () => {
    engine.setProjectInfo("TestProj", {
      rootPath: "/test",
      files: [
        { path: "a.ts", size: 100, language: "typescript", lastModified: 1 },
      ],
      indexedAt: new Date().toISOString(),
    });

    const bundle = await engine.buildContext({
      prompt: "Hi",
      selectedFiles: [{ path: "a.ts", content: "x", language: "typescript" }],
    });

    expect(bundle.sources.projectMetadata).toContain("TestProj");
    expect(bundle.sources.projectMetadata).toContain("Files Indexed: 1");
  });

  it("pipeline: prompt is always last in assembly", async () => {
    const bundle = await engine.buildContext({
      prompt: "FINAL",
      selectedFiles: [],
    });

    const lines = bundle.assembledPrompt.split("\n");
    const lastSection = lines.slice(-3).join("\n");
    expect(lastSection).toContain("FINAL");
  });

  it("getContextSourceInfo returns all sources", async () => {
    const bundle = await engine.buildContext({
      prompt: "Test",
      selectedFiles: [{ path: "f.ts", content: "code", language: "typescript" }],
    });

    const sources = engine.getContextSourceInfo(bundle);
    expect(sources).toHaveLength(4);

    const rules = sources.find((s) => s.name === "rules");
    expect(rules?.active).toBe(true);
    expect(rules?.tokens).toBeGreaterThan(0);

    const files = sources.find((s) => s.name === "files");
    expect(files?.active).toBe(true);
  });

  it("marks inactive sources correctly", async () => {
    const bundle = await engine.buildContext({
      prompt: "Only",
      selectedFiles: [],
    });

    const sources = engine.getContextSourceInfo(bundle);
    expect(sources.find((s) => s.name === "files")?.active).toBe(false);
  });

  it("handles empty prompt", async () => {
    const bundle = await engine.buildContext({
      prompt: "",
      selectedFiles: [],
    });
    expect(bundle.assembledPrompt.length).toBeGreaterThan(0); // Still has rules + memory
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });
});
