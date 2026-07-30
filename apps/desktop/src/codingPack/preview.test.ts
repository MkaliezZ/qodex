import { describe, expect, it } from "vitest";
import {
  CODING_PACK_PROJECT_SOURCE_MAX_BYTES,
  CodingPackProjectSourceError,
  type CodingPackProjectSourceAdapter,
} from "@qodex/project-runtime";
import { DEFAULT_CODING_PACK_SELECTION_RULES } from "@qodex/coding-pack-runtime";
import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
} from "@qodex/coding-pack-runtime";
import {
  codingPackSelectionRulesVersion,
  confirmCodingPackPreview,
  createSelectedFileCodingPackPreview,
  digestSelectedPaths,
  isCodingPackPreviewStale,
  verifyCodingPackPreviewConfirmation,
  type CodingPackPreview,
} from "./preview";

const CREATED_AT = "2026-07-30T00:00:00.000Z";
const CONFIRMED_AT = "2026-07-30T00:01:00.000Z";

class FixtureSource implements CodingPackProjectSourceAdapter {
  readonly reads: string[] = [];

  constructor(readonly files: Map<string, Uint8Array>) {}

  async readFileBytes(relativePath: string): Promise<Uint8Array> {
    this.reads.push(relativePath);
    const bytes = this.files.get(relativePath);
    if (!bytes) {
      throw new CodingPackProjectSourceError(
        "coding_pack_read_failed",
        "bounded fixture failure",
      );
    }
    return bytes.slice();
  }
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function preview(
  overrides: Partial<{
    projectBindingId: string;
    projectGeneration: number;
    selectedPaths: readonly string[];
    purpose: "repository_orientation" | "task_context" | "review_handoff";
    source: CodingPackProjectSourceAdapter;
    createdAt: string;
  }> = {},
): Promise<Readonly<CodingPackPreview>> {
  return createSelectedFileCodingPackPreview({
    projectBindingId: "project-local-only",
    projectGeneration: 1,
    selectedPaths: ["src/a.ts", "src/b.ts"],
    purpose: "repository_orientation",
    source: new FixtureSource(new Map([
      ["src/a.ts", bytes("export const a = 1;\n")],
      ["src/b.ts", bytes("export const b = 2;\n")],
    ])),
    createdAt: CREATED_AT,
    ...overrides,
  });
}

function currentBinding(value: CodingPackPreview) {
  return {
    projectBindingId: value.projectBindingId,
    projectGeneration: value.projectGeneration,
    selectedPathsDigest: value.selectedPathsDigest,
    purpose: value.selection.purpose,
    selectionRulesVersion: codingPackSelectionRulesVersion,
  } as const;
}

describe("selected-file Coding Pack preview", () => {
  it("keeps the authorized source-read cap tied to the reviewed selection rule", () => {
    expect(CODING_PACK_PROJECT_SOURCE_MAX_BYTES).toBe(
      DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes,
    );
  });

  it("reads each selected path exactly once in canonical UTF-8 order", async () => {
    const source = new FixtureSource(new Map([
      ["src/a.ts", bytes("a\n")],
      ["src/b.ts", bytes("b\n")],
    ]));
    const result = await preview({
      selectedPaths: ["src/b.ts", "src/a.ts"],
      source,
    });

    expect(source.reads).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.selection.included.map((file) => file.relativePath)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(result.selection.included.every(
      (file) => file.inclusionReasonCode === "explicit_selection",
    )).toBe(true);
    expect(result.selectedPathsDigest).toBe(result.selection.candidatePathsDigest);
  });

  it("pre-excludes private, vendor, ignored, and binary paths without reading them", async () => {
    const source = new FixtureSource(new Map([
      ["src/index.ts", bytes("export const value = 1;\n")],
    ]));
    const result = await preview({
      selectedPaths: [
        ".env",
        "assets/logo.png",
        "keys/private.pem",
        "node_modules/pkg/index.js",
        "src/index.ts",
      ],
      source,
    });

    expect(source.reads).toEqual(["src/index.ts"]);
    expect(result.selection.exclusions).toEqual([
      { relativePath: ".env", reasonCode: "credential_like_name" },
      { relativePath: "assets/logo.png", reasonCode: "binary_like_extension" },
      { relativePath: "keys/private.pem", reasonCode: "credential_like_name" },
      { relativePath: "node_modules/pkg/index.js", reasonCode: "vendor_directory" },
    ]);
  });

  it("rejects 5001 selected paths before the first source read", async () => {
    const source = new FixtureSource(new Map());
    await expect(preview({
      selectedPaths: Array.from(
        { length: CODING_PACK_MAX_CANDIDATE_COUNT + 1 },
        (_, index) => `src/${String(index).padStart(4, "0")}.ts`,
      ),
      source,
    })).rejects.toMatchObject({ code: "coding_pack_selection_failed" });
    expect(source.reads).toEqual([]);
  });

  it("stops reading immediately when the eligible byte budget overflows", async () => {
    const shared = new Uint8Array(DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes);
    const count = Math.floor(
      CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES / shared.byteLength,
    ) + 2;
    const selectedPaths = Array.from(
      { length: count },
      (_, index) => `src/${String(index).padStart(3, "0")}.txt`,
    );
    const source: CodingPackProjectSourceAdapter & { reads: string[] } = {
      reads: [],
      async readFileBytes(relativePath) {
        this.reads.push(relativePath);
        return shared;
      },
    };

    await expect(preview({ selectedPaths, source })).rejects.toMatchObject({
      code: "coding_pack_selection_failed",
    });
    expect(source.reads).toHaveLength(
      Math.floor(CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES / shared.byteLength) + 1,
    );
    expect(source.reads).not.toContain(selectedPaths.at(-1));
  });

  it("produces identical identity for different UI selection order", async () => {
    const first = await preview({ selectedPaths: ["src/a.ts", "src/b.ts"] });
    const second = await preview({ selectedPaths: ["src/b.ts", "src/a.ts"] });

    expect(second.selectedPathsDigest).toBe(first.selectedPathsDigest);
    expect(second.selection.sourceFingerprint).toBe(first.selection.sourceFingerprint);
    expect(second.selection.packId).toBe(first.selection.packId);
    expect(second.manifest.manifestDigest).toBe(first.manifest.manifestDigest);
  });

  it("changes source identity when purpose or refreshed source bytes change", async () => {
    const orientation = await preview();
    const task = await preview({ purpose: "task_context" });
    const changed = await preview({
      source: new FixtureSource(new Map([
        ["src/a.ts", bytes("export const a = 99;\n")],
        ["src/b.ts", bytes("export const b = 2;\n")],
      ])),
    });

    expect(task.selection.sourceFingerprint).not.toBe(
      orientation.selection.sourceFingerprint,
    );
    expect(changed.selection.sourceFingerprint).not.toBe(
      orientation.selection.sourceFingerprint,
    );
  });

  it("preserves zero bytes and lets selection classify invalid UTF-8", async () => {
    const result = await preview({
      selectedPaths: ["empty.ts", "invalid.txt"],
      source: new FixtureSource(new Map([
        ["empty.ts", new Uint8Array()],
        ["invalid.txt", Uint8Array.from([0xff, 0xfe, 0x61])],
      ])),
    });

    expect(result.selection.included).toEqual([
      expect.objectContaining({ relativePath: "empty.ts", byteCount: 0 }),
    ]);
    expect(result.selection.exclusions).toEqual([
      { relativePath: "invalid.txt", reasonCode: "invalid_utf8" },
    ]);
  });

  it("fails truthfully when any selected read fails and returns no partial preview", async () => {
    const source = new FixtureSource(new Map([
      ["src/a.ts", bytes("a")],
    ]));
    await expect(preview({
      selectedPaths: ["src/a.ts", "src/missing.ts", "src/z.ts"],
      source,
    })).rejects.toMatchObject({ code: "coding_pack_read_failed" });
    expect(source.reads).toEqual(["src/a.ts", "src/missing.ts"]);
  });

  it("does not read when no files are selected", async () => {
    const source = new FixtureSource(new Map());
    await expect(preview({
      selectedPaths: [],
      source,
    })).rejects.toMatchObject({ code: "coding_pack_no_selection" });
    expect(source.reads).toEqual([]);
  });

  it("keeps local project authority out of the portable manifest", async () => {
    const result = await preview({
      projectBindingId: "project-super-private-binding",
    });
    const portable = JSON.stringify(result.manifest);

    expect(portable).not.toContain("project-super-private-binding");
    expect(portable).not.toContain("projectBindingId");
    expect(portable).not.toContain("privateRootPath");
  });
});

describe("exact preview confirmation", () => {
  it("confirms and verifies the exact preview without export authority", async () => {
    const result = await preview();
    const confirmation = await confirmCodingPackPreview(
      result,
      currentBinding(result),
      { confirmationId: "confirmation-1", confirmedAt: CONFIRMED_AT },
    );

    await expect(
      verifyCodingPackPreviewConfirmation(confirmation, result),
    ).resolves.toBeUndefined();
    expect("authorizesExport" in confirmation).toBe(false);
    expect("destinationHandle" in confirmation).toBe(false);
  });

  it.each([
    ["project", (value: CodingPackPreview) => ({
      ...currentBinding(value),
      projectBindingId: "project-changed",
    })],
    ["generation", (value: CodingPackPreview) => ({
      ...currentBinding(value),
      projectGeneration: value.projectGeneration + 1,
    })],
    ["selection", (value: CodingPackPreview) => ({
      ...currentBinding(value),
      selectedPathsDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })],
    ["purpose", (value: CodingPackPreview) => ({
      ...currentBinding(value),
      purpose: "review_handoff" as const,
    })],
    ["rules", (value: CodingPackPreview) => ({
      ...currentBinding(value),
      selectionRulesVersion: "future-rules",
    })],
  ])("rejects a stale %s binding", async (_label, mutate) => {
    const result = await preview();
    const current = mutate(result);
    expect(isCodingPackPreviewStale(result, current)).toBe(true);
    await expect(confirmCodingPackPreview(result, current)).rejects.toMatchObject({
      code: "coding_pack_preview_stale",
    });
  });

  it("rejects tampered preview fingerprints", async () => {
    const result = await preview();
    const tampered = {
      ...result,
      selection: {
        ...result.selection,
        sourceFingerprint:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    } as CodingPackPreview;
    await expect(
      confirmCodingPackPreview(tampered, currentBinding(tampered)),
    ).rejects.toMatchObject({ code: "coding_pack_confirmation_mismatch" });
  });

  it("rejects a preview whose selected path digest alone was tampered", async () => {
    const result = await preview();
    const tampered = {
      ...result,
      selectedPathsDigest:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    } as CodingPackPreview;
    await expect(
      confirmCodingPackPreview(tampered, currentBinding(tampered)),
    ).rejects.toMatchObject({ code: "coding_pack_confirmation_mismatch" });
  });

  it("invalidates an old confirmation after manual refresh", async () => {
    const before = await preview();
    const confirmation = await confirmCodingPackPreview(
      before,
      currentBinding(before),
      { confirmationId: "confirmation-before", confirmedAt: CONFIRMED_AT },
    );
    const after = await preview({
      createdAt: "2026-07-30T00:02:00.000Z",
    });

    expect(after.manifest.manifestDigest).not.toBe(before.manifest.manifestDigest);
    await expect(
      verifyCodingPackPreviewConfirmation(confirmation, after),
    ).rejects.toMatchObject({ code: "coding_pack_confirmation_mismatch" });
  });

  it("digests canonical selected relative paths only", async () => {
    const digest = await digestSelectedPaths(["src/b.ts", "src/a.ts"]);
    await expect(digestSelectedPaths(["src/a.ts", "src/b.ts"])).resolves.toBe(digest);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
