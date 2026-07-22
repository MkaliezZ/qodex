import { describe, expect, it } from "vitest";
import { ContextEngine } from "../src/context/engine.js";
import { MemoryLoader } from "../src/memory/loader.js";
import { RulesLoader } from "../src/rules/loader.js";

describe("patch output instructions", () => {
  it("places the explicit versioned contract before the user task", async () => {
    const engine = new ContextEngine({
      rulesLoader: new RulesLoader({ getRules: () => "" }),
      memoryLoader: new MemoryLoader({ getMemory: () => "" }),
    });
    const bundle = await engine.buildContext({
      prompt: "Update the selected file",
      selectedFiles: [{ path: "src/a.ts", content: "const a = 1;", language: "typescript" }],
    });

    const prompt = bundle.assembledPrompt;
    expect(prompt).toContain("<KERNIQ_PATCH_V1>");
    expect(prompt).toContain('"version": "1"');
    expect(prompt).toContain("oldContent must exactly match");
    expect(prompt).toContain("complete intended replacement");
    expect(prompt).toContain("Only propose changes to files included in Selected Files");
    expect(prompt).toContain("explicit user approval and successful write verification");
    expect(prompt.indexOf("=== Patch Output Contract ===")).toBeLessThan(prompt.indexOf("=== Task ==="));
    expect(prompt.endsWith("Update the selected file")).toBe(true);
  });
});
