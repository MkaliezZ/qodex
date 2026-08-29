import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ControlPlaneSupervisor } from "../packages/multi-agent-runtime/src/control-plane/supervisor.ts";

const workspace = process.cwd();
const outputPath = join(workspace, "validation/evidence/kerniq_control_plane_vertical_slice_v0_1.json");
const temporary = await mkdtemp(join(tmpdir(), "kerniq-control-plane-"));
const schemaPath = join(temporary, "review-schema.json");
const codexResultPath = join(temporary, "codex-result.json");

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["finding", "evidence", "severity", "smallest_fix", "files"],
        properties: {
          finding: { type: "string" },
          evidence: {
            type: "string",
            description: "Evidence must cite every files[] entry verbatim as repository/relative/path:line.",
          },
          severity: { enum: ["critical", "high", "medium", "low"] },
          smallest_fix: { type: "string" },
          files: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              description: "Repository-relative path also cited verbatim with :line in evidence.",
            },
          },
        },
      },
    },
  },
};

const prompt = [
  "Independently review the selected KerniQ architecture files for up to three highest-risk issues.",
  "Read only these areas unless one directly imported definition is needed:",
  "packages/agent-runtime/src/agent-loop/runtime.ts, apps/desktop/src-tauri/src/lib.rs,",
  "packages/marketplace-runtime/src/registry/sync.ts, packages/marketplace-runtime/src/installer/installer.ts,",
  "apps/desktop/src/session/agentSessionRecorder.ts.",
  "Return one JSON object matching the schema supplied by the caller.",
  "Each finding must include repository-relative file evidence with line numbers and the smallest fix.",
  "For every files[] value, evidence must repeat that exact path followed by a colon and line number, for example path/to/file.ts:42.",
  "Inspect only enough of the listed files to substantiate the highest-risk findings, then return promptly.",
  "You may use built-in read-only file inspection tools or read-only shell commands such as rg, sed, and nl.",
  "Do not modify files, run builds/tests, access the web, or push.",
].join(" ");

await writeFile(schemaPath, `${JSON.stringify(reviewSchema)}\n`, "utf8");

