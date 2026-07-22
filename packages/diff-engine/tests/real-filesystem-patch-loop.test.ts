import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRuntime, WebFileSystemAdapter } from "@qodex/project-runtime";
import { DiffEngine } from "../src/engine.js";
import { parseModelPatchResponse } from "../src/parser/model-output.js";

class DiskFileHandle {
  readonly kind = "file" as const;
  readonly name: string;

  constructor(private absolutePath: string) {
    this.name = basename(absolutePath);
  }

  async getFile() {
    return {
      text: async () => readFile(this.absolutePath, "utf8"),
    };
  }

  async createWritable() {
    let replacement = "";
    return {
      write: async (content: string) => { replacement = content; },
      close: async () => { await writeFile(this.absolutePath, replacement, "utf8"); },
    };
  }
}

class DiskDirectoryHandle {
  readonly kind = "directory" as const;
  readonly name: string;

  constructor(private absolutePath: string) {
    this.name = basename(absolutePath);
  }

  async *entries() {
    for (const entry of await readdir(this.absolutePath, { withFileTypes: true })) {
      const childPath = join(this.absolutePath, entry.name);
      yield [
        entry.name,
        entry.isDirectory() ? new DiskDirectoryHandle(childPath) : new DiskFileHandle(childPath),
      ] as const;
    }
  }
}

describe("real filesystem patch loop", () => {
  let fixturePath: string | null = null;

  afterEach(async () => {
    if (fixturePath) await rm(fixturePath, { recursive: true, force: true });
    fixturePath = null;
  });

  it("opens, proposes, applies, verifies, and rolls back two real files", async () => {
    fixturePath = await mkdtemp(join(tmpdir(), "kerniq-real-patch-smoke-"));
    const sourceDir = join(fixturePath, "src");
    await mkdir(sourceDir);

    const mathPath = join(sourceDir, "math.ts");
    const testPath = join(sourceDir, "math.test.ts");
    const originalMath = "export const add = (a: number, b: number) => a + b;\n";
    const originalTest = "import { add } from './math';\nvoid add(1, 2);\n";
    const updatedMath = `${originalMath}export const divide = (a: number, b: number) => {\n  if (b === 0) throw new Error('Division by zero');\n  return a / b;\n};\n`;
    const updatedTest = "import { add, divide } from './math';\nvoid add(1, 2);\nvoid divide(6, 2);\n";
    await writeFile(mathPath, originalMath, "utf8");
    await writeFile(testPath, originalTest, "utf8");

    const rootHandle = new DiskDirectoryHandle(fixturePath) as unknown as FileSystemDirectoryHandle;
    const adapter = new WebFileSystemAdapter(rootHandle);
    const project = new ProjectRuntime({ adapter });
    await project.openProject(fixturePath);
    expect(project.hasProject).toBe(true);
    expect(project.toggleSelect("src/math.ts")).toBe(true);
    expect(project.toggleSelect("src/math.test.ts")).toBe(true);
    expect(project.selectedPaths).toHaveLength(2);

    const modelResponse = `I added guarded division and updated its usage.\n<KERNIQ_PATCH_V1>\n${JSON.stringify({
      version: "1",
      summary: "Add guarded division and update its test",
      files: [
        { path: "src/math.ts", oldContent: originalMath, newContent: updatedMath },
        { path: "src/math.test.ts", oldContent: originalTest, newContent: updatedTest },
      ],
    })}\n</KERNIQ_PATCH_V1>`;
    const parsed = parseModelPatchResponse(modelResponse, "smoke-task");
    expect(parsed.error).toBeNull();
    expect(parsed.proposal?.files).toHaveLength(2);

    expect(await readFile(mathPath, "utf8")).toBe(originalMath);
    expect(await readFile(testPath, "utf8")).toBe(originalTest);

    const engine = new DiffEngine(project.fileAccess, project.fileAccess);
    const proposal = parsed.proposal!;
    expect(await engine.validateProposal(proposal)).toEqual([]);
    const applyResults = await engine.apply(proposal);
    expect(applyResults.every((result) => result.success && result.readbackVerified)).toBe(true);
    expect(await readFile(mathPath, "utf8")).toBe(updatedMath);
    expect(await readFile(testPath, "utf8")).toBe(updatedTest);

    const rollbackResults = await engine.rollback(proposal);
    expect(rollbackResults.every((result) => result.success && result.readbackVerified)).toBe(true);
    expect(await readFile(mathPath)).toEqual(Buffer.from(originalMath));
    expect(await readFile(testPath)).toEqual(Buffer.from(originalTest));
  });
});
