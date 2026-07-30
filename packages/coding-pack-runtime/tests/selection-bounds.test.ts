import { describe, expect, it, vi } from "vitest";
import {
  CODING_PACK_MAX_CANDIDATE_COUNT,
  CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES,
  DEFAULT_CODING_PACK_SELECTION_RULES,
  selectCodingPackSources,
  type CodingPackCandidateInput,
  type CodingPackSelectionInput,
} from "../src/index.js";
import { rules } from "./helpers.js";

function candidate(relativePath: string, size: number): CodingPackCandidateInput {
  return {
    relativePath,
    bytes: new Uint8Array(size).fill(0x61),
    originCode: "purpose_rule",
  };
}

function select(candidates: readonly CodingPackCandidateInput[]) {
  const input: CodingPackSelectionInput = {
    purpose: "review_handoff",
    selectionRules: rules(),
    candidates,
  };
  return selectCodingPackSources(input);
}

describe("Coding Pack deterministic selection budgets", () => {
  it("excludes per-file overflow without decoding it", async () => {
    const decode = vi.spyOn(TextDecoder.prototype, "decode");
    const oversized = new Uint8Array(
      DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes + 1,
    ).fill(0xff);
    const result = await select([{
      relativePath: "src/large.txt",
      bytes: oversized,
      originCode: "purpose_rule",
    }]);

    expect(decode).not.toHaveBeenCalled();
    expect(result.exclusions).toEqual([
      { relativePath: "src/large.txt", reasonCode: "file_size_limit" },
    ]);
    expect(oversized.every((byte) => byte === 0xff)).toBe(true);
    decode.mockRestore();
  });

  it("rejects candidate count overflow before candidate mapping", async () => {
    const candidates = Array.from(
      { length: CODING_PACK_MAX_CANDIDATE_COUNT + 1 },
      () => null,
    );
    await expect(selectCodingPackSources({
      purpose: "review_handoff",
      selectionRules: rules(),
      candidates,
    } as unknown as CodingPackSelectionInput)).rejects.toThrow(/candidate count/u);
  });

  it("does not charge hard-excluded bytes to the eligible-byte budget", async () => {
    const largePrivateBytes = new Uint8Array(
      CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES + 1,
    );
    const result = await select([
      {
        relativePath: ".git/large-private",
        bytes: largePrivateBytes,
        originCode: "explicit_selection",
      },
      candidate("src/a.ts", 1),
    ]);

    expect(result.included.map((entry) => entry.relativePath)).toEqual(["src/a.ts"]);
    expect(result.exclusions).toEqual([
      { relativePath: ".git/large-private", reasonCode: "hard_private_path" },
    ]);
  });

  it("rejects eligible candidate bytes above the reviewed cap", async () => {
    const sharedBytes = new Uint8Array(
      DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes,
    ).fill(0x61);
    const count = Math.floor(
      CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES / sharedBytes.byteLength,
    ) + 1;
    const candidates = Array.from({ length: count }, (_, index) => ({
      relativePath: `src/${String(index).padStart(3, "0")}.txt`,
      bytes: sharedBytes,
      originCode: "purpose_rule" as const,
    }));

    await expect(select(candidates)).rejects.toThrow(/eligible candidate bytes/u);
    expect(sharedBytes.every((byte) => byte === 0x61)).toBe(true);
  });

  it("makes file-count overflow independent of input order", async () => {
    const candidates = Array.from(
      { length: DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles + 1 },
      (_, index) => candidate(`src/${String(index).padStart(3, "0")}.txt`, 0),
    );

    const forward = await select(candidates);
    const reverse = await select([...candidates].reverse());

    expect(reverse).toEqual(forward);
    expect(forward.included).toHaveLength(DEFAULT_CODING_PACK_SELECTION_RULES.maxFiles);
    expect(forward.exclusions).toEqual([
      { relativePath: "src/500.txt", reasonCode: "file_count_limit" },
    ]);
  });

  it("makes aggregate-byte overflow independent of input order", async () => {
    const fileSize = DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes;
    const candidates = Array.from(
      { length: 21 },
      (_, index) => candidate(`src/${String(index).padStart(2, "0")}.txt`, fileSize),
    );

    const forward = await select(candidates);
    const reverse = await select([...candidates].reverse());

    expect(reverse).toEqual(forward);
    expect(forward.included).toHaveLength(20);
    expect(forward.totals.includedBytes).toBe(
      DEFAULT_CODING_PACK_SELECTION_RULES.maxTotalBytes,
    );
    expect(forward.exclusions).toEqual([
      { relativePath: "src/20.txt", reasonCode: "aggregate_size_limit" },
    ]);
  });
});
