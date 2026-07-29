import { describe, expect, it } from "vitest";
import {
  DEFAULT_CODING_PACK_SELECTION_RULES,
  createCodingPackManifest,
  serializeCodingPackManifest,
  verifyCodingPackManifest,
  type CodingPackManifest,
  type CodingPackSelectionRules,
} from "../src/index.js";
import {
  GENERATED_AT,
  VALID_DIGEST,
  evidence,
  manifest,
  rules,
} from "./helpers.js";

describe("Coding Pack bounds", () => {
  it("exposes immutable reviewed default selection rules", () => {
    expect(Object.isFrozen(DEFAULT_CODING_PACK_SELECTION_RULES)).toBe(true);
    expect(DEFAULT_CODING_PACK_SELECTION_RULES).toEqual({
      version: "kerniq-coding-pack-selection-v1",
      maxFiles: 500,
      maxFileBytes: 524_288,
      maxTotalBytes: 10_485_760,
    });
  });

  it("rejects more than 500 files", async () => {
    const sources = Array.from(
      { length: DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles + 1 },
      (_, index) => evidence(`src/${String(index).padStart(3, "0")}.ts`),
    );
    await expect(manifest({ sources })).rejects.toThrow(/file count/u);
  });

  it("rejects a source above 512 KiB", async () => {
    await expect(manifest({
      sources: [
        evidence(
          "src/large.ts",
          DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes + 1,
        ),
      ],
    })).rejects.toThrow(/per-file byte limit/u);
  });

  it("rejects aggregate bytes above 10 MiB", async () => {
    const sources = Array.from(
      { length: 21 },
      (_, index) => evidence(
        `src/${String(index).padStart(2, "0")}.ts`,
        DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes,
      ),
    );
    await expect(manifest({ sources })).rejects.toThrow(/aggregate source bytes/u);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    0,
    -1,
    1.5,
  ])("rejects unsafe numeric rule value %s", async (maxFiles) => {
    await expect(manifest({
      selectionRules: {
        ...rules(),
        maxFiles,
      } as CodingPackSelectionRules,
    })).rejects.toThrow();
  });

  it("rejects unsupported numeric rule limits", async () => {
    await expect(manifest({
      selectionRules: { ...rules(), maxFiles: 499 },
    })).rejects.toThrow(/reviewed Coding Pack numeric limits/u);
  });

  it("rejects unsafe byteCount values", async () => {
    await expect(manifest({
      sources: [{ ...evidence("src/a.ts"), byteCount: Number.MAX_SAFE_INTEGER + 1 }],
    })).rejects.toThrow(/safe integer/u);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    1.5,
  ])("rejects invalid source byteCount %s", async (byteCount) => {
    await expect(manifest({
      sources: [{ ...evidence("src/a.ts"), byteCount }],
    })).rejects.toThrow();
  });

  it.each([
    "2026-02-30T12:00:00Z",
    "2026-07-29 12:00:00Z",
    "2026-07-29T25:00:00Z",
    "2026-07-29T12:00:00+24:00",
    "2026-07-29T12:00:00-00:00",
    "now",
  ])("rejects invalid explicit generatedAt value %s", async (generatedAt) => {
    await expect(manifest({ generatedAt })).rejects.toThrow(/generatedAt/u);
  });
});

