import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [dshRoot, defaultOutput, effectiveOutput] = process.argv.slice(2);
if (!dshRoot || !defaultOutput || !effectiveOutput) {
  throw new Error("usage: node capture-dsh-config.mjs <dsh-root> <default-output> <effective-output>");
}

const cli = resolve(dshRoot, "apps/cli/lib/bin.js");

async function capture(args) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: dshRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", code => {
      if (code !== 0) {
        rejectPromise(new Error(`DSH config dump exited ${code}: ${stderr.trim()}`));
        return;
      }
      if (stdout.trim().length === 0) {
        rejectPromise(new Error(`DSH config dump produced no stdout: ${stderr.trim()}`));
        return;
      }
      resolvePromise(stdout);
    });
  });
}

const defaultConfig = await capture(["--profile", "headless", "--dump-default-config"]);
const effectiveConfig = await capture(["--profile", "headless", "--dump-config"]);
await writeFile(defaultOutput, defaultConfig, "utf8");
await writeFile(effectiveOutput, effectiveConfig, "utf8");
console.log("KERNIQ_DSH_CONFIG_CAPTURE_PASS");
