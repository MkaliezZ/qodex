#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, resolve } from "node:path";

const CASES = new Set([
  "identity",
  "allow",
  "human-deny",
  "canonical-block",
  "decision-fault",
  "start-fault",
  "settlement-fault",
  "settlement-restart",
  "allowed-unstarted",
  "allowed-unstarted-restart",
  "duplicate",
  "active-run-duplicate",
]);
const TRIGGER_TYPES = new Map([
  ["ACTION_DECIDED", "proof_fail_action_decided"],
  ["COMMAND_STARTED", "proof_fail_command_started"],
  ["COMMAND_COMPLETED", "proof_fail_command_completed"],
]);

const [, , command, ...args] = process.argv;

switch (command) {
  case "prepare-pnpm":
    preparePnpm(
      required(args, 0, "prepared pnpm executable"),
      required(args, 1, "isolated temporary path"),
    );
    break;
  case "set-case":
    setCase(required(args, 0, "project path"), required(args, 1, "proof case"));
    break;
  case "launch":
    launch(
      required(args, 0, "application path"),
      required(args, 1, "isolated HOME"),
      required(args, 2, "isolated TMPDIR"),
    );
    break;
  case "choose-project":
    chooseProject(required(args, 0, "project path"));
    break;
  case "activate":
    activate(Number.parseInt(required(args, 0, "tab count"), 10));
    break;
  case "click-button":
    clickButton(required(args, 0, "button label"));
    break;
  case "window-title":
    process.stdout.write(`${windowTitle()}\n`);
    break;
  case "install-trigger":
    installTrigger(
      required(args, 0, "database path"),
      required(args, 1, "entry type"),
      required(args, 2, "session ID"),
    );
    break;
  case "remove-triggers":
    removeTriggers(required(args, 0, "database path"));
    break;
  case "session-evidence":
    sessionEvidence(
      required(args, 0, "database path"),
      required(args, 1, "session ID"),
    );
    break;
  case "stop":
    stop(Number.parseInt(required(args, 0, "application PID"), 10));
    break;
  case "secret-scan":
    secretScan(args.map((value) => resolve(value)));
    break;
  default:
    fail(
      "Usage: kerniq_project_command_real_tauri_proof.mjs "
      + "<prepare-pnpm|set-case|launch|choose-project|activate|click-button|window-title|install-trigger|"
      + "remove-triggers|session-evidence|stop|secret-scan> ...",
    );
}

