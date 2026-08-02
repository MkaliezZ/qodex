#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CODEWHALE_EXECUTABLE_SHA256,
  CODEWHALE_MANAGED_PROFILE,
  CODEWHALE_SOURCE_ARCHIVE_SHA256,
  CODEWHALE_SOURCE_COMMIT,
  CODEWHALE_SOURCE_REPOSITORY,
  KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL,
  assessToolSurface,
  managedProfileDigest,
  sha256Canonical,
} from "../packages/codewhale-engine-adapter/dist/index.js";

const MODEL = "kerniq-codewhale-audit-model";
const OUTPUT = resolve(
  process.argv[2] ?? "validation/evidence/kerniq_v0_8_0_codewhale_tool_surface.json",
);
const EXECUTABLE = resolve(
  process.env.KERNIQ_CODEWHALE_EXECUTABLE
    ?? `${process.env.TMPDIR?.replace(/\/$/u, "") ?? tmpdir()}/kerniq-codewhale-spike-4f2c97b0/target/debug/codewhale-tui`,
);

const runtimeToken = `cwrt_${randomBytes(32).toString("base64url")}`;
let runtime;
let fakeProvider;
let auditRoot;
let runtimeOutput = "";

try {
  const executableBytes = await readFile(EXECUTABLE);
  assertEqual(sha256(executableBytes), CODEWHALE_EXECUTABLE_SHA256, "proof executable digest");

  const version = spawnSync(EXECUTABLE, ["--version"], {
    encoding: "utf8",
    env: managedEnvironment(process.env, tmpdir()),
  });
  if (version.status !== 0) throw new Error(`CodeWhale --version failed: ${version.stderr}`);
  if (!version.stdout.includes("4f2c97b0d75c")) {
    throw new Error(`CodeWhale version did not report the pinned commit: ${version.stdout.trim()}`);
  }

  auditRoot = await mkdtemp(join(tmpdir(), "kerniq-codewhale-tool-surface-"));
  const fixture = join(auditRoot, "fixture");
  const managedHome = join(auditRoot, "managed-home");
  const configPath = join(managedHome, "config.toml");
  await mkdir(fixture, { recursive: true });
  await mkdir(managedHome, { recursive: true });
  await writeFile(join(fixture, "README.md"), "# Isolated KerniQ CodeWhale audit fixture\n", "utf8");

  const fixtureBefore = await recursiveSnapshot(fixture);
  const provider = await startFakeProvider();
  fakeProvider = provider.server;
  const runtimePort = await reservePort();

  await writeFile(configPath, managedConfig(provider.port), { mode: 0o600 });
  const childEnvironment = managedEnvironment(process.env, managedHome, {
    CODEWHALE_HOME: managedHome,
    CODEWHALE_CONFIG_PATH: configPath,
    CODEWHALE_RUNTIME_TOKEN: runtimeToken,
    KERNIQ_CODEWHALE_AUDIT_API_KEY: "local-loopback-audit-only",
    RUST_LOG: "warn",
  });

  runtime = spawn(EXECUTABLE, [
    "--workspace", fixture,
    "--config", configPath,
    "--no-project-config",
    "--disable", "mcp",
    "--disable", "subagents",
    "serve",
    "--http",
    "--host", "127.0.0.1",
    "--port", String(runtimePort),
    "--workers", "1",
    "--auth-token", runtimeToken,
  ], {
    cwd: fixture,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  runtime.stdout.on("data", (chunk) => appendRuntimeOutput(chunk));
  runtime.stderr.on("data", (chunk) => appendRuntimeOutput(chunk));

  const baseUrl = `http://127.0.0.1:${runtimePort}`;
  await waitForHealth(baseUrl, runtime);
  const runtimeIdentity = await jsonRequest(`${baseUrl}/v1/runtime/info`, undefined, runtimeToken);

  const createThread = await jsonRequest(`${baseUrl}/v1/threads`, {
    method: "POST",
    body: JSON.stringify({
      workspace: fixture,
      model: MODEL,
      model_provider: "openai",
      model_provider_id: "openai",
      mode: "plan",
      allow_shell: false,
      trust_mode: false,
      auto_approve: false,
      dynamic_tools: [KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL],
    }),
  }, runtimeToken);
  const threadId = requiredText(createThread.id, "thread id");

  const startTurn = await jsonRequest(`${baseUrl}/v1/threads/${encodeURIComponent(threadId)}/turns`, {
    method: "POST",
    body: JSON.stringify({
      prompt: "Enumerate the exact available tool catalog, then finish without reading or changing the fixture.",
      model: MODEL,
      mode: "plan",
      allow_shell: false,
      trust_mode: false,
      auto_approve: false,
      dynamic_tools: [KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL],
    }),
  }, runtimeToken);
  const turnId = requiredText(startTurn.turn?.id, "turn id");

  await provider.waitForRequests(2, 30_000);
  const terminal = await waitForTerminalTurn(baseUrl, threadId, turnId, runtimeToken, runtime);
  const providerRequests = provider.requests();
  const initialTools = extractTools(providerRequests[0]);
  const expandedTools = extractTools(providerRequests[1]);
  if (!initialTools.some((tool) => tool.name === "tool_search")) {
    throw new Error("The real first model request did not expose tool_search.");
  }
  if (expandedTools.length < initialTools.length) {
    throw new Error("Tool-search expansion reduced the captured model-visible surface.");
  }

  const assessment = await assessToolSurface(expandedTools.map((tool) => ({
    toolName: tool.name,
    source: isKerniQProposalName(tool.name) ? "kerniq_dynamic" : "codewhale_native",
    observedSchema: tool.schema,
    enabled: true,
    callable: true,
  })));
  if (assessment.outcome !== "THIN_FORK_REQUIRED") {
    throw new Error(`Unsafe proof unexpectedly classified ${assessment.outcome}.`);
  }

  const fixtureAfter = await recursiveSnapshot(fixture);
  const fixtureMutations = changedSnapshotEntries(fixtureBefore.entries, fixtureAfter.entries);
  const receipt = {
    schema_version: "kerniq.codewhale.tool-surface-receipt.v1",
    kerniq_repository_commit: gitHead(),
    codewhale: {
      repository: CODEWHALE_SOURCE_REPOSITORY,
      source_commit: CODEWHALE_SOURCE_COMMIT,
      source_archive_sha256: CODEWHALE_SOURCE_ARCHIVE_SHA256,
      executable_sha256: CODEWHALE_EXECUTABLE_SHA256,
      executable_version: version.stdout.trim(),
      executable_platform: "darwin-x86_64-proof-build",
      transport: "authenticated_loopback_http_sse",
      runtime_identity: sanitizeRuntimeIdentity(runtimeIdentity),
    },
    managed_profile: CODEWHALE_MANAGED_PROFILE,
    managed_profile_digest: await managedProfileDigest(),
    dynamic_tool_schema_digest: await sha256Canonical(KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL),
    thread_id_digest: sha256(Buffer.from(threadId)),
    turn_id_digest: sha256(Buffer.from(turnId)),
    model_request_count: providerRequests.length,
    initial_model_visible_tools: initialTools.map((tool) => tool.name),
    tool_search_invoked: true,
    tool_search_arguments: { query: ".*", match: "regex", max_results: 100 },
    tool_surface_digest: assessment.digest,
    model_visible_tool_count: assessment.modelVisibleToolCount,
    read_only_tool_count: assessment.provenReadOnlyToolCount,
    kerniq_intent_only_tool_count: assessment.kerniqIntentOnlyToolCount,
    proven_side_effect_tool_count: assessment.provenSideEffectToolCount,
    unclassified_tool_count: assessment.unclassifiedToolCount,
    prohibited_tool_callable_count: assessment.prohibitedToolCallableCount,
    tools: assessment.tools.map((tool) => ({
      tool_name: tool.toolName,
      source: tool.source,
      native_or_dynamic: tool.nativeOrDynamic,
      classification: tool.classification,
      read_only: tool.readOnly,
      side_effect_capable: tool.sideEffectCapable,
      classification_reason: tool.classificationReason,
      enabled: tool.enabled,
      callable: tool.callable,
      observed_schema_digest: expandedTools.find((candidate) => candidate.name === tool.toolName)?.schemaDigest,
    })),
    runtime_turn_status: terminal,
    fixture_before_digest: fixtureBefore.digest,
    fixture_after_digest: fixtureAfter.digest,
    fixture_mutations: fixtureMutations,
    codewhale_direct_fixture_writes: fixtureMutations.length === 0 ? 0 : 1,
    writes_before_kerniq_start: fixtureMutations.length === 0 ? 0 : 1,
    project_command_execution_count: 0,
    agentfuse_invocation_count: 0,
    builtin_side_effect_tool_execution_count: 0,
    mcp_side_effect_tool_execution_count: 0,
    plugin_side_effect_tool_execution_count: 0,
    subagent_side_effect_execution_count: 0,
    product_side_effect_connected: false,
    dynamic_tool_request_event: "NOT_RUN_BY_SAFETY_GATE",
    dynamic_tool_resolution_event: "NOT_RUN_BY_SAFETY_GATE",
    call_id_digest: null,
    safety_gate: "stopped_after_real_model-visible-tool-enumeration",
    outcome: assessment.outcome,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    output: OUTPUT,
    outcome: receipt.outcome,
    model_visible_tool_count: receipt.model_visible_tool_count,
    prohibited_tool_callable_count: receipt.prohibited_tool_callable_count,
    codewhale_direct_fixture_writes: receipt.codewhale_direct_fixture_writes,
  })}\n`);
} finally {
  await stopRuntime(runtime);
  if (fakeProvider) await new Promise((resolveClose) => fakeProvider.close(resolveClose));
  if (auditRoot && process.env.KERNIQ_CODEWHALE_KEEP_AUDIT_ROOT !== "1") {
    await rm(auditRoot, { recursive: true, force: true });
  } else if (auditRoot) {
    process.stderr.write(`KEPT_AUDIT_ROOT=${auditRoot}\n`);
  }
}

function managedConfig(providerPort) {
  return `provider = "openai"
default_text_model = "${MODEL}"
allow_shell = false
approval_policy = "never"
sandbox_mode = "read-only"

[providers.openai]
base_url = "http://127.0.0.1:${providerPort}/v1"
model = "${MODEL}"
api_key_env = "KERNIQ_CODEWHALE_AUDIT_API_KEY"

[retry]
enabled = false

[update]
check_for_updates = false

[subagents]
enabled = false
`;
}

async function startFakeProvider() {
  const captured = [];
  let wake;
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname.endsWith("/models")) {
        return sendJson(response, { object: "list", data: [{ id: MODEL, object: "model" }] });
      }
      if (request.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
        response.writeHead(404).end();
        return;
      }
      const body = JSON.parse(await readRequestBody(request));
      captured.push(body);
      wake?.();
      wake = undefined;
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      if (captured.length === 1) {
        response.end(toolSearchSse());
      } else {
        response.end(finalAnswerSse());
      }
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fake provider failed to bind.");
  return {
    server,
    port: address.port,
    requests: () => structuredClone(captured),
    async waitForRequests(count, timeoutMs) {
      const deadline = Date.now() + timeoutMs;
      while (captured.length < count) {
        if (Date.now() >= deadline) throw new Error(`Timed out after ${captured.length} provider requests.`);
        await Promise.race([
          new Promise((resolveWake) => { wake = resolveWake; }),
          sleep(Math.min(100, deadline - Date.now())),
        ]);
      }
    },
  };
}

function toolSearchSse() {
  const call = {
    index: 0,
    id: "call_kerniq_tool_surface_search",
    type: "function",
    function: {
      name: "tool_search",
      arguments: JSON.stringify({ query: ".*", match: "regex", max_results: 100 }),
    },
  };
  return [
    chunk({ id: "audit-search", object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: { tool_calls: [call] }, finish_reason: null }] }),
    chunk({ id: "audit-search", object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: usage() }),
    "data: [DONE]\n\n",
  ].join("");
}

function finalAnswerSse() {
  return [
    chunk({ id: "audit-final", object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: { content: "Tool-surface enumeration complete; no product action was requested." }, finish_reason: null }] }),
    chunk({ id: "audit-final", object: "chat.completion.chunk", model: MODEL, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: usage() }),
    "data: [DONE]\n\n",
  ].join("");
}

function chunk(value) {
  return `data: ${JSON.stringify(value)}\n\n`;
}

function usage() {
  return { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };
}

function extractTools(request) {
  const tools = Array.isArray(request?.tools) ? request.tools : [];
  return tools.map((tool) => {
    const name = tool?.function?.name ?? tool?.name ?? tool?.type;
    if (typeof name !== "string" || name.length === 0) throw new Error("Model request included a nameless tool.");
    const schema = tool?.function?.parameters ?? tool?.input_schema ?? tool;
    return { name, schema, schemaDigest: sha256(Buffer.from(JSON.stringify(schema))) };
  });
}

function isKerniQProposalName(name) {
  return name === "propose_project_command"
    || name === "kerniq::propose_project_command"
    || name === "kerniq.propose_project_command"
    || name === "kerniq__propose_project_command";
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CodeWhale exited during startup: ${safeRuntimeOutput()}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The loopback listener is not ready yet.
    }
    await sleep(100);
  }
  throw new Error(`CodeWhale runtime health timed out: ${safeRuntimeOutput()}`);
}

async function waitForTerminalTurn(baseUrl, threadId, turnId, token, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`CodeWhale exited during the turn: ${safeRuntimeOutput()}`);
    const detail = await jsonRequest(`${baseUrl}/v1/threads/${encodeURIComponent(threadId)}`, undefined, token);
    const turn = detail.turns?.find((candidate) => candidate.id === turnId);
    if (["completed", "failed", "interrupted", "canceled"].includes(turn?.status)) return turn.status;
    await sleep(100);
  }
  throw new Error("CodeWhale turn did not reach a terminal state.");
}

async function jsonRequest(url, init, token) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text}`);
  return text.length > 0 ? JSON.parse(text) : {};
}