try {
  const [codexVersion, claudeVersion] = await Promise.all([
    captureVersion("codex", ["--version"]),
    captureVersion("claude", ["--version"]),
  ]);
  const adapterCapabilities = Object.freeze({
    supportsStreaming: true,
    supportsCancel: false,
    supportsToolEvents: true,
    supportsExternalGovernance: false,
    supportsResume: false,
  });

  const adapters = [
    createCodexAdapter(codexVersion, adapterCapabilities),
    createClaudeAdapter(claudeVersion, adapterCapabilities),
  ];
  const taskId = `control-plane-${randomUUID()}`;
  const result = await new ControlPlaneSupervisor().runParallel({
    taskId,
    title: "Independent KerniQ architecture review",
    workspace,
    prompt,
  }, adapters);
  const receipt = {
    schema_version: "kerniq.control-plane.vertical-slice.v0.1",
    repository: "MkaliezZ/qodex",
    repository_head: await captureVersion("git", ["rev-parse", "HEAD"]),
    task_id: result.taskId,
    task_title: result.title,
    task_status: result.status,
    started_at: result.startedAt,
    ended_at: result.endedAt,
    workers: result.workers.map((worker) => ({
      run_id: worker.runId,
      agent_id: worker.agentId,
      agent_kind: worker.agentKind,
      agent_version: worker.agentVersion,
      capabilities: worker.capabilities,
      status: worker.status,
      started_at: worker.startedAt,
      ended_at: worker.endedAt,
      lifecycle: worker.lifecycle,
      observations: worker.observations,
      raw_result_reference: worker.result?.rawResultReference ?? null,
      findings: worker.result?.findings ?? [],
      error: worker.error ?? null,
    })),
    supervisor: result.reconciliation,
    governance: result.governance,
    product_evaluation: {
      unified_task_context: "YES",
      parallel_agent_control: "YES",
      lifecycle_visibility: "PARTIAL",
      result_reconciliation: "YES",
      unified_governance: "NO",
      human_cognitive_load_reduction: "MODERATE",
      product_killer_test: "PARTIAL",
    },
  };
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    output: "validation/evidence/kerniq_control_plane_vertical_slice_v0_1.json",
    task_status: receipt.task_status,
    worker_statuses: receipt.workers.map((worker) => worker.status),
    supervisor_classification: receipt.supervisor.classification,
    agentfuse_real_interception: false,
  })}\n`);
  if (result.status !== "completed") process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}

function createCodexAdapter(version, capabilities) {
  return {
    id: "codex-cli",
    kind: "codex-cli",
    version,
    capabilities,
    async runTask(input, observe) {
      const execution = await runJsonLines("codex", [
        "exec",
        "--json",
        "--sandbox", "read-only",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--output-schema", schemaPath,
        "-o", codexResultPath,
        "-C", input.workspace,
        input.prompt,
      ], observeCodex(observe));
      requireSuccess("Codex", execution);
      const raw = await readFile(codexResultPath, "utf8");
      return toAgentResult(parseJsonObject(raw), raw);
    },
  };
}

function createClaudeAdapter(version, capabilities) {
  return {
    id: "claude-code-deepseek-v4-pro",
    kind: "claude-code",
    version,
    capabilities,
    async runTask(input, observe) {
      let finalResult;
      const execution = await runJsonLines("claude", [
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--tools", "Read",
        "--no-session-persistence",
        "--permission-mode", "plan",
        "--no-chrome",
        "--disable-slash-commands",
        "--max-budget-usd", "2.00",
        "--json-schema", JSON.stringify(reviewSchema),
        `${input.prompt} The exact JSON schema is: ${JSON.stringify(reviewSchema)}`,
      ], (event) => {
        observeClaude(observe)(event);
        if (event.type === "result") finalResult = event.structured_output ?? event.result;
      });
      requireSuccess("Claude Code", execution);
      const raw = typeof finalResult === "string" ? finalResult : JSON.stringify(finalResult);
      return toAgentResult(parseJsonObject(raw), raw);
    },
  };
}

function observeCodex(observe) {
  return (event) => {
    if (event.type === "thread.started") {
      observe(observation("process_started", "Codex thread started."));
      return;
    }
    if (event.type === "item.started" && event.item?.type === "command_execution") {
      observe(observation("tool_observed", "Codex read-only command tool started."));
      return;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") {
      observe(observation("message_observed", "Codex emitted a model message."));
      return;
    }
    if (event.type === "turn.completed") {
      observe(observation("process_completed", "Codex turn completed."));
    }
  };
}

function observeClaude(observe) {
  return (event) => {
    if (event.type === "system" && event.subtype === "init") {
      observe(observation("process_started", `Claude Code initialized model ${String(event.model)}.`));
      return;
    }
    if (event.type === "assistant") {
      const content = Array.isArray(event.message?.content) ? event.message.content : [];
      for (const item of content) {
        if (item.type === "tool_use") observe(observation("tool_observed", `Claude Code invoked ${String(item.name)}.`));
        if (item.type === "text") observe(observation("message_observed", "Claude Code emitted a model message."));
      }
      return;
    }
    if (event.type === "result") {
      observe(observation("process_completed", "Claude Code session completed."));
    }
  };
}

function observation(kind, summary) {
  return { kind, at: new Date().toISOString(), summary };
}

function toAgentResult(parsed, raw) {
  if (!parsed || !Array.isArray(parsed.findings) || parsed.findings.length === 0) {
    throw new Error("Real agent did not return the required structured findings.");
  }
  return {
    findings: parsed.findings.map((finding) => normalizeFinding(finding)),
    rawResultReference: `sha256:${createHash("sha256").update(raw).digest("hex")}`,
  };
}

async function runJsonLines(executable, args, onEvent) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workspace,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) parseEvent(line, onEvent);
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (buffer.trim()) parseEvent(buffer, onEvent);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function parseEvent(line, onEvent) {
  if (!line.trim().startsWith("{")) return;
  try { onEvent(JSON.parse(line)); } catch { /* Non-protocol output remains in the raw process capture. */ }
}

function parseJsonObject(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Real agent returned no result text.");
  try { return JSON.parse(raw); } catch { /* Try a fenced JSON result next. */ }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return JSON.parse(fenced);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("Real agent result was not valid JSON.");
}

function requireSuccess(label, execution) {
  if (execution.code === 0) return;
  const detail = sanitize([
    execution.stderr ? `stderr:\n${execution.stderr}` : "",
    execution.stdout ? `stdout:\n${execution.stdout}` : "",
  ].filter(Boolean).join("\n")).slice(-2_000);
  throw new Error(`${label} exited ${String(execution.code)} (${String(execution.signal)}): ${detail}`);
}

async function captureVersion(executable, args) {
  const execution = await runJsonLines(executable, args, () => {});
  requireSuccess(executable, execution);
  return requiredText(execution.stdout.trim(), `${executable} version`);
}

function severity(value) {
  if (["critical", "high", "medium", "low"].includes(value)) return value;
  throw new Error("Real agent returned an invalid severity.");
}

function requiredFiles(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Real agent finding requires file evidence.");
  return value.map((file) => requiredText(file, "file"));
}

function normalizeFinding(finding) {
  const evidence = requiredText(finding.evidence, "evidence");
  const files = requiredFiles(finding.files);
  for (const file of files) {
    const citedLine = new RegExp(`${escapeRegExp(file)}:(?:line\\s*)?\\d+`, "i");
    if (!citedLine.test(evidence)) {
      throw new Error(`Real agent evidence did not cite a line for ${file}.`);
    }
  }
  return {
    finding: requiredText(finding.finding, "finding"),
    evidence,
    severity: severity(finding.severity),
    smallestFix: requiredText(finding.smallest_fix ?? finding.smallestFix, "smallest fix"),
    files,
  };
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${label}.`);
  return sanitize(value.trim());
}

function sanitize(value) {
  const withoutWorkspace = value.replaceAll(workspace, "<workspace>");
  return process.env.HOME ? withoutWorkspace.replaceAll(process.env.HOME, "<home>") : withoutWorkspace;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
