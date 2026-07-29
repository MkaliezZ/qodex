import { describe, expect, it } from "vitest";
import {
  CODING_PACK_MAX_RELATIVE_PATH_BYTES,
  createCodingPackFileEntry,
  createCodingPackManifest,
  serializeCodingPackManifest,
  type CodingPackManifestInput,
} from "../src/index.js";
import {
  GENERATED_AT,
  VALID_DIGEST,
  evidence,
  manifest,
  rules,
  source,
} from "./helpers.js";

describe("Coding Pack portable privacy boundary", () => {
  it("does not serialize local authority or private path regression sentinels", async () => {
    const privateSentinels = [
      "/Users/example/private-project",
      "C:\\Users\\example\\private-project",
      "project-0123456789abcdef",
      "sha256:<path-derived-value>",
      `sha256:${"f".repeat(64)}`,
    ];
    const result = await createCodingPackManifest({
      purpose: "repository_orientation",
      selectionRules: rules(),
      sources: [
        await source("src/private-fixture.ts", privateSentinels.join("\n")),
      ],
      exclusions: [],
      generatedAt: GENERATED_AT,
    });
    const serialized = serializeCodingPackManifest(result);

    for (const sentinel of privateSentinels) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(serialized).not.toContain("projectBindingId");
    expect(serialized).not.toContain("projectFingerprint");
    expect(serialized).not.toContain("privateRootPath");
    expect(serialized).not.toContain("destinationHandle");
  });

  it("does not copy a local directory name when projectLabel is absent", async () => {
    const serialized = serializeCodingPackManifest(await manifest());
    expect(serialized).not.toContain("private-project");
    expect(JSON.parse(serialized).project).toEqual({});
  });

  it("accepts only an explicit bounded portable project label", async () => {
    const result = await manifest({ projectLabel: "Reviewed Label" });
    expect(result.project).toEqual({ projectLabel: "Reviewed Label" });
    await expect(manifest({ projectLabel: "  untrimmed  " })).rejects.toThrow();
    await expect(manifest({ projectLabel: "unsafe\u0000label" })).rejects.toThrow();
    await expect(manifest({ projectLabel: "x".repeat(129) })).rejects.toThrow();
  });

  it("rejects injected local authority at the manifest input boundary", async () => {
    const base = {
      purpose: "repository_orientation",
      selectionRules: rules(),
      sources: [await source("src/index.ts")],
      exclusions: [],
      generatedAt: GENERATED_AT,
    };
    await expect(createCodingPackManifest({
      ...base,
      localAuthority: {
        projectBindingId: "project-private",
        projectFingerprint: `sha256:${"d".repeat(64)}`,
      },
    } as unknown as CodingPackManifestInput)).rejects.toThrow(/unsupported field/u);
  });

  it("rejects local identity fields inside portable project metadata", async () => {
    await expect(createCodingPackManifest({
      purpose: "repository_orientation",
      project: {
        projectLabel: "Allowed",
        projectBindingId: "project-private",
      },
      selectionRules: rules(),
      sources: [await source("src/index.ts")],
      exclusions: [],
      generatedAt: GENERATED_AT,
    } as unknown as CodingPackManifestInput)).rejects.toThrow(/unsupported field/u);
  });
});

