import { describe, expect, it } from "vitest";
import {
  createCodingPackManifest,
  serializeCodingPackManifest,
  type CodingPackLocalAuthority,
} from "../src/index.js";
import {
  GENERATED_AT,
  OTHER_GENERATED_AT,
  manifest,
  rules,
  source,
} from "./helpers.js";

describe("Coding Pack deterministic identity", () => {
  it("produces an identical manifest for the same logical input in different order", async () => {
    const alpha = await source("src/alpha.ts", "alpha");
    const zeta = await source("src/zeta.ts", "zeta");
    const first = await createCodingPackManifest({
      purpose: "task_context",
      selectionRules: rules(),
      sources: [zeta, alpha],
      exclusions: [
        { relativePath: "vendor/z.ts", reasonCode: "vendor" },
        { relativePath: "dist/a.js", reasonCode: "generated" },
      ],
      generatedAt: GENERATED_AT,
    });
    const second = await createCodingPackManifest({
      purpose: "task_context",
      selectionRules: rules(),
      sources: [alpha, zeta],
      exclusions: [
        { relativePath: "dist/a.js", reasonCode: "generated" },
        { relativePath: "vendor/z.ts", reasonCode: "vendor" },
      ],
      generatedAt: GENERATED_AT,
    });

    expect(serializeCodingPackManifest(first)).toBe(serializeCodingPackManifest(second));
  });

  it("keeps local project bindings outside source identity", async () => {
    const authorityA: CodingPackLocalAuthority = {
      projectBindingId: "project-a",
      projectFingerprint: `sha256:${"a".repeat(64)}`,
      destinationHandle: "destination-a",
    };
    const authorityB: CodingPackLocalAuthority = {
      projectBindingId: "project-b",
      projectFingerprint: `sha256:${"b".repeat(64)}`,
      destinationHandle: "destination-b",
    };
    expect(authorityA).not.toEqual(authorityB);

    const first = await manifest();
    const second = await manifest();
    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.packId).toBe(second.packId);
  });

  it("excludes generatedAt from source identity but includes it in manifest identity", async () => {
    const first = await manifest({ generatedAt: GENERATED_AT });
    const second = await manifest({ generatedAt: OTHER_GENERATED_AT });

    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.packId).toBe(second.packId);
    expect(first.manifestDigest).not.toBe(second.manifestDigest);
  });

  it("excludes projectLabel from source identity but includes it in manifest identity", async () => {
    const first = await manifest({ projectLabel: "Alpha" });
    const second = await manifest({ projectLabel: "Beta" });

    expect(first.sourceFingerprint).toBe(second.sourceFingerprint);
    expect(first.packId).toBe(second.packId);
    expect(first.manifestDigest).not.toBe(second.manifestDigest);
  });

  it("changes source identity when one content byte changes", async () => {
    const first = await manifest({ sources: [await source("src/index.ts", "alpha")] });
    const second = await manifest({ sources: [await source("src/index.ts", "alphb")] });

    expect(first.sources[0].sourceDigest).not.toBe(second.sources[0].sourceDigest);
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
  });

  it("changes source identity when purpose changes", async () => {
    const first = await manifest({ purpose: "repository_orientation" });
    const second = await manifest({ purpose: "review_handoff" });
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
  });

  it("changes source identity when the rules version changes", async () => {
    const first = await manifest({ selectionRules: rules("selection-v1") });
    const second = await manifest({ selectionRules: rules("selection-v2") });
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
  });

  it("changes source identity when an exclusion changes", async () => {
    const first = await manifest({
      exclusions: [{ relativePath: "dist/a.js", reasonCode: "generated" }],
    });
    const second = await manifest({
      exclusions: [{ relativePath: "dist/b.js", reasonCode: "generated" }],
    });
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
  });

  it("includes portable-safe exclusion detail in source identity", async () => {
    const first = await manifest({
      exclusions: [
        { relativePath: "dist/a.js", reasonCode: "generated", detail: "build output" },
      ],
    });
    const second = await manifest({
      exclusions: [
        { relativePath: "dist/a.js", reasonCode: "generated", detail: "vendor output" },
      ],
    });
    expect(first.sourceFingerprint).not.toBe(second.sourceFingerprint);
  });

  it("orders source paths by exact UTF-8 bytes", async () => {
    const result = await manifest({
      sources: [
        await source("中.ts"),
        await source("é.ts"),
        await source("z.ts"),
        await source("a.ts"),
      ],
    });
    expect(result.sources.map((entry) => entry.relativePath)).toEqual([
      "a.ts",
      "z.ts",
      "é.ts",
      "中.ts",
    ]);
  });
});
