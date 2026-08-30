import { ControlPlaneSupervisor } from "./supervisor.js";
import type {
  AgentBackend,
  AgentBackendAdmission,
  ControlPlaneTaskInput,
  ControlPlaneTaskResult,
  ReconciliationResult,
  WorkerRun,
} from "./types.js";

export interface ControlPlaneWorkerSessionInput {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly workerRunId: string;
  readonly backendId: string;
  readonly backendKind: string;
  readonly admission: AgentBackendAdmission;
  readonly governanceRequired: boolean;
}

export interface ControlPlaneWorkerSession {
  readonly sessionId: string;
  readonly workerRunId: string;
  readonly backendId: string;
}

export interface ControlPlaneSessionLedger {
  createWorkerSession(input: ControlPlaneWorkerSessionInput): Promise<ControlPlaneWorkerSession>;
  recordWorkerResult(worker: WorkerRun, reconciliation: ReconciliationResult): Promise<void>;
  recordWorkerFailure(session: ControlPlaneWorkerSession, error: unknown): Promise<void>;
}

export interface ControlPlaneProductRuntimeOptions {
  readonly supervisor?: ControlPlaneSupervisor;
  readonly ledger: ControlPlaneSessionLedger;
}

/**
 * Product controller for one bounded control-plane task at a time.
 *
 * The controller creates durable worker sessions before starting the
 * supervisor, then settles each worker ledger with the final bounded result.
 */
export class ControlPlaneProductRuntime {
  private readonly supervisor: ControlPlaneSupervisor;
  private activeTaskId: string | null = null;

  constructor(private readonly options: ControlPlaneProductRuntimeOptions) {
    this.supervisor = options.supervisor ?? new ControlPlaneSupervisor();
  }

  get activeTask(): string | null {
    return this.activeTaskId;
  }

  async runTask(
    input: ControlPlaneTaskInput,
    backends: readonly AgentBackend[],
  ): Promise<ControlPlaneTaskResult> {
    if (this.activeTaskId) {
      throw new Error(`Control-plane task "${this.activeTaskId}" is already active.`);
    }
    this.activeTaskId = input.taskId;
    let sessions: readonly ControlPlaneWorkerSession[] = [];
    try {
      const admissions = await Promise.all(backends.map((backend) => backend.probeCapabilities()));
      sessions = Object.freeze(await Promise.all(backends.map((backend, index) => {
        const requirement = input.workers?.find((item) => item.backendId === backend.id);
        return this.options.ledger.createWorkerSession({
          taskId: input.taskId,
          taskTitle: input.title,
          workerRunId: controlPlaneWorkerRunId(input.taskId, index),
          backendId: backend.id,
          backendKind: backend.kind,
          admission: admissions[index]!,
          governanceRequired: requirement?.governanceRequired === true,
        });
      })));
      const result = await this.supervisor.runParallel({
        ...input,
        workers: backends.map((backend) => {
          const configured = input.workers?.find((item) => item.backendId === backend.id);
          const session = sessions.find((item) => item.backendId === backend.id)!;
          return Object.freeze({
            backendId: backend.id,
            sessionId: session.sessionId,
            governanceRequired: configured?.governanceRequired === true,
          });
        }),
      }, backends);
      await Promise.all(result.workers.map((worker) => (
        this.options.ledger.recordWorkerResult(worker, result.reconciliation)
      )));
      return result;
    } catch (error) {
      await Promise.allSettled(sessions.map((session) => (
        this.options.ledger.recordWorkerFailure(session, error)
      )));
      throw error;
    } finally {
      this.activeTaskId = null;
    }
  }
}

export function controlPlaneWorkerRunId(taskId: string, workerIndex: number): string {
  if (!taskId.trim()) throw new TypeError("Control-plane task ID must be non-empty.");
  if (!Number.isSafeInteger(workerIndex) || workerIndex < 0) {
    throw new TypeError("Control-plane worker index must be a non-negative integer.");
  }
  return `${taskId}:worker:${workerIndex + 1}`;
}
