import { describe, expect, it } from "vitest";
import {
  CODING_PACK_MAX_RELATIVE_PATH_BYTES,
  createCodingPackFileEntry,
  createCodingPackManifest,
  serializeCodingPackManifest,
  verifyCodingPackManifest,
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

const PRIVATE_SENTINELS = [
  "/Users/example/private-project",
  "C:\\Users\\example\\private-project",
  "project-0123456789abcdef",
  `sha256:${"a".repeat(64)}`,
  "destination-handle-private",
  "privateRootPath",
  "projectFingerprint",
] as const;

describe("Coding Pack portable privacy boundary", () => {
  it("does not embed source content in the portable manifest", async () => {
    const result = await createCodingPackManifest({
      purpose: "repository_orientation",
      selectionRules: rules(),
      sources: [
        await source("src/private-fixture.ts", PRIVATE_SENTINELS.join("\n")),
      ],
      exclusions: [],
      generatedAt: GENERATED_AT,
    });
    const serialized = serializeCodingPackManifest(result);

    for (const sentinel of PRIVATE_SENTINELS) {
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
    const serialized = serializeCodingPackManifest(result);
    expect(result.project).toEqual({ projectLabel: "Reviewed Label" });
    expect(serialized).toContain("Reviewed Label");
    for (const sentinel of PRIVATE_SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }
    await expect(manifest({ projectLabel: "  untrimmed  " })).rejects.toThrow();
    await expect(manifest({ projectLabel: "unsafe\u0000label" })).rejects.toThrow();
    await expect(manifest({ projectLabel: "x".repeat(129) })).rejects.toThrow();
  });

  it("serializes an explicitly approved project label exactly as supplied", async () => {
    const approvedLabel = "privateRootPath";
    const serialized = serializeCodingPackManifest(
      await manifest({ projectLabel: approvedLabel }),
    );
    expect(JSON.parse(serialized).project).toEqual({ projectLabel: approvedLabel });
    expect(serialized).toContain(approvedLabel);
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
        destinationHandle: "destination-handle-private",
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

  it.each(PRIVATE_SENTINELS)(
    "rejects private metadata in selectionRules.version: %s",
    async (sentinel) => {
      await expect(manifest({ selectionRules: rules(sentinel) })).rejects.toThrow();
    },
  );

  it.each(PRIVATE_SENTINELS)(
    "rejects private metadata in inclusionReasonCode: %s",
    async (sentinel) => {
      await expect(createCodingPackFileEntry({
        relativePath: "src/index.ts",
        bytes: new Uint8Array(),
        inclusionReasonCode: sentinel,
      })).rejects.toThrow();
    },
  );

  it.each(PRIVATE_SENTINELS)(
    "rejects private metadata in exclusion.reasonCode: %s",
    async (sentinel) => {
      await expect(manifest({
        exclusions: [{ relativePath: "private/file.ts", reasonCode: sentinel }],
      })).rejects.toThrow();
    },
  );

  it.each([...PRIVATE_SENTINELS, "unsafe\u0007detail"])(
    "rejects private metadata in exclusion.detail: %s",
    async (detail) => {
      await expect(manifest({
        exclusions: [{ relativePath: "private/file.ts", reasonCode: "private", detail }],
      })).rejects.toThrow();
    },
  );

  it.each([
    "has whitespace",
    "has/slash",
    "has\\backslash",
    "unsafe\u0007code",
    "Uppercase",
  ])("rejects non-portable machine identifier %s", async (identifier) => {
    await expect(createCodingPackFileEntry({
      relativePath: "src/index.ts",
      bytes: new Uint8Array(),
      inclusionReasonCode: identifier,
    })).rejects.toThrow();
    await expect(manifest({
      selectionRules: rules(identifier),
    })).rejects.toThrow();
    await expect(manifest({
      exclusions: [{ relativePath: "private/file.ts", reasonCode: identifier }],
    })).rejects.toThrow();
  });

  it("enforces machine identifier field limits", async () => {
    await expect(createCodingPackFileEntry({
      relativePath: "src/index.ts",
      bytes: new Uint8Array(),
      inclusionReasonCode: "a".repeat(65),
    })).rejects.toThrow();
    await expect(manifest({
      exclusions: [{ relativePath: "private/file.ts", reasonCode: "a".repeat(65) }],
    })).rejects.toThrow();
    await expect(manifest({ selectionRules: rules("a".repeat(129)) })).rejects.toThrow();
  });
});

describe("portable path validation", () => {
  it.each([
    ["/absolute/file.ts", "absolute POSIX"],
    ["C:/Users/example/file.ts", "Windows drive"],
    ["//server/share/file.ts", "UNC"],
    ["\\\\server\\share\\file.ts", "backslash UNC"],
    ["src/../secret.ts", "traversal"],
    ["src\\file.ts", "backslash"],
    ["src/\u0000file.ts", "NUL"],
    ["src/\u0007file.ts", "control character"],
    ["src/\u007ffile.ts", "DEL control character"],
    ["src//file.ts", "empty segment"],
    ["src/./file.ts", "dot segment"],
    ["src/folder/", "trailing slash"],
  ])("rejects %s (%s)", async (relativePath) => {
    await expect(createCodingPackFileEntry({
      relativePath,
      bytes: new Uint8Array(),
      inclusionReasonCode: "explicit_selection",
    })).rejects.toThrow();
  });

  it.each([
    "\uD800.ts",
    "\uD801.ts",
    "\uDC00.ts",
    "\uD800\uD801.ts",
    "src/\uD800/file.ts",
  ])("rejects ill-formed UTF-16 path %s", async (relativePath) => {
    await expect(createCodingPackFileEntry({
      relativePath,
      bytes: new Uint8Array(),
      inclusionReasonCode: "explicit_selection",
    })).rejects.toThrow(/well-formed Unicode/u);
  });

  it("rejects ill-formed UTF-16 across every portable string boundary", async () => {
    const malformed = "\uD800";
    await expect(manifest({ projectLabel: malformed })).rejects.toThrow(/well-formed Unicode/u);
    await expect(manifest({ selectionRules: rules(malformed) }))
      .rejects.toThrow(/well-formed Unicode/u);
    await expect(createCodingPackFileEntry({
      relativePath: "src/index.ts",
      bytes: new Uint8Array(),
      inclusionReasonCode: malformed,
    })).rejects.toThrow(/well-formed Unicode/u);
    await expect(manifest({
      exclusions: [{ relativePath: "private/file.ts", reasonCode: malformed }],
    })).rejects.toThrow(/well-formed Unicode/u);
    await expect(manifest({
      exclusions: [
        { relativePath: "private/file.ts", reasonCode: "private", detail: malformed },
      ],
    })).rejects.toThrow(/well-formed Unicode/u);
    await expect(manifest({ generatedAt: malformed })).rejects.toThrow(/well-formed Unicode/u);
  });

  it("accepts, preserves, sorts, serializes, and verifies valid non-BMP paths", async () => {
    const deseret = await source("src/𐐷.ts");
    const emoji = await source("src/😀.ts");
    const first = await manifest({ sources: [emoji, deseret] });
    const second = await manifest({ sources: [deseret, emoji] });

    expect(first.sources.map((entry) => entry.relativePath)).toEqual([
      "src/𐐷.ts",
      "src/😀.ts",
    ]);
    expect(serializeCodingPackManifest(first)).toBe(serializeCodingPackManifest(second));
    await expect(verifyCodingPackManifest(first)).resolves.toBeUndefined();
  });

  it("rejects a path above the UTF-8 byte limit", async () => {
    await expect(createCodingPackFileEntry({
      relativePath: `${"a".repeat(CODING_PACK_MAX_RELATIVE_PATH_BYTES)}.ts`,
      bytes: new Uint8Array(),
      inclusionReasonCode: "explicit_selection",
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
      inclusionReasonCode: "explicit_selection",
      projectBindingId: "project-private",
    } as never)).rejects.toThrow(/unsupported field/u);
    await expect(createCodingPackFileEntry({
      relativePath: "src/a.ts",
      bytes: new Uint8Array(),
      inclusionReason: "legacy free text",
    } as never)).rejects.toThrow(/unsupported field/u);
    await expect(manifest({
      sources: [{
        ...evidence("src/a.ts"),
        inclusionReasonCode: undefined,
        inclusionReason: "legacy free text",
      } as never],
    })).rejects.toThrow(/unsupported field/u);
  });
});

describe("exact UTF-8 source evidence", () => {
  it("accepts valid multibyte UTF-8 and records exact bytes", async () => {
    const bytes = new TextEncoder().encode("KerniQ 你好");
    const result = await createCodingPackFileEntry({
      relativePath: "src/unicode.txt",
      bytes,
      inclusionReasonCode: "explicit_selection",
    });
    expect(result.byteCount).toBe(bytes.byteLength);
    expect(result.encoding).toBe("utf-8");
  });

  it("rejects invalid UTF-8 bytes", async () => {
    await expect(createCodingPackFileEntry({
      relativePath: "src/invalid.txt",
      bytes: new Uint8Array([0xc3, 0x28]),
      inclusionReasonCode: "explicit_selection",
    })).rejects.toThrow(/valid UTF-8/u);
  });

  it("hashes CRLF and LF bytes differently", async () => {
    const crlf = await createCodingPackFileEntry({
      relativePath: "src/a.txt",
      bytes: new TextEncoder().encode("one\r\ntwo\r\n"),
      inclusionReasonCode: "explicit_selection",
    });
    const lf = await createCodingPackFileEntry({
      relativePath: "src/a.txt",
      bytes: new TextEncoder().encode("one\ntwo\n"),
      inclusionReasonCode: "explicit_selection",
    });
    expect(crlf.sourceDigest).not.toBe(lf.sourceDigest);
  });

  it("accepts a zero-byte UTF-8 source and records the exact digest", async () => {
    const result = await createCodingPackFileEntry({
      relativePath: "src/empty.txt",
      bytes: new Uint8Array(),
      inclusionReasonCode: "explicit_selection",
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
