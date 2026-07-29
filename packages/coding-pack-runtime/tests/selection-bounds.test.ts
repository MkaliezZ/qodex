import { describe, expect, it } from "vitest";
import {
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
  it("excludes per-file overflow after text classification", async () => {
    const result = await select([
      candidate("src/large.txt", DEFAULT_CODING_PACK_SELECTION_RULES.maxFileBytes + 1),
      candidate("src/small.txt", 1),
    ]);

    expect(result.included.map((entry) => entry.relativePath)).toEqual(["src/small.txt"]);
    expect(result.exclusions).toEqual([
      { relativePath: "src/large.txt", reasonCode: "file_size_limit" },
    ]);
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
