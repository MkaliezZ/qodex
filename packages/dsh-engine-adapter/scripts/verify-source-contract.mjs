import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DSH_PINNED_SOURCE } from "../src/contract.mjs";

const root = process.argv[2];
assert.ok(root, "usage: node verify-source-contract.mjs <dsh-source-root>");

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

function compact(value) {
  return value.replace(/\s+/g, " ");
}

function contains(value, needle, label) {
  assert.ok(value.includes(needle), `missing pinned DSH source marker: ${label}`);
}

const packageJson = JSON.parse(await text("package.json"));
const readme = await text("README.md");
const architecture = await text("docs/architecture.md");
const tools = await text("packages/core/tools/src/index.ts");
const compactArchitecture = compact(architecture);
const compactTools = compact(tools);

assert.equal(packageJson.version, DSH_PINNED_SOURCE.identity.packageVersion);
assert.equal(packageJson.license, DSH_PINNED_SOURCE.identity.license);
assert.match(readme, /developer preview/i);
assert.match(readme, /compatibility-breaking changes/i);
contains(compactArchitecture, "Every part of the product is a plugin", "plugin composition");
contains(compactArchitecture, "There is no privileged core to patch", "no privileged core");
contains(compactArchitecture, "then the home-level one, then any `--patch` overlay", "patch precedence");

contains(tools, "export interface ToolRestriction", "ToolRestriction type");
contains(tools, "readonly allow?: readonly string[]", "ToolRestriction allow list");
contains(compactTools, "Restrictions intersect and do not affect * scoped registrations or the reserved Code Mode transport.", "restriction exemptions");
contains(tools, "export type ToolGuard", "ToolGuard type");
contains(compactTools, "evaluated after every `tools/pre-execute` * listener and before the tool body", "guard execution position");
contains(compactTools, "Because guards have no allow * result, listener ordering cannot turn a denial back into permission.", "monotonic guard semantics");
contains(tools, "private codeTransport: ToolDefinition | undefined", "reserved code transport storage");
contains(tools, "visible.set(RUN_CODE_NAME, this.requireCodeTransport())", "reserved transport insertion");
contains(tools, "for (const [name, definition] of own.tools.entries())", "scope-owned registration overlay");
contains(tools, "return !nested && this.modeFor(scope) === 'code' && name !== RUN_CODE_NAME", "nested code-mode collapse predicate");
contains(tools, "if (mode === 'native')", "native presentation branch");

console.log("KERNIQ_DSH_PINNED_SOURCE_CONTRACT_PASS");