function preparePnpm(sourcePath, temporaryPath) {
  const source = resolve(sourcePath);
  const bin = resolve(temporaryPath, "bin");
  const target = resolve(bin, "pnpm");
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  chmodSync(source, 0o700);
  try {
    unlinkSync(target);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
  symlinkSync(source, target);
  process.stdout.write(`prepared_pnpm=${target}\n`);
}

function setCase(projectPath, proofCase) {
  if (!CASES.has(proofCase)) fail("Unknown proof case.");
  writeFileSync(
    resolve(projectPath, "kerniq-proof-case.json"),
    `${JSON.stringify({ case: proofCase }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  process.stdout.write(`proof_case=${proofCase}\n`);
}

function launch(applicationPath, homePath, temporaryPath) {
  const child = spawn(resolve(applicationPath), [], {
    detached: true,
    stdio: "ignore",
    env: {
      HOME: resolve(homePath),
      TMPDIR: resolve(temporaryPath),
      PATH: [
        resolve(temporaryPath, "bin"),
        process.env.PATH ?? "/usr/bin:/bin",
      ].join(delimiter),
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      NO_COLOR: "1",
    },
  });
  child.unref();
  process.stdout.write(`application_pid=${child.pid}\n`);
}

function chooseProject(projectPath) {
  const escaped = resolve(projectPath).replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
  runAppleScript(`
    tell application "System Events"
      repeat 100 times
        if (exists process "KerniQ") or (exists process "qodex-desktop") then exit repeat
        delay 0.1
      end repeat
      if exists process "KerniQ" then
        set proofProcess to process "KerniQ"
      else
        set proofProcess to process "qodex-desktop"
      end if
      tell proofProcess
        set frontmost to true
        repeat 100 times
          if exists sheet 1 of window 1 then exit repeat
          delay 0.1
        end repeat
        keystroke "g" using {command down, shift down}
        delay 0.3
        set value of text field 1 of sheet 1 of sheet 1 of window 1 to "${escaped}"
        key code 36
        delay 1
        click button "Open" of sheet 1 of window 1
      end tell
    end tell
  `);
  process.stdout.write("project_selected=true\n");
}

function activate(tabCount) {
  if (!Number.isSafeInteger(tabCount) || tabCount < 1 || tabCount > 10) {
    fail("Tab count must be between 1 and 10.");
  }
  const tabs = Array.from({ length: tabCount }, () => "key code 48").join("\n");
  runAppleScript(`
    tell application "System Events"
      if exists process "KerniQ" then
        set proofProcess to process "KerniQ"
      else
        set proofProcess to process "qodex-desktop"
      end if
      tell proofProcess
        set frontmost to true
        ${tabs}
        key code 49
      end tell
    end tell
  `);
  process.stdout.write(`activated_tab_count=${tabCount}\n`);
}

function clickButton(label) {
  const escaped = label.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
  const result = runAppleScript(`
    tell application "System Events"
      if exists process "KerniQ" then
        set proofProcess to process "KerniQ"
      else
        set proofProcess to process "qodex-desktop"
      end if
      tell proofProcess
        set frontmost to true
        click button "${escaped}" of group 1 of group 1 of UI element 1 of scroll area 1 of group 1 of group 1 of window 1
      end tell
    end tell
    return "clicked"
  `).trim();
  if (result !== "clicked") fail(`Button not found: ${label}`);
  process.stdout.write(`clicked_button=${label}\n`);
}

function windowTitle() {
  return runAppleScript(`
    tell application "System Events"
      if not ((exists process "KerniQ") or (exists process "qodex-desktop")) then return "PROCESS_NOT_FOUND"
      if exists process "KerniQ" then
        set proofProcess to process "KerniQ"
      else
        set proofProcess to process "qodex-desktop"
      end if
      tell proofProcess
        if not (exists window 1) then return "WINDOW_NOT_FOUND"
        return name of window 1
      end tell
    end tell
  `).trim();
}

function installTrigger(databasePath, entryType, sessionId) {
  const triggerName = TRIGGER_TYPES.get(entryType);
  if (!triggerName) fail("Unsupported proof trigger type.");
  const sql = `
    DROP TRIGGER IF EXISTS ${triggerName};
    CREATE TRIGGER ${triggerName}
    BEFORE INSERT ON session_entries
    WHEN NEW.type = '${sqlText(entryType)}'
      AND NEW.session_id = '${sqlText(sessionId)}'
    BEGIN
      SELECT RAISE(ABORT, 'injected proof persistence fault');
    END;
  `;
  sqlite(databasePath, sql);
  process.stdout.write(`trigger_installed=${triggerName}\n`);
}

function removeTriggers(databasePath) {
  sqlite(
    databasePath,
    [...TRIGGER_TYPES.values()]
      .map((name) => `DROP TRIGGER IF EXISTS ${name};`)
      .join("\n"),
  );
  const remaining = sqlite(
    databasePath,
    "SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name LIKE 'proof_fail_%';",
  ).trim();
  process.stdout.write(`temporary_triggers=${remaining}\n`);
}

function sessionEvidence(databasePath, sessionId) {
  const rows = sqlite(
    databasePath,
    [
      ".mode json",
      `SELECT sequence, type, payload_json, safe_metadata_json`,
      "FROM session_entries",
      `WHERE session_id = '${sqlText(sessionId)}'`,
      "ORDER BY sequence;",
    ].join("\n"),
  );
  const session = sqlite(
    databasePath,
    [
      ".mode json",
      "SELECT id, status, completed_at",
      "FROM sessions",
      `WHERE id = '${sqlText(sessionId)}';`,
    ].join("\n"),
  );
  process.stdout.write(`${JSON.stringify({
    session: JSON.parse(session || "[]"),
    entries: JSON.parse(rows || "[]"),
  }, null, 2)}\n`);
}

function stop(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) fail("Invalid application PID.");
  process.kill(pid, "SIGTERM");
  process.stdout.write(`stopped_pid=${pid}\n`);
}

function secretScan(paths) {
  if (paths.length === 0) fail("Provide at least one artifact path.");
  const patterns = [
    /\/Users\//,
    /(?:api[_-]?key|authorization|bearer|cookie|credential|password|token)\s*[:=]\s*\S+/i,
    /\bsk-[A-Za-z0-9_-]{12,}/,
    /github_pat_[A-Za-z0-9_]{12,}/,
  ];
  const findings = [];
  for (const path of paths) {
    const content = readFileSync(path, "utf8");
    for (const [index, line] of content.split(/\r?\n/u).entries()) {
      if (patterns.some((pattern) => pattern.test(line))) {
        findings.push({ path, line: index + 1 });
      }
    }
  }
  process.stdout.write(`${JSON.stringify({ findings }, null, 2)}\n`);
  if (findings.length > 0) process.exitCode = 1;
}

function sqlite(databasePath, sql) {
  return execFileSync("/usr/bin/sqlite3", [resolve(databasePath)], {
    input: `${sql.trim()}\n`,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

function runAppleScript(script) {
  return execFileSync("/usr/bin/osascript", ["-e", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function sqlText(value) {
  return value.replaceAll("'", "''");
}

function required(values, index, label) {
  const value = values[index];
  if (!value) fail(`Missing ${label}.`);
  return value;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
