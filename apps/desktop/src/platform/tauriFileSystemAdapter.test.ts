import { describe, expect, it, vi } from "vitest";
import type {
  NativeDirectoryEntry,
  NativeFileInfo,
  TauriProjectBridge,
} from "./tauriBridge";
import { NativeFileSizeLimitError } from "./tauriBridge";
import { TauriFileSystemAdapter } from "./tauriFileSystemAdapter";
import { CODING_PACK_PROJECT_SOURCE_MAX_BYTES } from "@qodex/project-runtime";

type FixtureEntry =
  | { kind: "directory" }
  | { kind: "file"; content: string | Uint8Array }
  | { kind: "symlink" };

class FixtureBridge implements TauriProjectBridge {
  readonly entries = new Map<string, FixtureEntry>([
    ["/fixture", { kind: "directory" }],
    ["/fixture/src", { kind: "directory" }],
    ["/fixture/src/index.ts", { kind: "file", content: "export const value = 1;\n" }],
    ["/fixture/src/crlf.ts", { kind: "file", content: "const crlf = true;\r\n" }],
    ["/fixture/src/empty.ts", { kind: "file", content: "" }],
    ["/fixture/src/invalid.txt", {
      kind: "file",
      content: Uint8Array.from([0xff, 0xfe, 0x61]),
    }],
    ["/fixture/src/logo.png", { kind: "file", content: "not text" }],
    ["/fixture/link", { kind: "symlink" }],
  ]);
  writes = 0;
  readFailure: Error | null = null;

  async pickDirectory(): Promise<string> { return "/fixture"; }
  separator(): string { return "/"; }
  async basename(path: string): Promise<string> { return path.split("/").filter(Boolean).at(-1) ?? ""; }
  async join(...paths: string[]): Promise<string> { return this.normalize(paths.join("/")); }
  async normalize(path: string): Promise<string> {
    const components: string[] = [];
    for (const component of path.split("/")) {
      if (!component || component === ".") continue;
      if (component === "..") components.pop();
      else components.push(component);
    }
    return `/${components.join("/")}`;
  }

  async readDirectory(path: string): Promise<NativeDirectoryEntry[]> {
    const prefix = `${path}/`;
    const children = new Map<string, FixtureEntry>();
    for (const [entryPath, entry] of this.entries) {
      if (!entryPath.startsWith(prefix)) continue;
      const remainder = entryPath.slice(prefix.length);
      if (!remainder || remainder.includes("/")) continue;
      children.set(remainder, entry);
    }
    return [...children].map(([name, entry]) => ({ name, ...this.info(entry) }));
  }

  async readTextFile(path: string): Promise<string> {
    if (this.readFailure) throw this.readFailure;
    const entry = this.entries.get(path);
    if (entry?.kind !== "file") throw new Error(`missing: ${path}`);
    return typeof entry.content === "string"
      ? entry.content
      : new TextDecoder().decode(entry.content);
  }

  async readFileBytes(path: string, maxBytes: number): Promise<Uint8Array> {
    if (this.readFailure) throw this.readFailure;
    const entry = this.entries.get(path);
    if (entry?.kind !== "file") throw new Error(`missing: ${path}`);
    const bytes = typeof entry.content === "string"
      ? new TextEncoder().encode(entry.content)
      : entry.content;
    if (bytes.byteLength > maxBytes) throw new NativeFileSizeLimitError();
    return bytes.slice();
  }

  async writeExistingTextFile(path: string, content: string): Promise<void> {
    const entry = this.entries.get(path);
    if (entry?.kind !== "file") throw new Error(`missing: ${path}`);
    this.entries.set(path, { kind: "file", content });
    this.writes += 1;
  }

  async exists(path: string): Promise<boolean> { return this.entries.has(path); }
  async stat(path: string): Promise<NativeFileInfo> {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`missing: ${path}`);
    return this.info(entry);
  }
  async lstat(path: string): Promise<NativeFileInfo> { return this.stat(path); }

  private info(entry: FixtureEntry): NativeFileInfo {
    return {
      isFile: entry.kind === "file",
      isDirectory: entry.kind === "directory",
      isSymlink: entry.kind === "symlink",
      size: entry.kind === "file"
        ? (typeof entry.content === "string"
            ? new TextEncoder().encode(entry.content).byteLength
            : entry.content.byteLength)
        : 0,
    };
  }
}

