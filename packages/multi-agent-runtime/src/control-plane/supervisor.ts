import type {
  AgentBackend,
  AgentBackendAdmission,
  AgentBackendTaskOutput,
  AgentTaskResult,
  ControlPlaneTaskInput,
  ControlPlaneTaskResult,
  ControlPlaneWorkerRequirement,
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
  sessionId?: string;
  agentId: string;
  agentKind: string;
  agentVersion: string;
  model?: string;
  capabilities: AgentBackendAdmission["capabilities"];
  governance: WorkerRun["governance"];
  status: WorkerRunStatus;
  startedAt: string;
  endedAt: string;
  lifecycle: WorkerLifecycleEntry[];
  observations: WorkerRun["observations"] extends readonly (infer T)[] ? T[] : never;
  result?: AgentTaskResult;
  error?: string;
}

interface AdmittedBackend {
  readonly backend: AgentBackend;
  readonly admission: AgentBackendAdmission;
  readonly requirement: ControlPlaneWorkerRequirement;
}

export interface ControlPlaneSupervisorOptions {
  readonly now?: () => Date;
}

export class GovernanceAdmissionError extends Error {
  constructor(
    readonly backendId: string,
    readonly admittedTier: AgentBackendAdmission["capabilities"]["governanceTier"],
  ) {
    super(`Backend "${backendId}" cannot start because governed execution is required but its admitted tier is ${admittedTier}.`);
    this.name = "GovernanceAdmissionError";
  }
}

export class ControlPlaneSupervisor {
  static readonly workerLimit = 2;

  private readonly now: () => Date;

  constructor(options: ControlPlaneSupervisorOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async runParallel(
    input: ControlPlaneTaskInput,
    backends: readonly AgentBackend[],
  ): Promise<ControlPlaneTaskResult> {
    validateTask(input);
    validateBackends(backends);
    const admitted = await admitBackends(input, backends);
    const startedAt = this.timestamp();
    const workers = admitted.map((item, index) => this.createWorker(input, item, index));

    await Promise.all(workers.map((worker, index) => (
      this.runWorker(input, admitted[index]!, worker)
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
    });
  }

  private createWorker(
    input: ControlPlaneTaskInput,
    admitted: AdmittedBackend,
    index: number,
  ): MutableWorkerRun {
    const at = this.timestamp();
    const { backend, admission, requirement } = admitted;
    return {
      runId: `${input.taskId}:worker:${index + 1}`,
      taskId: input.taskId,
      ...(requirement.sessionId ? { sessionId: requirement.sessionId } : {}),
      agentId: backend.id,
      agentKind: backend.kind,
      agentVersion: admission.version,
      ...(admission.model ? { model: admission.model } : {}),
      capabilities: Object.freeze({ ...admission.capabilities }),
      governance: Object.freeze({
        tier: admission.capabilities.governanceTier,
        mode: admission.capabilities.governanceMode,
        evidence: Object.freeze([]),
      }),
      status: "queued",
      startedAt: at,
      endedAt: at,
      lifecycle: [lifecycle("queued", at, "Worker queued by the supervisor.")],
      observations: [],
    };
  }

  private async runWorker(
    input: ControlPlaneTaskInput,
    admitted: AdmittedBackend,
    worker: MutableWorkerRun,
  ): Promise<void> {
    worker.startedAt = this.transition(worker, "starting", "Starting the admitted agent backend.");
    this.transition(worker, "running", "Agent backend is running.");
    try {
      const output = await admitted.backend.startTask({
        taskId: input.taskId,
        title: input.title,
        workspace: input.workspace,
        prompt: input.prompt,
        workerRunId: worker.runId,
        ...(worker.sessionId ? { sessionId: worker.sessionId } : {}),
        governanceRequired: admitted.requirement.governanceRequired === true,
      }, (observation) => {
        worker.observations.push(Object.freeze({ ...observation }));
      });
      attachOutput(worker, output);
      worker.endedAt = this.transition(worker, "completed", "Agent returned a structured result.");
    } catch (error) {
      worker.error = error instanceof Error ? error.message : "Agent backend failed.";
      worker.endedAt = this.transition(worker, "failed", worker.error);
    }
  }

  private transition(worker: MutableWorkerRun, status: WorkerRunStatus, summary: string): string {
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

  const sharedFiles = [...fileSets[0]!]
    .filter((file) => fileSets.slice(1).every((files) => files.has(file)))
    .sort();
  const agentOnlyFiles = Object.fromEntries(completed.map((worker, index) => [
    worker.agentId,
    [...fileSets[index]!].filter((file) => !sharedFiles.includes(file)).sort(),
  ]));
  const matchedFindings = matchFindings(left!, right!);
  const allMatched = matchedFindings.length === left!.result!.findings.length
    && matchedFindings.length === right!.result!.findings.length
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

async function admitBackends(
  input: ControlPlaneTaskInput,
  backends: readonly AgentBackend[],
): Promise<readonly AdmittedBackend[]> {
  const requirements = requirementsByBackend(input, backends);
  const admitted = await Promise.all(backends.map(async (backend) => {
    const admission = freezeAdmission(await backend.probeCapabilities());
    const requirement = requirements.get(backend.id)!;
    if (requirement.governanceRequired && admission.capabilities.governanceTier !== "GOVERNED") {
      throw new GovernanceAdmissionError(backend.id, admission.capabilities.governanceTier);
    }
    return Object.freeze({ backend, admission, requirement });
  }));
  return Object.freeze(admitted);
}

function freezeAdmission(admission: AgentBackendAdmission): AgentBackendAdmission {
  if (!admission.version.trim()) throw new TypeError("Agent backend version must be non-empty.");
  const { governanceTier, governanceMode } = admission.capabilities;
  if (governanceTier === "GOVERNED" && governanceMode === "none") {
    throw new TypeError("A governed backend must declare its governance mode.");
  }
  if (governanceTier === "OPAQUE" && governanceMode !== "none") {
    throw new TypeError("An opaque backend cannot claim a governance integration mode.");
  }
  return Object.freeze({
    version: admission.version,
    ...(admission.model?.trim() ? { model: admission.model.trim() } : {}),
    capabilities: Object.freeze({ ...admission.capabilities }),
  });
}

function requirementsByBackend(
  input: ControlPlaneTaskInput,
  backends: readonly AgentBackend[],
): Map<string, ControlPlaneWorkerRequirement> {
  const configured = input.workers ?? [];
  if (new Set(configured.map((item) => item.backendId)).size !== configured.length) {
    throw new TypeError("Control-plane worker requirements must have unique backend IDs.");
  }
  const backendIds = new Set(backends.map((backend) => backend.id));
  if (configured.some((item) => !backendIds.has(item.backendId))) {
    throw new TypeError("Control-plane worker requirements reference an unknown backend.");
  }
  return new Map(backends.map((backend) => {
    const requirement = configured.find((item) => item.backendId === backend.id) ?? {
      backendId: backend.id,
      governanceRequired: false,
    };
    if (requirement.sessionId !== undefined && !requirement.sessionId.trim()) {
      throw new TypeError("Control-plane worker session IDs must be non-empty when provided.");
    }
    return [backend.id, Object.freeze({ ...requirement })];
  }));
}

function attachOutput(worker: MutableWorkerRun, output: AgentBackendTaskOutput): void {
  for (const evidence of output.governanceEvidence) {
    if (
      evidence.taskId !== worker.taskId
      || evidence.workerRunId !== worker.runId
      || evidence.agentId !== worker.agentId
      || evidence.agentKind !== worker.agentKind
      || evidence.agentVersion !== worker.agentVersion
    ) {
      throw new TypeError("Agent governance evidence does not match its worker identity.");
    }
  }
  worker.result = output.result;
  worker.governance = Object.freeze({
    ...worker.governance,
    evidence: Object.freeze(output.governanceEvidence.map((item) => Object.freeze({ ...item }))),
  });
}

function findingFiles(finding: ReviewFinding): string[] {
  return [...new Set(finding.files.map(normalizeFile).filter(Boolean))];
}

function normalizeFile(value: string): string {
  return value.trim().replace(/^\.\//, "").replace(/\\/g, "/");
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
    capabilities: Object.freeze({ ...worker.capabilities }),
    governance: Object.freeze({
      ...worker.governance,
      evidence: Object.freeze([...worker.governance.evidence]),
    }),
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

function validateBackends(backends: readonly AgentBackend[]): void {
  if (backends.length !== ControlPlaneSupervisor.workerLimit) {
    throw new TypeError(`The bounded product supervisor currently requires ${ControlPlaneSupervisor.workerLimit} backends.`);
  }
  if (new Set(backends.map((backend) => backend.id)).size !== backends.length) {
    throw new TypeError("Agent backend IDs must be unique.");
  }
  if (new Set(backends.map((backend) => backend.kind)).size !== backends.length) {
    throw new TypeError("The bounded control plane requires independent agent runtime kinds.");
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
