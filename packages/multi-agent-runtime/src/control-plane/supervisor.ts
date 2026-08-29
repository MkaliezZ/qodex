import type {
  AgentAdapter,
  AgentTaskResult,
  ControlPlaneTaskInput,
  ControlPlaneTaskResult,
  GovernanceLimitationEvidence,
  MatchedFindingPair,
  ReconciliationResult,
  ReviewFinding,
  WorkerLifecycleEntry,
  WorkerRun,
  WorkerRunStatus,
} from "./types.js";

interface MutableWorkerRun {
  runId: string;
  taskId: string;
  agentId: string;
  agentKind: string;
  agentVersion: string;
  capabilities: AgentAdapter["capabilities"];
  status: WorkerRunStatus;
  startedAt: string;
  endedAt: string;
  lifecycle: WorkerLifecycleEntry[];
  observations: WorkerRun["observations"] extends readonly (infer T)[] ? T[] : never;
  result?: AgentTaskResult;
  error?: string;
}

export interface ControlPlaneSupervisorOptions {
  readonly now?: () => Date;
}

export class ControlPlaneSupervisor {
  private readonly now: () => Date;

  constructor(options: ControlPlaneSupervisorOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async runParallel(
    input: ControlPlaneTaskInput,
    adapters: readonly AgentAdapter[],
  ): Promise<ControlPlaneTaskResult> {
    validateTask(input);
    validateAdapters(adapters);
    const startedAt = this.timestamp();
    const workers = adapters.map((adapter, index) => this.createWorker(input, adapter, index));

    await Promise.all(workers.map((worker, index) => (
      this.runWorker(input, adapters[index], worker)
    )));

    const endedAt = this.timestamp();
    const snapshots = workers.map(freezeWorker);
    const failed = snapshots.some((worker) => worker.status !== "completed");
    return Object.freeze({
      taskId: input.taskId,
      title: input.title,
      status: failed ? "failed" : "completed",
      startedAt,
      endedAt,
      workers: Object.freeze(snapshots),
      reconciliation: reconcileWorkerResults(snapshots),
      governance: createGovernanceLimitationEvidence(),
    });
  }

  private createWorker(
    input: ControlPlaneTaskInput,
    adapter: AgentAdapter,
    index: number,
  ): MutableWorkerRun {
    const at = this.timestamp();
    return {
      runId: `${input.taskId}:worker:${index + 1}`,
      taskId: input.taskId,
      agentId: adapter.id,
      agentKind: adapter.kind,
      agentVersion: adapter.version,
      capabilities: Object.freeze({ ...adapter.capabilities }),
      status: "queued",
      startedAt: at,
      endedAt: at,
      lifecycle: [lifecycle("queued", at, "Worker queued by the supervisor.")],
      observations: [],
    };
  }

  private async runWorker(
    input: ControlPlaneTaskInput,
    adapter: AgentAdapter,
    worker: MutableWorkerRun,
  ): Promise<void> {
    worker.startedAt = this.transition(worker, "starting", "Starting the real agent adapter.");
    this.transition(worker, "running", "Agent process is running.");
    try {
      worker.result = await adapter.runTask(input, (observation) => {
        worker.observations.push(Object.freeze({ ...observation }));
      });
      worker.endedAt = this.transition(worker, "completed", "Agent returned a structured result.");
    } catch (error) {
      worker.error = error instanceof Error ? error.message : "Agent adapter failed.";
      worker.endedAt = this.transition(worker, "failed", worker.error);
    }
  }

  private transition(
    worker: MutableWorkerRun,
    status: WorkerRunStatus,
    summary: string,
  ): string {
    const at = this.timestamp();
    worker.status = status;
    worker.lifecycle.push(lifecycle(status, at, summary));
    return at;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

export function reconcileWorkerResults(workers: readonly WorkerRun[]): ReconciliationResult {
  const completed = workers.filter((worker) => worker.status === "completed" && worker.result);
  if (completed.length !== workers.length || completed.length < 2) {
    return unresolved(workers, "At least one worker did not produce a completed structured result.");
  }

  const [left, right] = completed;
  const fileSets = completed.map((worker) => new Set(worker.result!.findings.flatMap(findingFiles)));
  if (fileSets.some((files) => files.size === 0)) {
    return unresolved(workers, "At least one worker returned no repository file evidence.");
  }

  const sharedFiles = [...fileSets[0]].filter((file) => fileSets.slice(1).every((files) => files.has(file))).sort();
  const agentOnlyFiles = Object.fromEntries(completed.map((worker, index) => [
    worker.agentId,
    [...fileSets[index]].filter((file) => !sharedFiles.includes(file)).sort(),
  ]));
  const matchedFindings = matchFindings(left, right);
  const allMatched = matchedFindings.length === left.result!.findings.length
    && matchedFindings.length === right.result!.findings.length
    && Object.values(agentOnlyFiles).every((files) => files.length === 0);
  const classification = matchedFindings.length === 0
    ? "DISAGREEMENT"
    : allMatched
      ? "AGREEMENT"
      : "PARTIAL_AGREEMENT";
  const summary = classification === "DISAGREEMENT"
    ? "The agents produced no semantically matched findings; shared file references do not imply agreement."
    : `${matchedFindings.length} finding pair(s) matched by file evidence and bounded semantic similarity.`;

  return Object.freeze({
    classification,
    sharedFiles: Object.freeze(sharedFiles),
    matchedFindings: Object.freeze(matchedFindings),
    agentOnlyFiles: Object.freeze(agentOnlyFiles),
    summary,
  });
}

export function createGovernanceLimitationEvidence(): GovernanceLimitationEvidence {
  return Object.freeze({
    action: "git push",
    interception: "not_proven",
    decision: "unknown",
    dispatchOccurred: "unknown",
    handlerStarted: "unknown",
    outcome: "not_tested",
    reason: "The verified CLI agents own their internal tool execution. KerniQ has no supported pre-execution interception boundary for either process.",
  });
}

function findingFiles(finding: ReviewFinding): string[] {
  return [...new Set(finding.files.map(normalizeFile).filter(Boolean))];
}

function normalizeFile(value: string): string {
  return value.trim().replace(/^\.\//, "").replaceAll("\\", "/");
}

function unresolved(workers: readonly WorkerRun[], summary: string): ReconciliationResult {
  return Object.freeze({
    classification: "UNRESOLVED",
    sharedFiles: Object.freeze([]),
    matchedFindings: Object.freeze([]),
    agentOnlyFiles: Object.freeze(Object.fromEntries(workers.map((worker) => [worker.agentId, []]))),
    summary,
  });
}

function freezeWorker(worker: MutableWorkerRun): WorkerRun {
  return Object.freeze({
    ...worker,
    lifecycle: Object.freeze(worker.lifecycle.map((entry) => Object.freeze({ ...entry }))),
    observations: Object.freeze(worker.observations.map((entry) => Object.freeze({ ...entry }))),
    ...(worker.result
      ? {
          result: Object.freeze({
            ...worker.result,
            findings: Object.freeze(worker.result.findings.map((finding) => Object.freeze({
              ...finding,
              files: Object.freeze([...finding.files]),
            }))),
          }),
        }
      : {}),
  });
}

function lifecycle(status: WorkerRunStatus, at: string, summary: string): WorkerLifecycleEntry {
  return Object.freeze({ status, at, summary });
}

function validateTask(input: ControlPlaneTaskInput): void {
  for (const value of [input.taskId, input.title, input.workspace, input.prompt]) {
    if (!value.trim()) throw new TypeError("Control-plane task fields must be non-empty.");
  }
}

function validateAdapters(adapters: readonly AgentAdapter[]): void {
  if (adapters.length !== 2) throw new TypeError("Exactly two real agent adapters are required for this vertical slice.");
  if (new Set(adapters.map((adapter) => adapter.id)).size !== adapters.length) {
    throw new TypeError("Agent adapter IDs must be unique.");
  }
  if (new Set(adapters.map((adapter) => adapter.kind)).size !== adapters.length) {
    throw new TypeError("The control-plane proof requires independent agent runtime kinds.");
  }
}

function matchFindings(left: WorkerRun, right: WorkerRun): MatchedFindingPair[] {
  const matches: MatchedFindingPair[] = [];
  const claimedRight = new Set<number>();
  left.result!.findings.forEach((leftFinding) => {
    let best: { index: number; files: string[]; similarity: number } | undefined;
    right.result!.findings.forEach((rightFinding, index) => {
      if (claimedRight.has(index)) return;
      const files = findingFiles(leftFinding).filter((file) => findingFiles(rightFinding).includes(file));
      if (files.length === 0) return;
      const similarity = findingSimilarity(leftFinding, rightFinding);
      if (similarity < 0.3 || (best && best.similarity >= similarity)) return;
      best = { index, files, similarity };
    });
    if (!best) return;
    claimedRight.add(best.index);
    matches.push(Object.freeze({
      leftAgentId: left.agentId,
      rightAgentId: right.agentId,
      files: Object.freeze(best.files.sort()),
      similarity: Number(best.similarity.toFixed(3)),
    }));
  });
  return matches;
}

function findingSimilarity(left: ReviewFinding, right: ReviewFinding): number {
  const leftTokens = findingTokens(left);
  const rightTokens = findingTokens(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function findingTokens(finding: ReviewFinding): Set<string> {
  const ignored = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into",
    "is", "it", "of", "on", "or", "that", "the", "this", "to", "with",
  ]);
  const words = `${finding.finding} ${finding.smallestFix}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.map(stem).filter((word) => word.length > 2 && !ignored.has(word)));
}

function stem(value: string): string {
  return value.length > 4 && value.endsWith("s") && !value.endsWith("ss")
    ? value.slice(0, -1)
    : value;
}