async function fixture() {
  const bridge = new FixtureBridge();
  return { bridge, adapter: await TauriFileSystemAdapter.create("/fixture", bridge) };
}

describe("TauriFileSystemAdapter", () => {
  it("opens and lists a native directory without exposing its root", async () => {
    const { adapter } = await fixture();
    expect(adapter.getProjectName("ignored")).toBe("fixture");
    expect(await adapter.listDirectory("")).toEqual([
      expect.objectContaining({ path: "src", type: "directory" }),
    ]);
  });

  it("reads and replaces an existing UTF-8 file", async () => {
    const { adapter, bridge } = await fixture();
    expect(await adapter.readTextFile("src/index.ts")).toBe("export const value = 1;\n");
    await adapter.writeTextFile("src/index.ts", "export const value = 2;\n");
    expect(await adapter.readTextFile("src/index.ts")).toBe("export const value = 2;\n");
    expect(bridge.writes).toBe(1);
  });

  it("returns exact bytes without newline re-encoding", async () => {
    const { adapter } = await fixture();
    const lf = await adapter.readFileBytes("src/index.ts");
    const crlf = await adapter.readFileBytes("src/crlf.ts");
    expect(new TextDecoder().decode(lf)).toBe("export const value = 1;\n");
    expect(new TextDecoder().decode(crlf)).toBe("const crlf = true;\r\n");
    expect(lf).not.toEqual(crlf);
  });

  it("returns zero-byte and invalid UTF-8 source bytes unchanged", async () => {
    const { adapter } = await fixture();
    await expect(adapter.readFileBytes("src/empty.ts")).resolves.toEqual(new Uint8Array());
    await expect(adapter.readFileBytes("src/invalid.txt")).resolves.toEqual(
      Uint8Array.from([0xff, 0xfe, 0x61]),
    );
  });

  it("rejects oversized source before invoking the bounded byte read", async () => {
    const { adapter, bridge } = await fixture();
    bridge.entries.set("/fixture/src/large.ts", {
      kind: "file",
      content: "x".repeat(CODING_PACK_PROJECT_SOURCE_MAX_BYTES + 1),
    });
    const read = vi.spyOn(bridge, "readFileBytes");
    await expect(adapter.readFileBytes("src/large.ts")).rejects.toMatchObject({
      code: "coding_pack_source_too_large",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects a file that grows beyond the bound after metadata preflight", async () => {
    const { adapter, bridge } = await fixture();
    bridge.entries.set("/fixture/src/growing.ts", {
      kind: "file",
      content: "x".repeat(CODING_PACK_PROJECT_SOURCE_MAX_BYTES + 1),
    });
    const stat = bridge.stat.bind(bridge);
    bridge.stat = vi.fn(async (path) => {
      const info = await stat(path);
      return path.endsWith("/growing.ts") ? { ...info, size: 1 } : info;
    });

    await expect(adapter.readFileBytes("src/growing.ts")).rejects.toMatchObject({
      code: "coding_pack_source_too_large",
    });
  });

  it("reports existence without creating paths", async () => {
    const { adapter, bridge } = await fixture();
    expect(await adapter.exists("src/index.ts")).toBe(true);
    expect(await adapter.exists("src/missing.ts")).toBe(false);
    expect(bridge.entries.has("/fixture/src/missing.ts")).toBe(false);
  });

  it.each([
    "",
    ".",
    "./index.ts",
    "src/./index.ts",
    "src//index.ts",
    "../outside.ts",
    "/etc/passwd",
    "C:/Windows/System32/config",
    "\\\\server\\share\\file.ts",
    "src\\..\\outside.ts",
    "src/\0index.ts",
  ])("rejects unsafe relative path %s", async (path) => {
    const { adapter } = await fixture();
    await expect(adapter.readTextFile(path)).rejects.toMatchObject({ code: "unsafe_path" });
  });

  it("uses Windows separator and case semantics for containment", async () => {
    const bridge = new FixtureBridge();
    bridge.entries.clear();
    bridge.entries.set("C:\\Workspace\\Fixture", { kind: "directory" });
    bridge.entries.set("c:\\workspace\\fixture\\src", { kind: "directory" });
    bridge.entries.set("c:\\workspace\\fixture\\src\\index.ts", {
      kind: "file",
      content: "export const windows = true;\n",
    });
    bridge.separator = () => "\\";
    bridge.basename = vi.fn(async () => "Fixture");
    bridge.join = vi.fn(async (...paths) => paths.join("\\").toLowerCase());
    bridge.normalize = vi.fn(async (path) => path);

    const adapter = await TauriFileSystemAdapter.create("C:\\Workspace\\Fixture", bridge);
    await expect(adapter.readTextFile("src/index.ts")).resolves.toBe("export const windows = true;\n");
  });

  it("rejects traversal through symbolic links or junctions", async () => {
    const { adapter } = await fixture();
    await expect(adapter.readTextFile("link/secret.ts")).rejects.toMatchObject({ code: "unsafe_path" });
    await expect(adapter.readFileBytes("link/secret.ts")).rejects.toMatchObject({
      code: "coding_pack_read_failed",
    });
  });

  it.each(["../outside.ts", "/etc/passwd", "C:/Windows/System32/config"])(
    "rejects unsafe exact-byte input %s",
    async (path) => {
      const { adapter } = await fixture();
      await expect(adapter.readFileBytes(path)).rejects.toMatchObject({
        code: "coding_pack_read_failed",
      });
    },
  );

  it("rejects a normalized path outside the selected root", async () => {
    const bridge = new FixtureBridge();
    bridge.join = vi.fn(async () => "/outside/index.ts");
    const adapter = await TauriFileSystemAdapter.create("/fixture", bridge);
    await expect(adapter.readTextFile("src/index.ts")).rejects.toMatchObject({ code: "unsafe_path" });
  });

  it("rejects a selected root that is itself a symlink or junction", async () => {
    const bridge = new FixtureBridge();
    bridge.entries.set("/fixture", { kind: "symlink" });
    await expect(TauriFileSystemAdapter.create("/fixture", bridge)).rejects.toMatchObject({
      code: "unsafe_path",
    });
  });

  it("does not expose symlinks in project traversal", async () => {
    const { adapter } = await fixture();
    expect((await adapter.listDirectory("")).map((entry) => entry.path)).not.toContain("link");
  });

  it("rejects writes to missing files", async () => {
    const { adapter, bridge } = await fixture();
    await expect(adapter.writeTextFile("src/missing.ts", "new")).rejects.toMatchObject({ code: "file_not_found" });
    expect(bridge.writes).toBe(0);
    expect(bridge.entries.has("/fixture/src/missing.ts")).toBe(false);
  });

  it("rejects writes to directories", async () => {
    const { adapter, bridge } = await fixture();
    await expect(adapter.writeTextFile("src", "new")).rejects.toMatchObject({ code: "file_not_found" });
    expect(bridge.writes).toBe(0);
  });

  it("rejects unsupported binary writes", async () => {
    const { adapter, bridge } = await fixture();
    await expect(adapter.writeTextFile("src/logo.png", "new")).rejects.toMatchObject({
      code: "binary_file_unsupported",
    });
    expect(bridge.writes).toBe(0);
  });

  it("maps native errors without leaking absolute paths", async () => {
    const { adapter, bridge } = await fixture();
    bridge.readFailure = new Error("permission denied: /Users/private/fixture/src/index.ts");
    const error = await adapter.readTextFile("src/index.ts").catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "file_not_found" });
    expect(String(error)).not.toContain("/Users/private");
    expect(String(error)).not.toContain("/fixture/src/index.ts");
    const byteError = await adapter.readFileBytes("src/index.ts").catch(
      (caught: unknown) => caught,
    );
    expect(byteError).toMatchObject({ code: "coding_pack_read_failed" });
    expect(String(byteError)).not.toContain("/Users/private");
    expect(String(byteError)).not.toContain("/fixture/src/index.ts");
  });
});
