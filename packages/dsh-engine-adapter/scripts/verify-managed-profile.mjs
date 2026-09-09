import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [home, defaultConfigPath, effectiveConfigPath, outputPath] = process.argv.slice(2);
if (!home || !defaultConfigPath || !effectiveConfigPath || !outputPath) {
  throw new Error("usage: node verify-managed-profile.mjs <dsh-home> <default-config> <effective-config> <output>");
}

async function optionalText(path) {
  try {
    await stat(path);
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function patchIsInert(value) {
  if (value === null) return true;
  const meaningful = value
    .split(/\r?\n/)
    .map(line => line.replace(/\s+#.*$/, "").trim())
    .filter(Boolean)
    .join("");
  return meaningful === "[]";
}

function normalizedConfig(value) {
  return value
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith("#"))
    .map(line => line.replace(/[ \t]+$/g, ""))
    .filter(line => line.trim().length > 0)
    .join("\n") + "\n";
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

const profilePatchPath = resolve(home, "profiles/headless/cordis.patch.yml");
const homePatchPath = resolve(home, "cordis.patch.yml");
const profilePatch = await optionalText(profilePatchPath);
const homePatch = await optionalText(homePatchPath);
if (!patchIsInert(profilePatch)) throw new Error("headless profile patch is not inert");
if (!patchIsInert(homePatch)) throw new Error("Harness-home patch is not inert");

const defaultConfig = normalizedConfig(await readFile(defaultConfigPath, "utf8"));
const effectiveConfig = normalizedConfig(await readFile(effectiveConfigPath, "utf8"));
const expectedConfigDigest = digest(defaultConfig);
const effectiveConfigDigest = digest(effectiveConfig);
if (expectedConfigDigest !== effectiveConfigDigest) {
  throw new Error("effective DSH config differs from the shipped bundle-only config despite an isolated inert patch home");
}

const evidence = {
  schemaVersion: "kerniq.dsh.managed-profile-proof.v0.8.1",
  dshHome: "isolated-ci-home",
  profile: "headless",
  profilePatchInert: true,
  homePatchInert: true,
  homePatchEnabled: false,
  cliPatchEnabled: false,
  expectedConfigDigest,
  effectiveConfigDigest,
};
await writeFile(outputPath, JSON.stringify(evidence, null, 2), "utf8");
console.log("KERNIQ_DSH_MANAGED_PROFILE_PASS");
