import { describe, expect, it } from "vitest";
import {
  createCodingPackFileEntry,
  createCodingPackManifestFromSelection,
  selectCodingPackSources,
  type CodingPackCandidateInput,
  type CodingPackSelectionInput,
} from "../src/index.js";
import { GENERATED_AT, rules } from "./helpers.js";

const encoder = new TextEncoder();

function candidate(
  relativePath: string,
  content: string | Uint8Array = `content:${relativePath}`,
  options: Partial<Omit<CodingPackCandidateInput, "relativePath" | "bytes">> = {},
): CodingPackCandidateInput {
  return {
    relativePath,
    bytes: typeof content === "string" ? encoder.encode(content) : content,
    originCode: "project_default",
    ...options,
  };
}

function selectionInput(
  candidates: readonly CodingPackCandidateInput[],
): CodingPackSelectionInput {
  return {
    purpose: "repository_orientation",
    selectionRules: rules(),
    candidates,
  };
}

describe("Coding Pack deterministic selection", () => {
  it("returns identical results for different candidate input orders", async () => {
    const candidates = [
      candidate("src/z.ts", "z", { originCode: "purpose_rule" }),
      candidate("src/😀.ts", "emoji", { originCode: "explicit_selection" }),
      candidate("src/a.ts", "a"),
      candidate("dist/output.js", "generated"),
    ];

    const forward = await selectCodingPackSources(selectionInput(candidates));
    const reverse = await selectCodingPackSources(selectionInput([...candidates].reverse()));

    expect(reverse).toEqual(forward);
    expect(forward.included.map((entry) => entry.relativePath)).toEqual([
      "src/a.ts",
      "src/z.ts",
      "src/😀.ts",
    ]);
    expect(forward.exclusions).toEqual([
      { relativePath: "dist/output.js", reasonCode: "generated_directory" },
    ]);
  });

  it("produces manifest-compatible evidence with identical source identity", async () => {
    const candidates = [
      candidate("src/b.ts", "bravo", { originCode: "purpose_rule" }),
      candidate("src/a.ts", "alpha", { originCode: "explicit_selection" }),
      candidate("vendor/library.ts", "vendor"),
    ];
    const first = await selectCodingPackSources(selectionInput(candidates));
    const second = await selectCodingPackSources(selectionInput([...candidates].reverse()));

    const firstManifest = await createCodingPackManifestFromSelection({
      selection: first,
      generatedAt: GENERATED_AT,
    });
    const secondManifest = await createCodingPackManifestFromSelection({
      selection: second,
      generatedAt: GENERATED_AT,
    });

    expect(first.purpose).toBe("repository_orientation");
    expect(first.selectionRulesVersion).toBe(rules().version);
    expect(first.sourceFingerprint).toBe(firstManifest.sourceFingerprint);
    expect(first.packId).toBe(firstManifest.packId);
    expect(secondManifest.sourceFingerprint).toBe(firstManifest.sourceFingerprint);
    expect(secondManifest.packId).toBe(firstManifest.packId);
  });

  it("maps reviewed origin codes to inclusion reason codes", async () => {
    const result = await selectCodingPackSources(selectionInput([
      candidate("explicit.ts", "a", { originCode: "explicit_selection" }),
      candidate("purpose.ts", "b", { originCode: "purpose_rule" }),
      candidate("default.ts", "c", { originCode: "project_default" }),
    ]));

    expect(result.included.map((entry) => entry.inclusionReasonCode)).toEqual([
      "project_default",
      "explicit_selection",
      "purpose_rule",
    ]);
  });

  it("keeps zero-byte text and exact LF/CRLF byte identity", async () => {
    const result = await selectCodingPackSources(selectionInput([
      candidate("empty.txt", new Uint8Array()),
      candidate("lf.txt", "line\n"),
      candidate("crlf.txt", "line\r\n"),
    ]));
    const byPath = new Map(result.included.map((entry) => [entry.relativePath, entry]));

    expect(byPath.get("empty.txt")?.byteCount).toBe(0);
    expect(byPath.get("lf.txt")?.sourceDigest).not.toBe(byPath.get("crlf.txt")?.sourceDigest);
  });

  it("excludes invalid UTF-8 without hiding contract errors", async () => {
    const result = await selectCodingPackSources(selectionInput([
      candidate("invalid.txt", Uint8Array.of(0xc3, 0x28)),
      candidate("valid.txt", "valid"),
    ]));

    expect(result.included.map((entry) => entry.relativePath)).toEqual(["valid.txt"]);
    expect(result.exclusions).toEqual([
      { relativePath: "invalid.txt", reasonCode: "invalid_utf8" },
    ]);

    await expect(selectCodingPackSources({
      ...selectionInput([]),
      candidates: [{ ...candidate("bad.txt"), bytes: "not-bytes" }],
    } as unknown as CodingPackSelectionInput)).rejects.toThrow(/Uint8Array/u);
  });

  it("excludes reviewed binary extensions case-insensitively", async () => {
    const result = await selectCodingPackSources(selectionInput([
      candidate("assets/photo.PNG", "not inspected as text"),
      candidate("data/store.sqlite3", "not inspected as text"),
      candidate("src/index.ts", "text"),
    ]));

    expect(result.included.map((entry) => entry.relativePath)).toEqual(["src/index.ts"]);
    expect(result.exclusions).toEqual([
      { relativePath: "assets/photo.PNG", reasonCode: "binary_like_extension" },
      { relativePath: "data/store.sqlite3", reasonCode: "binary_like_extension" },
    ]);
  });
});

