import { describe, expect, it } from "vitest";
import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
  DEFAULT_CODING_PACK_SELECTION_RULES,
  completeCodingPackSelectionFromReadPlan,
  digestCodingPackCandidatePaths,
  planCodingPackCandidateReads,
  selectCodingPackSources,
  verifyCodingPackSelectionResult,
  type CodingPackCandidateInput,
  type CodingPackReadPlan,
} from "../src/index.js";

const encoder = new TextEncoder();

function candidate(
  relativePath: string,
  content = `content:${relativePath}`,
  options: Partial<CodingPackCandidateInput> = {},
): CodingPackCandidateInput {
  return {
    relativePath,
    bytes: encoder.encode(content),
    originCode: "explicit_selection",
    ...options,
  };
}

async function plan(candidates: readonly Omit<CodingPackCandidateInput, "bytes">[]) {
  return planCodingPackCandidateReads({
    purpose: "repository_orientation",
    selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
    candidates,
  });
}

describe("Coding Pack pre-read planning", () => {
  it("classifies every byte-independent exclusion before any read", async () => {
    const value = await plan([
      { relativePath: ".env", originCode: "explicit_selection" },
      { relativePath: "keys/private.pem", originCode: "explicit_selection" },
      { relativePath: "node_modules/pkg/index.js", originCode: "explicit_selection" },
      { relativePath: "assets/logo.png", originCode: "explicit_selection" },
      {
        relativePath: "src/ignored.ts",
        originCode: "explicit_selection",
        ignoredByProjectRules: true,
      },
      { relativePath: "src/index.ts", originCode: "explicit_selection" },
    ]);

    expect(value.entries.map(({ relativePath, disposition, exclusionReasonCode }) => ({
      relativePath,
      disposition,
      exclusionReasonCode,
    }))).toEqual([
      { relativePath: ".env", disposition: "excluded", exclusionReasonCode: "credential_like_name" },
      { relativePath: "assets/logo.png", disposition: "excluded", exclusionReasonCode: "binary_like_extension" },
      { relativePath: "keys/private.pem", disposition: "excluded", exclusionReasonCode: "credential_like_name" },
      { relativePath: "node_modules/pkg/index.js", disposition: "excluded", exclusionReasonCode: "vendor_directory" },
      { relativePath: "src/ignored.ts", disposition: "excluded", exclusionReasonCode: "project_ignore" },
      { relativePath: "src/index.ts", disposition: "read_required", exclusionReasonCode: undefined },
    ]);
    expect(value.readRequiredCount).toBe(1);
    expect(value.excludedBeforeReadCount).toBe(5);
  });

  it("rejects candidate count overflow before candidate mapping", async () => {
    const candidates = Array.from(
      { length: CODING_PACK_MAX_CANDIDATE_COUNT + 1 },
      () => null,
    );
    await expect(planCodingPackCandidateReads({
      purpose: "repository_orientation",
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates,
    } as never)).rejects.toThrow(/candidate count/u);
  });

  it("rejects tampered plans and missing, extra, duplicate, or excluded reads", async () => {
    const value = await plan([
      { relativePath: ".env", originCode: "explicit_selection" },
      { relativePath: "src/index.ts", originCode: "explicit_selection" },
    ]);
    const validRead = { relativePath: "src/index.ts", bytes: encoder.encode("ok") };

    await expect(completeCodingPackSelectionFromReadPlan({
      plan: { ...value, planDigest: `sha256:${"a".repeat(64)}` },
      reads: [validRead],
    })).rejects.toThrow(/plan digest/u);
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: value,
      reads: [],
    })).rejects.toThrow(/exactly match/u);
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: value,
      reads: [validRead, { ...validRead }],
    })).rejects.toThrow(/Duplicate/u);
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: value,
      reads: [validRead, { relativePath: "extra.ts", bytes: encoder.encode("extra") }],
    })).rejects.toThrow();
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: value,
      reads: [{ relativePath: ".env", bytes: encoder.encode("secret") }],
    })).rejects.toThrow();
  });

  it("keeps direct selection identical to plan plus exact reads", async () => {
    const candidates = [
      candidate("src/b.ts", "b"),
      candidate(".env", "secret"),
      candidate("src/a.ts", "a"),
      candidate("assets/logo.png", "binary"),
    ];
    const direct = await selectCodingPackSources({
      purpose: "repository_orientation",
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates,
    });
    const readPlan = await plan(candidates.map(({ bytes: _bytes, ...metadata }) => metadata));
    const reads = candidates
      .filter((item) =>
        readPlan.entries.find((entry) => entry.relativePath === item.relativePath)
          ?.disposition === "read_required"
      )
      .map(({ relativePath, bytes }) => ({ relativePath, bytes }));
    const completed = await completeCodingPackSelectionFromReadPlan({
      plan: readPlan,
      reads,
    });

    expect(completed).toEqual(direct);
  });

  it("enforces eligible byte limits before hashing the overflowing set", async () => {
    const shared = new Uint8Array(DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes);
    const count = Math.floor(
      CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES / shared.byteLength,
    ) + 1;
    const candidates = Array.from({ length: count }, (_, index) => ({
      relativePath: `src/${String(index).padStart(3, "0")}.txt`,
      originCode: "explicit_selection" as const,
    }));
    const readPlan = await plan(candidates);
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: readPlan,
      reads: candidates.map(({ relativePath }) => ({ relativePath, bytes: shared })),
    })).rejects.toThrow(/eligible candidate bytes/u);
  });
});

describe("Coding Pack candidate path identity", () => {
  it("is input-order independent and covers included plus excluded paths", async () => {
    const first = await selectCodingPackSources({
      purpose: "repository_orientation",
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates: [candidate("src/a.ts"), candidate(".env", "secret")],
    });
    const reverse = await selectCodingPackSources({
      purpose: "repository_orientation",
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates: [candidate(".env", "secret"), candidate("src/a.ts")],
    });
    const includedOnly = await digestCodingPackCandidatePaths(["src/a.ts"]);

    expect(reverse.candidatePathsDigest).toBe(first.candidatePathsDigest);
    expect(first.candidatePathsDigest).not.toBe(includedOnly);
  });

  it("recomputes candidate path identity and rejects missing or tampered evidence", async () => {
    const value = await selectCodingPackSources({
      purpose: "repository_orientation",
      selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
      candidates: [candidate("src/a.ts"), candidate(".env", "secret")],
    });
    await expect(verifyCodingPackSelectionResult({
      ...value,
      candidatePathsDigest: `sha256:${"a".repeat(64)}`,
    })).rejects.toThrow(/candidate path identity/u);
    await expect(verifyCodingPackSelectionResult({
      ...value,
      exclusions: [],
      totals: { ...value.totals, candidateCount: 1, excludedCount: 0 },
    })).rejects.toThrow();
  });

  it("rejects a plan whose disposition was altered even with a recomputed-looking shape", async () => {
    const value = await plan([
      { relativePath: ".env", originCode: "explicit_selection" },
    ]);
    const tampered = {
      ...value,
      entries: [{
        relativePath: ".env",
        originCode: "explicit_selection",
        disposition: "read_required",
      }],
      readRequiredCount: 1,
      excludedBeforeReadCount: 0,
    } as CodingPackReadPlan;
    await expect(completeCodingPackSelectionFromReadPlan({
      plan: tampered,
      reads: [{ relativePath: ".env", bytes: encoder.encode("secret") }],
    })).rejects.toThrow(/classifier/u);
  });
});
