import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DSH_PINNED_SOURCE } from "../src/contract.mjs";

const root = process.argv[2];
assert.ok(root, "usage: node verify-source-contract.mjs <dsh-source-root>");

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

const packageJson = JSON.parse(await text("package.json"));
const readme = await text("README.md");
const architecture = await text("docs/architecture.md");
const tools = await text("packages/core/tools/src/index.ts");

assert.equal(packageJson.version, DSH_PINNED_SOURCE.identity.packageVersion);
assert.equal(packageJson.license, DSH_PINNED_SOURCE.identity.license);
assert.match(readme, /developer preview/i);
assert.match(readme, /compatibility-breaking changes/i);
assert.match(architecture, /everything is a plugin/i);
assert.match(architecture, /There is no privileged core to patch/i);
assert.match(architecture, /home-level one, then any `--patch` overlay/i);

assert.match(tools, /export interface ToolRestriction/);
assert.match(tools, /readonly allow\?: readonly string\[\]/);
assert.match(tools, /Restrictions intersect and do not affect\s+\* scoped registrations or the reserved Code Mode transport\./);
assert.match(tools, /export type ToolGuard/);
assert.match(tools, /Because guards have no allow\s+\* result, listener ordering cannot turn a denial back into permission\./);
assert.match(tools, /private codeTransport: ToolDefinition \| undefined/);
assert.match(tools, /visible\.set\(RUN_CODE_NAME, this\.requireCodeTransport\(\)\)/);
assert.match(tools, /runtime\.effectiveToolsMode === "native"|mode === 'native'/);

console.log("KERNIQ_DSH_PINNED_SOURCE_CONTRACT_PASS");
