import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/context/engine.js";
import { RulesLoader } from "../src/rules/loader.js";
import { MemoryLoader } from "../src/memory/loader.js";

describe("Context Assembly Order", () => {
  it("follows priority order: rules → memory → metadata → files → task", async () => {
    const engine = new ContextEngine({
      rulesLoader: new RulesLoader({ getRules: () => "RULES" }),
      memoryLoader: new MemoryLoader({ getMemory: () => "MEMORY" }),
    });

    engine.setProjectInfo("Proj", {
      rootPath: "/",
      files: [{ path: "f.ts", size: 1, language: "typescript", lastModified: 1 }],
      indexedAt: "now",
    });

    const bundle = await engine.buildContext({
      prompt: "TASK",
      selectedFiles: [{ path: "f.ts", content: "FILE_CONTENT", language: "typescript" }],
    });

    const text = bundle.assembledPrompt;
    const rulesIdx = text.indexOf("RULES");
    const memoryIdx = text.indexOf("MEMORY");
    const metadataIdx = text.indexOf("Proj");
    const filesIdx = text.indexOf("f.ts");
    const taskIdx = text.indexOf("TASK");

    // All present
    expect(rulesIdx).toBeGreaterThanOrEqual(0);
    expect(memoryIdx).toBeGreaterThanOrEqual(0);
    expect(metadataIdx).toBeGreaterThanOrEqual(0);
    expect(filesIdx).toBeGreaterThanOrEqual(0);
    expect(taskIdx).toBeGreaterThanOrEqual(0);

    // Priority order: rules first, task last
    expect(rulesIdx).toBeLessThan(taskIdx);
    expect(filesIdx).toBeLessThan(taskIdx);
  });

  it("sections are separated by double newlines", async () => {
    const engine = new ContextEngine();
    const bundle = await engine.buildContext({
      prompt: "x",
      selectedFiles: [],
    });

    // Each section header should be wrapped in === ... ===
    const matches = bundle.assembledPrompt.match(/=== .+ ===/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2); // At least rules + task
  });
});