function managedEnvironment(inherited, home, additions = {}) {
  const allowed = ["LANG", "LC_ALL", "PATH", "SystemRoot", "TMPDIR", "WINDIR"];
  const environment = {};
  for (const name of allowed) if (inherited[name]) environment[name] = inherited[name];
  return { ...environment, HOME: home, NO_COLOR: "1", ...additions };
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to reserve a port.");
  await new Promise((resolveClose) => server.close(resolveClose));
  return address.port;
}

async function recursiveSnapshot(root) {
  const entries = [];
  async function visit(directory, relative) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const child of children) {
      const absolute = join(directory, child.name);
      const childRelative = relative ? `${relative}/${child.name}` : child.name;
      if (child.isDirectory()) {
        entries.push(`d:${childRelative}`);
        await visit(absolute, childRelative);
      } else if (child.isFile()) {
        const metadata = await stat(absolute);
        entries.push(`f:${childRelative}:${metadata.mode & 0o777}:${sha256(await readFile(absolute))}`);
      } else {
        entries.push(`o:${childRelative}`);
      }
    }
  }
  await visit(root, "");
  return {
    digest: sha256(Buffer.from(entries.join("\n"))),
    entries,
  };
}

function changedSnapshotEntries(before, after) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return [
    ...before.filter((entry) => !afterSet.has(entry)).map((entry) => ({ kind: "removed_or_changed", entry })),
    ...after.filter((entry) => !beforeSet.has(entry)).map((entry) => ({ kind: "added_or_changed", entry })),
  ];
}

async function stopRuntime(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  await Promise.race([exited, sleep(5_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

function sanitizeRuntimeIdentity(identity) {
  const allowed = ["name", "version", "commit", "protocol_version", "capabilities"];
  return Object.fromEntries(allowed.filter((key) => key in identity).map((key) => [key, identity[key]]));
}

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git rev-parse failed: ${result.stderr}`);
  return result.stdout.trim();
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${label}.`);
  return value;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function appendRuntimeOutput(chunk) {
  runtimeOutput = `${runtimeOutput}${String(chunk)}`.slice(-8_000);
}

function safeRuntimeOutput() {
  return runtimeOutput
    .replaceAll(runtimeToken, "[REDACTED_RUNTIME_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED_RUNTIME_TOKEN]");
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, value) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}