describe("portable path validation", () => {
  it.each([
    ["/absolute/file.ts", "absolute POSIX"],
    ["C:/Users/example/file.ts", "Windows drive"],
    ["//server/share/file.ts", "UNC"],
    ["src/../secret.ts", "traversal"],
    ["src\\file.ts", "backslash"],
    ["src/\u0000file.ts", "NUL"],
    ["src/\u0007file.ts", "control character"],
    ["src//file.ts", "empty segment"],
    ["src/./file.ts", "dot segment"],
    ["src/folder/", "trailing slash"],
  ])("rejects %s (%s)", async (relativePath) => {
    await expect(createCodingPackFileEntry({
      relativePath,
      bytes: new Uint8Array(),
      inclusionReason: "test fixture",
    })).rejects.toThrow();
  });

  it("rejects a path above the UTF-8 byte limit", async () => {
    await expect(createCodingPackFileEntry({
      relativePath: `${"a".repeat(CODING_PACK_MAX_RELATIVE_PATH_BYTES)}.ts`,
      bytes: new Uint8Array(),
      inclusionReason: "test fixture",
    })).rejects.toThrow();
  });

  it("preserves distinct Unicode code-point sequences without normalization", async () => {
    const composed = await source("é.ts");
    const decomposed = await source("e\u0301.ts");
    const result = await manifest({ sources: [composed, decomposed] });
    expect(result.sources.map((entry) => entry.relativePath)).toContain("é.ts");
    expect(result.sources.map((entry) => entry.relativePath)).toContain("e\u0301.ts");
  });

  it("rejects exact duplicate source paths", async () => {
    await expect(manifest({
      sources: [evidence("src/a.ts"), evidence("src/a.ts")],
    })).rejects.toThrow(/Duplicate source path/u);
  });

  it("rejects exact duplicate exclusion paths", async () => {
    await expect(manifest({
      exclusions: [
        { relativePath: "dist/a.js", reasonCode: "generated" },
        { relativePath: "dist/a.js", reasonCode: "generated" },
      ],
    })).rejects.toThrow(/Duplicate exclusion path/u);
  });

  it("rejects source and exclusion overlap", async () => {
    await expect(manifest({
      sources: [evidence("src/a.ts")],
      exclusions: [{ relativePath: "src/a.ts", reasonCode: "ignored" }],
    })).rejects.toThrow(/both included and excluded/u);
  });

  it("rejects unknown encoding, malformed digest, and extra source fields", async () => {
    await expect(manifest({
      sources: [{ ...evidence("src/a.ts"), encoding: "utf-16" } as never],
    })).rejects.toThrow(/encoding/u);
    await expect(manifest({
      sources: [{ ...evidence("src/a.ts"), sourceDigest: "sha256:bad" }],
    })).rejects.toThrow(/SHA-256/u);
    await expect(manifest({
      sources: [{ ...evidence("src/a.ts"), privateRootPath: "/private" } as never],
    })).rejects.toThrow(/unsupported field/u);
    await expect(createCodingPackFileEntry({
      relativePath: "src/a.ts",
      bytes: new Uint8Array(),
      inclusionReason: "test fixture",
      projectBindingId: "project-private",
    } as never)).rejects.toThrow(/unsupported field/u);
  });
});

describe("exact UTF-8 source evidence", () => {
  it("rejects invalid UTF-8 bytes", async () => {
    await expect(createCodingPackFileEntry({
      relativePath: "src/invalid.txt",
      bytes: new Uint8Array([0xc3, 0x28]),
      inclusionReason: "test fixture",
    })).rejects.toThrow(/valid UTF-8/u);
  });

  it("hashes CRLF and LF bytes differently", async () => {
    const crlf = await createCodingPackFileEntry({
      relativePath: "src/a.txt",
      bytes: new TextEncoder().encode("one\r\ntwo\r\n"),
      inclusionReason: "test fixture",
    });
    const lf = await createCodingPackFileEntry({
      relativePath: "src/a.txt",
      bytes: new TextEncoder().encode("one\ntwo\n"),
      inclusionReason: "test fixture",
    });
    expect(crlf.sourceDigest).not.toBe(lf.sourceDigest);
  });

  it("accepts a zero-byte UTF-8 source and records the exact digest", async () => {
    const result = await createCodingPackFileEntry({
      relativePath: "src/empty.txt",
      bytes: new Uint8Array(),
      inclusionReason: "test fixture",
    });
    expect(result.byteCount).toBe(0);
    expect(result.sourceDigest).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("rejects an unknown purpose", async () => {
    await expect(createCodingPackManifest({
      purpose: "unknown",
      selectionRules: rules(),
      sources: [evidence("src/a.ts", 1, VALID_DIGEST)],
      exclusions: [],
      generatedAt: GENERATED_AT,
    } as unknown as CodingPackManifestInput)).rejects.toThrow(/purpose/u);
  });
});
