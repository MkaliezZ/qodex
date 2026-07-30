import type { CodingPackSelectionRules } from "./types.js";

export const CODING_PACK_MANIFEST_SCHEMA_VERSION =
  "kerniq.coding-pack.manifest.v1" as const;
export const CODING_PACK_VERSION = "0.7" as const;
export const CODING_PACK_SELECTION_RULES_VERSION =
  "kerniq-coding-pack-selection-v1" as const;

export const CODING_PACK_MAX_RELATIVE_PATH_BYTES = 1024;
export const CODING_PACK_MAX_PATH_SEGMENT_BYTES = 255;
export const CODING_PACK_MAX_PROJECT_LABEL_BYTES = 128;
export const CODING_PACK_MAX_REASON_BYTES = 64;
export const CODING_PACK_MAX_EXCLUSION_DETAIL_BYTES = 512;
export const CODING_PACK_MAX_CANDIDATE_COUNT = 5_000;
export const CODING_PACK_MAX_ELIGIBLE_CANDIDATE_BYTES = 52_428_800;

export const DEFAULT_CODING_PACK_SELECTION_RULES: Readonly<CodingPackSelectionRules> =
  Object.freeze({
    version: CODING_PACK_SELECTION_RULES_VERSION,
    maxFiles: 500,
    maxFileBytes: 524_288,
    maxTotalBytes: 10_485_760,
  });
