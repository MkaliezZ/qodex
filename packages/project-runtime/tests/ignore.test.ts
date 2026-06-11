import { describe, it, expect } from "vitest";
import { shouldIgnore, isBinaryFile, detectLanguage } from "../src/ignore/rules.js";

describe("Ignore Rules", () => {
  it("ignores .git directory", () => {
    expect(shouldIgnore(".git")).toBe(true);
    expect(shouldIgnore(".git/config")).toBe(true);
  });

  it("ignores node_modules", () => {
    expect(shouldIgnore("node_modules")).toBe(true);
    expect(shouldIgnore("node_modules/express/index.js")).toBe(true);
  });

  it("ignores dist and build", () => {
    expect(shouldIgnore("dist")).toBe(true);
    expect(shouldIgnore("build/output.js")).toBe(true);
  });

  it("ignores hidden files", () => {
    expect(shouldIgnore(".env")).toBe(true);
    expect(shouldIgnore(".cache/stuff")).toBe(true);
  });

  it("allows .gitignore and .editorconfig", () => {
    expect(shouldIgnore(".gitignore")).toBe(false);
    expect(shouldIgnore(".editorconfig")).toBe(false);
  });

  it("ignores lock files", () => {
    expect(shouldIgnore("pnpm-lock.yaml")).toBe(false);
    expect(shouldIgnore("package-lock.json")).toBe(false);
  });

  it("ignores database files", () => {
    expect(shouldIgnore("data.sqlite")).toBe(true);
    expect(shouldIgnore("data.db")).toBe(true);
  });

  it("does not ignore regular source files", () => {
    expect(shouldIgnore("src/index.ts")).toBe(false);
    expect(shouldIgnore("package.json")).toBe(false);
    expect(shouldIgnore("README.md")).toBe(false);
  });
});

describe("Binary File Detection", () => {
  it("detects image files", () => {
    expect(isBinaryFile("photo.png")).toBe(true);
    expect(isBinaryFile("photo.jpg")).toBe(true);
    expect(isBinaryFile("photo.jpeg")).toBe(true);
    expect(isBinaryFile("photo.webp")).toBe(true);
  });

  it("detects other binary types", () => {
    expect(isBinaryFile("archive.zip")).toBe(true);
    expect(isBinaryFile("font.woff2")).toBe(true);
    expect(isBinaryFile("binary.exe")).toBe(true);
  });

  it("does not flag text files", () => {
    expect(isBinaryFile("index.ts")).toBe(false);
    expect(isBinaryFile("style.css")).toBe(false);
    expect(isBinaryFile("readme.md")).toBe(false);
  });
});

describe("Language Detection", () => {
  it("detects TypeScript", () => {
    expect(detectLanguage("file.ts")).toBe("typescript");
    expect(detectLanguage("file.tsx")).toBe("typescriptreact");
  });

  it("detects JSON", () => {
    expect(detectLanguage("package.json")).toBe("json");
  });

  it("detects Markdown", () => {
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it("returns undefined for unknown extensions", () => {
    expect(detectLanguage("file.xyz")).toBeUndefined();
  });
});