describe("Coding Pack selection contracts and immutability", () => {
  it("validates exact input and candidate shapes", async () => {
    await expect(selectCodingPackSources({
      ...selectionInput([]),
      extra: "unsupported",
    } as unknown as CodingPackSelectionInput)).rejects.toThrow(/unsupported field/u);

    await expect(selectCodingPackSources(selectionInput([
      { ...candidate("src/a.ts"), extra: "unsupported" } as CodingPackCandidateInput,
    ]))).rejects.toThrow(/unsupported field/u);
  });

  it.each(["manual", "filesystem", ""])(
    "rejects unknown origin code %s",
    async (originCode) => {
      await expect(selectCodingPackSources(selectionInput([
        candidate("src/a.ts", "a", {
          originCode: originCode as CodingPackCandidateInput["originCode"],
        }),
      ]))).rejects.toThrow(/originCode/u);
    },
  );

  it("rejects unknown rules versions and caller-controlled ignore reasons", async () => {
    await expect(selectCodingPackSources({
      ...selectionInput([]),
      selectionRules: rules("future-rules-v2"),
    })).rejects.toThrow(/reviewed KerniQ Coding Pack rules version/u);

    await expect(selectCodingPackSources(selectionInput([
      {
        ...candidate("src/a.ts", "a", { ignoredByProjectRules: true }),
        projectIgnoreReasonCode: "hard_private_path",
      } as CodingPackCandidateInput,
    ]))).rejects.toThrow(/unsupported field/u);
  });

  it("rejects invalid paths, malformed Unicode, and exact duplicates", async () => {
    await expect(selectCodingPackSources(selectionInput([
      candidate("../escape.ts"),
    ]))).rejects.toThrow(/unsafe segment/u);
    await expect(selectCodingPackSources(selectionInput([
      candidate("src/\uD800.ts"),
    ]))).rejects.toThrow(/well-formed Unicode/u);
    await expect(selectCodingPackSources(selectionInput([
      candidate("src/a.ts", "first"),
      candidate("src/a.ts", "second"),
    ]))).rejects.toMatchObject({ code: "duplicate_path" });
  });

  it("makes defensive byte copies and does not mutate caller-owned values", async () => {
    const bytes = encoder.encode("original");
    const candidates = [candidate("src/a.ts", bytes)];
    const expected = await createCodingPackFileEntry({
      relativePath: "src/a.ts",
      bytes: Uint8Array.from(bytes),
      inclusionReasonCode: "project_default",
    });
    const pending = selectCodingPackSources(selectionInput(candidates));
    bytes.fill(0);
    const result = await pending;

    expect(result.included[0].sourceDigest).toBe(expected.sourceDigest);
    expect(candidates[0].bytes).toBe(bytes);
    expect(Object.isFrozen(candidates)).toBe(false);
    expect(Object.isFrozen(bytes)).toBe(false);
  });

  it("deep-freezes every returned collection and record", async () => {
    const result = await selectCodingPackSources(selectionInput([
      candidate("src/a.ts"),
      candidate("ignored.ts", "ignored", { ignoredByProjectRules: true }),
    ]));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.included)).toBe(true);
    expect(Object.isFrozen(result.included[0])).toBe(true);
    expect(Object.isFrozen(result.exclusions)).toBe(true);
    expect(Object.isFrozen(result.exclusions[0])).toBe(true);
    expect(Object.isFrozen(result.warnings)).toBe(true);
    expect(Object.isFrozen(result.totals)).toBe(true);
    expect(result.sourceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.packId).toBe(`pack-${result.sourceFingerprint.slice("sha256:".length)}`);
    expect(result.warnings).toEqual([]);
    expect(result.totals).toEqual({
      candidateCount: 2,
      includedCount: 1,
      excludedCount: 1,
      includedBytes: candidatesByteLength("src/a.ts"),
    });
  });
});

function candidatesByteLength(relativePath: string): number {
  return encoder.encode(`content:${relativePath}`).byteLength;
}
