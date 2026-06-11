import { describe, it, expect } from "vitest";
import { MockFileSystemAdapter } from "../src/fs/mock.js";
import { FileReader } from "../src/files/reader.js";

function createMockFs() {
  return new MockFileSystemAdapter([
    { path: "hello.txt", name: "hello.txt", content: "Hello World", isDir: false },
    { path: "code.ts", name: "code.ts", content: "const x: number = 1;", isDir: false },
    { path: "README.md", name: "README.md", content: "# Project", isDir: false },
    { path: "image.png", name: "image.png", content: "BINARY", isDir: false },
  ]);
}

describe("FileReader", () => {
  it("reads a text file", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const result = await reader.readFile("hello.txt");
    expect(result.path).toBe("hello.txt");
    expect(result.content).toBe("Hello World");
  });

  it("detects language for known extensions", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const result = await reader.readFile("code.ts");
    expect(result.language).toBe("typescript");
  });

  it("returns binary indicator for binary files", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const result = await reader.readFile("image.png");
    expect(result.content).toBe("Unsupported Binary File");
    expect(result.language).toBeUndefined();
  });

  it("reads multiple files", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const results = await reader.readFiles(["hello.txt", "code.ts"]);
    expect(results).toHaveLength(2);
  });

  it("marks binary files in multi-read", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const results = await reader.readFiles(["hello.txt", "image.png"]);
    expect(results).toHaveLength(2);
    const img = results.find((r) => r.path === "image.png");
    expect(img?.content).toBe("Unsupported Binary File");
  });

  it("builds context string from files", async () => {
    const adapter = createMockFs();
    const reader = new FileReader(adapter);
    const context = await reader.readFilesAsContext(["hello.txt"]);
    expect(context).toContain("hello.txt");
    expect(context).toContain("Hello World");
  });
});
