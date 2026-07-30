import { describe, expect, it, vi } from "vitest";
import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  WebFileSystemAdapter,
} from "../src/index.js";

interface BrowserFileFixture {
  readonly bytes: Uint8Array;
  readonly reportedSize?: number;
  readonly readError?: Error;
}

async function browserAdapter(
  files: Record<string, BrowserFileFixture>,
): Promise<{
  adapter: WebFileSystemAdapter;
  arrayBufferCalls: Map<string, ReturnType<typeof vi.fn>>;
}> {
  const arrayBufferCalls = new Map<string, ReturnType<typeof vi.fn>>();
  const handles = new Map<string, FileSystemFileHandle>();

  for (const [name, fixture] of Object.entries(files)) {
    const arrayBuffer = vi.fn(async () => {
      if (fixture.readError) throw fixture.readError;
      return fixture.bytes.slice().buffer;
    });
    arrayBufferCalls.set(name, arrayBuffer);
    handles.set(name, {
      kind: "file",
      name,
      getFile: vi.fn(async () => ({
        size: fixture.reportedSize ?? fixture.bytes.byteLength,
        arrayBuffer,
      })),
    } as unknown as FileSystemFileHandle);
  }

  const root = {
    kind: "directory",
    name: "fixture",
    async *entries() {
      for (const [name, handle] of handles) yield [name, handle];
    },
  } as unknown as FileSystemDirectoryHandle;
  const adapter = new WebFileSystemAdapter(root);
  await adapter.listDirectory("");
  return { adapter, arrayBufferCalls };
}

describe("WebFileSystemAdapter exact-byte source access", () => {
  it("preserves LF, CRLF, zero-byte, and invalid UTF-8 sources", async () => {
    const lf = new TextEncoder().encode("const value = 1;\n");
    const crlf = new TextEncoder().encode("const value = 1;\r\n");
    const invalid = Uint8Array.from([0xff, 0xfe, 0x61]);
    const { adapter } = await browserAdapter({
      "lf.ts": { bytes: lf },
      "crlf.ts": { bytes: crlf },
      "empty.ts": { bytes: new Uint8Array() },
      "invalid.txt": { bytes: invalid },
    });

    await expect(adapter.readFileBytes("lf.ts")).resolves.toEqual(lf);
    await expect(adapter.readFileBytes("crlf.ts")).resolves.toEqual(crlf);
    await expect(adapter.readFileBytes("empty.ts")).resolves.toEqual(new Uint8Array());
    await expect(adapter.readFileBytes("invalid.txt")).resolves.toEqual(invalid);
  });

  it("rejects oversized files before allocating their ArrayBuffer", async () => {
    const { adapter, arrayBufferCalls } = await browserAdapter({
      "large.ts": {
        bytes: new Uint8Array(),
        reportedSize: CODING_PACK_PROJECT_SOURCE_MAX_BYTES + 1,
      },
    });

    await expect(adapter.readFileBytes("large.ts")).rejects.toMatchObject({
      code: "coding_pack_source_too_large",
    });
    expect(arrayBufferCalls.get("large.ts")).not.toHaveBeenCalled();
  });

  it.each(["../outside.ts", "/etc/passwd", "C:/Windows/System32/config"])(
    "rejects unsafe relative input %s",
    async (path) => {
      const { adapter } = await browserAdapter({
        "safe.ts": { bytes: new TextEncoder().encode("safe") },
      });
      await expect(adapter.readFileBytes(path)).rejects.toMatchObject({
        code: "coding_pack_read_failed",
      });
    },
  );

  it("fails unreadable files without exposing raw local errors", async () => {
    const { adapter } = await browserAdapter({
      "secret.ts": {
        bytes: new Uint8Array(),
        readError: new Error("permission denied: /Users/private/secret.ts"),
      },
    });
    const error = await adapter.readFileBytes("secret.ts").catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ code: "coding_pack_read_failed" });
    expect(String(error)).not.toContain("/Users/private");
  });
});
