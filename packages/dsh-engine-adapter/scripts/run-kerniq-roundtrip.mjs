import { spawn } from "node:child_process";
import { readFile, writeFile, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ActionRuntime, createActionProposal } from "../../action-runtime/dist/index.js";
import { AgentFuseAdapter } from "../../agentfuse-adapter/dist/index.js";

const AGENTFUSE_COMMIT = "ec4b5842339dccfba0db62df7541920759203bc9";
const PROTOCOL = "kerniq.agentfuse.bridge.v1";
const SCHEMA = "agentfuse-evidence-schema-v0.1";
const POLICY = "dhms-agentfuse-runtime-guard@3.6.0";
const NOW = "2026-08-13T22:42:00.000Z";
const EXPIRES = "2026-08-13T23:42:00.000Z";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const runtimeEvidencePath = process.env.KERNIQ_DSH_RUNTIME_EVIDENCE;
const outputPath = process.env.KERNIQ_DSH_ROUNDTRIP_EVIDENCE;
const lifecyclePath = process.env.KERNIQ_DSH_LIFECYCLE_EVIDENCE;
const agentFuseSource = process.env.KERNIQ_AGENTFUSE_SOURCE;
const python = process.env.KERNIQ_PYTHON ?? "python3";

for (const [name, value] of Object.entries({
  KERNIQ_DSH_RUNTIME_EVIDENCE: runtimeEvidencePath,
  KERNIQ_DSH_ROUNDTRIP_EVIDENCE: outputPath,
  KERNIQ_DSH_LIFECYCLE_EVIDENCE: lifecyclePath,
  KERNIQ_AGENTFUSE_SOURCE: agentFuseSource,
})) {
  if (!value) throw new Error(`missing ${name}`);
}

