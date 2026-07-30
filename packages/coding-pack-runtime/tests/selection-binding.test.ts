import { describe, expect, it } from "vitest";
import {
  createCodingPackManifestFromSelection,
  selectCodingPackSources,
  verifyCodingPackSelectionResult,
  type CodingPackSelectionInput,
  type CodingPackSelectionResult,
} from "../src/index.js";
import { GENERATED_AT, rules } from "./helpers.js";

const encoder = new TextEncoder();

function input(purpose: CodingPackSelectionInput["purpose"]): CodingPackSelectionInput {
  return {
    purpose,
    selectionRules: rules(),
    candidates: [
      {
        relativePath: "src/index.ts",
        bytes: encoder.encode("export const value = 1;\n"),
        originCode: "explicit_selection",
      },
      {
        relativePath: "dist/index.js",
        bytes: encoder.encode("generated"),
        originCode: "purpose_rule",
      },
    ],
  };
}

describe("Coding Pack selection identity binding", () => {
  it("binds purpose, rules, source fingerprint, and pack ID into the manifest", async () => {
    const selection = await selectCodingPackSources(input("repository_orientation"));
    const manifest = await createCodingPackManifestFromSelection({
      selection,
      generatedAt: GENERATED_AT,
    });

    expect(selection.purpose).toBe("repository_orientation");
    expect(selection.selectionRulesVersion).toBe(rules().version);
    expect(manifest.purpose).toBe(selection.purpose);
    expect(manifest.selectionRulesVersion).toBe(selection.selectionRulesVersion);
    expect(manifest.sourceFingerprint).toBe(selection.sourceFingerprint);
    expect(manifest.packId).toBe(selection.packId);
    await expect(verifyCodingPackSelectionResult(selection)).resolves.toBeUndefined();
  });

  it("makes independent purpose substitution structurally invalid", async () => {
    const selection = await selectCodingPackSources(input("repository_orientation"));
    await expect(createCodingPackManifestFromSelection({
      selection,
      generatedAt: GENERATED_AT,
      purpose: "review_handoff",
    } as unknown as Parameters<typeof createCodingPackManifestFromSelection>[0]))
      .rejects.toThrow(/unsupported field/u);
  });

  it.each([
    ["purpose", (value: MutableSelection) => {
      value.purpose = "review_handoff";
    }],
    ["rules version", (value: MutableSelection) => {
      value.selectionRulesVersion = "future-rules-v2";
    }],
    ["included evidence", (value: MutableSelection) => {
      value.included[0].sourceDigest = `sha256:${"b".repeat(64)}`;
    }],
    ["exclusion evidence", (value: MutableSelection) => {
      value.exclusions[0].reasonCode = "explicit_exclusion";
    }],
    ["totals", (value: MutableSelection) => {
      value.totals.includedBytes += 1;
    }],
  ] as const)("rejects tampered %s", async (_label, mutate) => {
    const value = mutable(await selectCodingPackSources(input("repository_orientation")));
    mutate(value);
    await expect(verifyCodingPackSelectionResult(value)).rejects.toThrow();
    await expect(createCodingPackManifestFromSelection({
      selection: value,
      generatedAt: GENERATED_AT,
    })).rejects.toThrow();
  });

  it("rejects unknown/private fields, warnings, and spoofed reason codes", async () => {
    const base = mutable(await selectCodingPackSources(input("task_context")));
    await expect(verifyCodingPackSelectionResult({
      ...base,
      projectBindingId: "project-private",
    })).rejects.toThrow(/unsupported field/u);

    const warning = mutable(await selectCodingPackSources(input("task_context")));
    warning.warnings.push({ code: "local_warning" });
    await expect(verifyCodingPackSelectionResult(warning)).rejects.toThrow(/does not emit warnings/u);

    const spoofed = mutable(await selectCodingPackSources(input("task_context")));
    spoofed.exclusions[0].reasonCode = "caller_reason";
    await expect(verifyCodingPackSelectionResult(spoofed)).rejects.toThrow(
      /unsupported reason code/u,
    );
  });

  it("changes complete identity when purpose changes", async () => {
    const orientation = await selectCodingPackSources(input("repository_orientation"));
    const handoff = await selectCodingPackSources(input("review_handoff"));

    expect(handoff.sourceFingerprint).not.toBe(orientation.sourceFingerprint);
    expect(handoff.packId).not.toBe(orientation.packId);
  });
});

interface MutableSelection {
  purpose: CodingPackSelectionInput["purpose"];
  selectionRulesVersion: string;
  sourceFingerprint: string;
  packId: string;
  included: Array<{
    relativePath: string;
    sourceDigest: string;
    byteCount: number;
    encoding: "utf-8";
    inclusionReasonCode: string;
  }>;
  exclusions: Array<{
    relativePath: string;
    reasonCode: string;
  }>;
  warnings: Array<{
    code: string;
    relativePath?: string;
  }>;
  totals: {
    candidateCount: number;
    includedCount: number;
    excludedCount: number;
    includedBytes: number;
  };
}

function mutable(value: CodingPackSelectionResult): MutableSelection {
  return JSON.parse(JSON.stringify(value)) as MutableSelection;
}
