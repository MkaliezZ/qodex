import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  completeCodingPackSelectionFromReadPlan,
  createCodingPackManifestFromSelection,
  DEFAULT_CODING_PACK_SELECTION_RULES,
  planCodingPackCandidateReads,
  serializeCodingPackManifest,
} from "../packages/coding-pack-runtime/dist/index.js";

const [projectArgument, manifestArgument, selectionArgument] = process.argv.slice(2);
if (!projectArgument || !manifestArgument || !selectionArgument) {
  throw new Error("usage: generate_kerniq_v0_7_4_4_fixture.mjs <project> <manifest> <selection>");
}

const projectRoot = resolve(projectArgument);
const manifestOutput = resolve(manifestArgument);
const selectionOutput = resolve(selectionArgument);
const fixtureFiles = new Map([
  ["README.md", "# KerniQ controlled native export proof\n"],
  ["src/main.ts", "import { sum } from \"./utils\";\nexport const result = sum(2, 3);\n"],
  ["src/utils.ts", "export const sum = (left, right) => left + right;\n"],
  [".env", "KERNIQ_PROOF_ONLY=excluded\n"],
]);

await mkdir(resolve(projectRoot, "src"), { recursive: true });
for (const [relativePath, contents] of fixtureFiles) {
  await writeFile(resolve(projectRoot, relativePath), contents, "utf8");
}
await writeFile(resolve(projectRoot, "notes.bin"), Uint8Array.of(0, 159, 255, 10));

const candidates = [
  { relativePath: "README.md", originCode: "explicit_selection" },
  { relativePath: "src/main.ts", originCode: "explicit_selection" },
  { relativePath: "src/utils.ts", originCode: "explicit_selection" },
  { relativePath: ".env", originCode: "explicit_selection" },
  {
    relativePath: "notes.bin",
    originCode: "explicit_selection",
    explicitlyExcluded: true,
  },
];
const plan = await planCodingPackCandidateReads({
  purpose: "task_context",
  selectionRules: DEFAULT_CODING_PACK_SELECTION_RULES,
  candidates,
});
const readRequiredPaths = plan.entries
  .filter((entry) => entry.disposition === "read_required")
  .map((entry) => entry.relativePath);
const excludedBeforeReadPaths = plan.entries
  .filter((entry) => entry.disposition === "excluded")
  .map((entry) => entry.relativePath);

assertEqual(readRequiredPaths, ["README.md", "src/main.ts", "src/utils.ts"]);
assertEqual(excludedBeforeReadPaths, [".env", "notes.bin"]);
const reads = await Promise.all(readRequiredPaths.map(async (relativePath) => ({
  relativePath,
  bytes: new Uint8Array(await readFile(resolve(projectRoot, relativePath))),
})));
const selection = await completeCodingPackSelectionFromReadPlan({ plan, reads });
assertEqual(
  selection.included.map((entry) => entry.relativePath),
  readRequiredPaths,
);
assertEqual(
  selection.exclusions.map((entry) => entry.relativePath),
  excludedBeforeReadPaths,
);

const generatedAt = "2026-08-02T00:00:00.000Z";
const manifest = await createCodingPackManifestFromSelection({
  selection,
  project: { projectLabel: "KerniQ controlled proof" },
  generatedAt,
});
await mkdir(resolve(manifestOutput, ".."), { recursive: true });
await writeFile(manifestOutput, serializeCodingPackManifest(manifest), "utf8");
await writeFile(selectionOutput, `${JSON.stringify({
  purpose: selection.purpose,
  generatedAt,
  candidatePathsDigest: selection.candidatePathsDigest,
  planDigest: plan.planDigest,
  sourceFingerprint: selection.sourceFingerprint,
  packId: selection.packId,
  readRequiredPaths,
  excludedBeforeReadPaths,
  exclusionReasonCodes: Object.fromEntries(
    selection.exclusions.map((entry) => [entry.relativePath, entry.reasonCode]),
  ),
  includedByteCounts: Object.fromEntries(
    selection.included.map((entry) => [entry.relativePath, entry.byteCount]),
  ),
}, null, 2)}\n`, "utf8");

function assertEqual(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`unexpected controlled fixture result: ${JSON.stringify(actual)}`);
  }
}