async function appendDurable(record) {
  const handle = await open(lifecyclePath, "a");
  try {
    await handle.write(`${JSON.stringify(record)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

class PythonBridgeClient {
  constructor() {
    this.requestCount = 0;
  }

  async requestDecision(request, signal) {
    this.requestCount += 1;
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(python, [
        "-m", "kerniq_agentfuse_bridge",
        "--agentfuse-source", agentFuseSource,
        "--expected-commit", AGENTFUSE_COMMIT,
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PYTHONPATH: [resolve(repoRoot, "python"), process.env.PYTHONPATH].filter(Boolean).join(":"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => {
        child.kill("SIGTERM");
        finish(rejectPromise, new DOMException("AgentFuse bridge request aborted.", "AbortError"));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", error => finish(rejectPromise, error));
      child.on("close", code => {
        if (settled) return;
        if (code !== 0) {
          finish(rejectPromise, new Error(`bridge process exited ${code}: ${stderr.trim()}`));
          return;
        }
        const line = stdout.trim().split(/\r?\n/).find(Boolean);
        if (!line) {
          finish(rejectPromise, new Error("bridge process returned no response"));
          return;
        }
        try {
          finish(resolvePromise, JSON.parse(line));
        } catch (error) {
          finish(rejectPromise, error);
        }
      });
      child.stdin.end(`${JSON.stringify(request)}\n`);
    });
  }
}

const dshEvidence = JSON.parse(await readFile(runtimeEvidencePath, "utf8"));
if (dshEvidence.observedDshCommit !== "47f943859bef60e4160492346772ded9b24f765a") {
  throw new Error("DSH runtime evidence source mismatch");
}
if (dshEvidence.proposalCount !== 1 || dshEvidence.dshDirectProductExecutionCount !== 0) {
  throw new Error("DSH proposal authority boundary was not proven");
}

const proposal = await createActionProposal(dshEvidence.proposalInput);
const approval = {
  approvalId: "dsh-proof-approval-1",
  actionId: proposal.actionId,
  taskId: proposal.taskId,
  proposalDigest: proposal.proposalDigest,
  generation: 1,
  approvedAt: NOW,
  expiresAt: EXPIRES,
};

let explicitApprovalCount = 0;
let agentFuseDecisionCount = 0;
let durableDecisionCount = 0;
let durableStartCount = 0;
let physicalExecutionCount = 0;
let settlementCount = 0;
let proofCounter = 0;
const bridge = new PythonBridgeClient();
const adapter = new AgentFuseAdapter({
  bridge,
  expectedAgentFuseCommit: AGENTFUSE_COMMIT,
  expectedProtocolVersion: PROTOCOL,
  expectedSchemaVersion: SCHEMA,
  expectedPolicyVersion: POLICY,
  policyFixtureId: "kerniq-proof-allow-v1",
  messageIdFactory: () => "dsh-proof-message-1",
  clock: () => new Date(NOW),
});

const runtime = new ActionRuntime({
  clock: () => new Date(NOW),
  idFactory: () => "dsh-proof-execution-receipt-1",
  hooks: {
    async afterDecisionReceived(_snapshot, decision) {
      agentFuseDecisionCount += 1;
      await appendDurable({
        type: "ACTION_DECIDED",
        actionId: proposal.actionId,
        decisionId: decision.decisionId,
        decision: decision.decision,
        agentFuseCommit: AGENTFUSE_COMMIT,
      });
      durableDecisionCount += 1;
    },
    async beforeDispatch(_snapshot, started) {
      await appendDurable({
        type: "ACTION_STARTED",
        actionId: proposal.actionId,
        approvalId: started.approvalId,
        decisionId: started.decisionId,
        executionReceiptId: started.executionReceiptId,
      });
      durableStartCount += 1;
    },
    async afterSettlement(_snapshot, outcome) {
      await appendDurable({
        type: "ACTION_SETTLED",
        actionId: outcome.actionId,
        executionReceiptId: outcome.executionReceiptId,
        status: outcome.status,
      });
      settlementCount += 1;
    },
  },
});

runtime.registry.register(proposal.actionType, async () => {
  physicalExecutionCount += 1;
  proofCounter += 1;
  return { proofCounter };
});

await runtime.propose(proposal);
explicitApprovalCount += 1;
await runtime.approve(approval);
const final = await runtime.execute(proposal.actionId, adapter.decide);

if (final.state !== "Completed") throw new Error(`unexpected final state ${final.state}`);
if (final.decision?.decision !== "allow") throw new Error("canonical AgentFuse allow was not observed");
if (!final.started) throw new Error("durable start receipt missing");
if (proofCounter !== 1 || physicalExecutionCount !== 1) throw new Error("KerniQ physical executor count mismatch");
if (bridge.requestCount !== 1 || agentFuseDecisionCount !== 1) throw new Error("AgentFuse decision count mismatch");
if (durableDecisionCount !== 1 || durableStartCount !== 1 || settlementCount !== 1) {
  throw new Error("durable lifecycle count mismatch");
}

const evidence = {
  schemaVersion: "kerniq.dsh.kerniq-roundtrip-proof.v0.8.1",
  dshCommit: dshEvidence.observedDshCommit,
  agentFuseCommit: AGENTFUSE_COMMIT,
  proposalCount: dshEvidence.proposalCount,
  explicitApprovalCount,
  bridgeDecisionRequestCount: bridge.requestCount,
  agentFuseDecisionCount,
  durableDecisionCount,
  durableStartCount,
  kerniqPhysicalExecutionCount: physicalExecutionCount,
  settlementCount,
  dshDirectProductExecutionCount: dshEvidence.dshDirectProductExecutionCount,
  finalState: final.state,
  finalDecision: final.decision?.decision,
  executionReceiptId: final.started.executionReceiptId,
  proofCounter,
};
await writeFile(outputPath, JSON.stringify(evidence, null, 2), "utf8");
console.log("KERNIQ_DSH_AGENTFUSE_ROUNDTRIP_PASS");