describe("manifest immutability and verification", () => {
  it("deep-freezes the manifest, project, arrays, and entries", async () => {
    const result = await manifest({
      projectLabel: "Reviewed",
      exclusions: [{ relativePath: "dist/a.js", reasonCode: "generated" }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.project)).toBe(true);
    expect(Object.isFrozen(result.sources)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(Object.isFrozen(result.exclusions)).toBe(true);
    expect(Object.isFrozen(result.exclusions[0])).toBe(true);
  });

  it("does not mutate or freeze caller-owned arrays", async () => {
    const alpha = evidence("src/a.ts");
    const zeta = evidence("src/z.ts");
    const sources = [zeta, alpha];
    const exclusions = [
      { relativePath: "vendor/z.ts", reasonCode: "vendor" },
      { relativePath: "dist/a.js", reasonCode: "generated" },
    ];
    const sourceOrder = [...sources];
    const exclusionOrder = [...exclusions];

    await createCodingPackManifest({
      purpose: "repository_orientation",
      selectionRules: rules(),
      sources,
      exclusions,
      generatedAt: GENERATED_AT,
    });

    expect(sources).toEqual(sourceOrder);
    expect(exclusions).toEqual(exclusionOrder);
    expect(Object.isFrozen(sources)).toBe(false);
    expect(Object.isFrozen(exclusions)).toBe(false);
  });

  it("accepts a valid manifest after recomputing every identity", async () => {
    await expect(verifyCodingPackManifest(await manifest())).resolves.toBeUndefined();
  });

  it.each([
    ["changed file digest", (value: MutableManifest) => {
      value.sources[0].sourceDigest = `sha256:${"b".repeat(64)}`;
    }],
    ["changed byte count", (value: MutableManifest) => {
      value.sources[0].byteCount += 1;
    }],
    ["changed source fingerprint", (value: MutableManifest) => {
      value.sourceFingerprint = `sha256:${"b".repeat(64)}`;
    }],
    ["changed pack ID", (value: MutableManifest) => {
      value.packId = `pack-${"b".repeat(64)}`;
    }],
    ["changed manifest digest", (value: MutableManifest) => {
      value.manifestDigest = `sha256:${"b".repeat(64)}`;
    }],
    ["extra source inserted", (value: MutableManifest) => {
      value.sources.push(evidence("src/extra.ts"));
      value.sources.sort((left, right) => left.relativePath < right.relativePath ? -1 : 1);
    }],
  ] as const)("rejects tampering: %s", async (_label, mutate) => {
    const value = mutable(await manifest());
    mutate(value);
    await expect(verifyCodingPackManifest(value)).rejects.toThrow();
  });

  it("rejects changed encoding", async () => {
    const value = mutable(await manifest());
    value.sources[0].encoding = "utf-16";
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/encoding/u);
  });

  it("rejects a removed exclusion", async () => {
    const value = mutable(await manifest({
      exclusions: [{ relativePath: "dist/a.js", reasonCode: "generated" }],
    }));
    value.exclusions.pop();
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/fingerprint/u);
  });

  it("rejects changed generatedAt without a recomputed digest", async () => {
    const value = mutable(await manifest());
    value.generatedAt = "2026-07-29T12:00:01Z";
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/manifest digest/u);
  });

  it("rejects changed projectLabel without a recomputed digest", async () => {
    const value = mutable(await manifest({ projectLabel: "Alpha" }));
    value.project.projectLabel = "Beta";
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/manifest digest/u);
  });

  it("rejects non-canonical source ordering during verification and serialization", async () => {
    const value = mutable(await manifest({
      sources: [evidence("src/a.ts"), evidence("src/b.ts")],
    }));
    value.sources.reverse();
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/canonical UTF-8 byte order/u);
    expect(() => serializeCodingPackManifest(value)).toThrow(/canonical UTF-8 byte order/u);
  });

  it.each([
    ["projectBindingId", "project-private"],
    ["projectFingerprint", `sha256:${"a".repeat(64)}`],
    ["privateRootPath", "/Users/example/private-project"],
    ["destinationHandle", "destination-handle-private"],
    ["operationId", "operation-private"],
  ])("rejects extra private manifest field %s", async (field, privateValue) => {
    const value = {
      ...mutable(await manifest()),
      [field]: privateValue,
    };
    await expect(verifyCodingPackManifest(value)).rejects.toThrow(/unsupported field/u);
    expect(() => serializeCodingPackManifest(value)).toThrow(/unsupported field/u);
  });

  it("serializes canonical JSON without formatting whitespace", async () => {
    const result = await manifest();
    const serialized = serializeCodingPackManifest(result);
    expect(serialized.endsWith("\n")).toBe(false);
    expect(serialized).not.toContain("\n");
    expect(JSON.parse(serialized).schemaVersion).toBe("kerniq.coding-pack.manifest.v1");
    expect(serializeCodingPackManifest(result)).toBe(serialized);
  });

  it("uses the required digest formats", async () => {
    const result = await manifest();
    expect(result.sources[0].sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.sourceFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.packId).toMatch(/^pack-[0-9a-f]{64}$/u);
    expect(result.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.sources[0].sourceDigest).not.toBe(VALID_DIGEST);
  });
});

interface MutableManifest {
  schemaVersion: CodingPackManifest["schemaVersion"];
  packVersion: CodingPackManifest["packVersion"];
  packId: string;
  purpose: CodingPackManifest["purpose"];
  project: { projectLabel?: string };
  selectionRulesVersion: string;
  sources: Array<{
    relativePath: string;
    sourceDigest: string;
    byteCount: number;
    encoding: string;
    inclusionReasonCode: string;
  }>;
  exclusions: Array<{
    relativePath: string;
    reasonCode: string;
    detail?: string;
  }>;
  sourceFingerprint: string;
  generatedAt: string;
  manifestDigest: string;
}

function mutable(value: CodingPackManifest): MutableManifest {
  return JSON.parse(serializeCodingPackManifest(value)) as MutableManifest;
}
