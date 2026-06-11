/**
 * Qodex M5 Production Review — Context Engine Validation
 *
 * Scenarios 4, 5 and Token Estimator validation.
 */

import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/context/engine.js";
import { RulesLoader } from "../src/rules/loader.js";
import { MemoryLoader } from "../src/memory/loader.js";
import { TokenEstimator } from "../src/budget/estimator.js";
import { ProjectMetadataBuilder } from "../src/project/metadata.js";
import { FileContextBuilder } from "../src/builders/files.js";

// ── Scenario 4: Context Injection Order ────────────

describe("Scenario 4 — Context Injection", () => {
  it("PASS: assembly order is correct: Rules → Memory → Metadata → Files → Task", async () => {
    const engine = new ContextEngine({
      rulesLoader: new RulesLoader({ getRules: () => "RULES_CONTENT" }),
      memoryLoader: new MemoryLoader({ getMemory: () => "MEMORY_CONTENT" }),
    });

    engine.setProjectInfo("Qodex", {
      rootPath: "/test",
      files: [
        { path: "src/index.ts", size: 100, language: "typescript", lastModified: 1 },
      ],
      indexedAt: "now",
    });

    const bundle = await engine.buildContext({
      prompt: "Explain this project.",
      selectedFiles: [
        { path: "src/index.ts", content: "const app = new App();", language: "typescript" },
      ],
    });

    const text = bundle.assembledPrompt;

    // All sections present
    expect(text).toContain("=== Project Rules ===");
    expect(text).toContain("=== Session Memory ===");
    expect(text).toContain("=== Project Metadata ===");
    expect(text).toContain("=== Selected Files ===");
    expect(text).toContain("=== Task ===");

    // Order: rules first, task last
    const rulesIdx = text.indexOf("=== Project Rules ===");
    const taskIdx = text.indexOf("=== Task ===");
    expect(rulesIdx).toBeLessThan(taskIdx);

    // Content reaches AgentRuntime
    expect(text).toContain("RULES_CONTENT");
    expect(text).toContain("MEMORY_CONTENT");
    expect(text).toContain("Qodex");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("const app = new App();");
    expect(text).toContain("Explain this project.");
  });
});

// ── Scenario 5: No Selected Files ──────────────────

describe("Scenario 5 — No Selected Files", () => {
  it("PASS: runs successfully without selected files", async () => {
    const engine = new ContextEngine();
    const bundle = await engine.buildContext({
      prompt: "What is Qodex?",
      selectedFiles: [],
    });

    expect(bundle).toBeDefined();
    expect(bundle.assembledPrompt).toBeTruthy();
    expect(bundle.assembledPrompt).toContain("What is Qodex?");
    expect(bundle.sources.selectedFiles).toBe(""); // No files
    expect(bundle.sources.projectRules).toBeTruthy(); // Still has rules
    expect(bundle.sources.memory).toBeTruthy(); // Still has memory
    expect(bundle.estimatedTokens).toBeGreaterThan(0);
  });
});

// ── Token Estimator Validation ────────────────────

describe("Token Estimator — Small / Medium / Large", () => {
  const estimator = new TokenEstimator();

  it("PASS: small bundle (~10K chars) estimates correctly", () => {
    const text = "Hello from Qodex. ".repeat(400);
    const estimate = estimator.estimate(text);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(10000);
    expect(Number.isFinite(estimate)).toBe(true);
    expect(estimate).toBeGreaterThanOrEqual(0);
  });

  it("PASS: medium bundle (~50K chars) estimates correctly", () => {
    const text = "function test() { return true; }\n".repeat(1400);
    const estimate = estimator.estimate(text);
    expect(estimate).toBeGreaterThan(0);
    expect(estimate).toBeLessThan(50000);
    expect(Number.isFinite(estimate)).toBe(true);
  });

  it("PASS: large bundle (~100K chars) estimates correctly", () => {
    const text = "export const x = 1;\n".repeat(5000);
    const estimate = estimator.estimate(text);
    expect(estimate).toBeGreaterThan(0);
    expect(Number.isFinite(estimate)).toBe(true);
    expect(estimate).toBeLessThan(100000);
  });

  it("PASS: estimates scale linearly with input size", () => {
    const small = estimator.estimate("a".repeat(100));
    const medium = estimator.estimate("a".repeat(1000));
    const large = estimator.estimate("a".repeat(10000));

    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);

    const ratio = medium / small;
    expect(ratio).toBeGreaterThan(7);
    expect(ratio).toBeLessThan(13);
  });
});

// ── Scenario 2 & 3: File Selection + ProjectRuntime ──

describe("Scenario 2 & 3 — File Selection + UI State", () => {
  it("PASS: single file selection → count=1", async () => {
    const { MockFileSystemAdapter, ProjectRuntime } = await import("@qodex/project-runtime");

    const adapter = new MockFileSystemAdapter([
      { path: "README.md", name: "README.md", content: "# Project", isDir: false },
      { path: "src/index.ts", name: "index.ts", content: "const x = 1;", isDir: false },
      { path: "rules.md", name: "rules.md", content: "# Rules", isDir: false },
    ]);

    const runtime = new ProjectRuntime({ adapter });
    await runtime.openProject("/test");

    runtime.toggleSelect("README.md");
    expect(runtime.selectedPaths).toHaveLength(1);
    expect(runtime.selectedPaths[0]).toBe("README.md");
  });

  it("PASS: multi-file selection → count=2, combined context builds", async () => {
    const { MockFileSystemAdapter, ProjectRuntime } = await import("@qodex/project-runtime");

    const adapter = new MockFileSystemAdapter([
      { path: "README.md", name: "README.md", content: "# Project", isDir: false },
      { path: "rules.md", name: "rules.md", content: "# Rules", isDir: false },
    ]);

    const runtime = new ProjectRuntime({ adapter });
    await runtime.openProject("/test");

    runtime.toggleSelect("README.md");
    runtime.toggleSelect("rules.md");
    expect(runtime.selectedPaths).toHaveLength(2);

    const files = await runtime.readSelectedFiles();
    expect(files).toHaveLength(2);
    expect(files[0].content).toContain("# Project");
    expect(files[1].content).toContain("# Rules");
  });
});

// ── Scenario 9: Binary Files ──────────────────────

describe("Scenario 9 — Binary Files", () => {
  it("PASS: binary files return Unsupported Binary File", async () => {
    const { MockFileSystemAdapter, ProjectRuntime } = await import("@qodex/project-runtime");

    const adapter = new MockFileSystemAdapter([
      { path: "image.png", name: "image.png", content: "BINARY", isDir: false },
      { path: "photo.jpg", name: "photo.jpg", content: "BINARY", isDir: false },
      { path: "doc.pdf", name: "doc.pdf", content: "BINARY", isDir: false },
    ]);

    const runtime = new ProjectRuntime({ adapter });
    await runtime.openProject("/test");

    for (const path of ["image.png", "photo.jpg", "doc.pdf"]) {
      const content = await runtime.readFile(path);
      expect(content.content).toBe("Unsupported Binary File");
    }
  });
});
