import type { SessionRuntime } from "./runtime.js";
import type { AppendEntryInput } from "./types.js";

export class SessionRecorder {
  private readonly recordKeys = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private backgroundFailure: unknown = null;
  private initialized = false;

  constructor(
    private readonly runtime: SessionRuntime,
    readonly sessionId: string,
    private readonly onRecorded?: () => void | Promise<void>,
  ) {}

  record(entry: AppendEntryInput): void {
    void this.enqueue(entry, true).catch(() => {});
  }

  recordDurably(entry: AppendEntryInput): Promise<void> {
    return this.enqueue(entry, false);
  }

  private enqueue(entry: AppendEntryInput, surfaceOnFlush: boolean): Promise<void> {
    const recordKey = entry.safeMetadata?.recordKey;
    const operation = this.queue.then(async () => {
      await this.initialize();
      if (recordKey && this.recordKeys.has(recordKey)) return;
      await this.runtime.appendEntry(this.sessionId, entry);
      if (recordKey) this.recordKeys.add(recordKey);
      try {
        await this.onRecorded?.();
      } catch {
        // UI refresh failures do not change whether the ledger commit succeeded.
      }
    });
    this.queue = operation.then(
      () => undefined,
      (error) => {
        if (surfaceOnFlush && this.backgroundFailure === null) this.backgroundFailure = error;
      },
    );
    return operation;
  }

  async flush(): Promise<void> {
    await this.queue;
    if (this.backgroundFailure !== null) {
      const failure = this.backgroundFailure;
      this.backgroundFailure = null;
      throw failure;
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    const entries = await this.runtime.loadActivePath(this.sessionId);
    for (const entry of entries) {
      if (entry.safeMetadata.recordKey) this.recordKeys.add(entry.safeMetadata.recordKey);
    }
    this.initialized = true;
  }
}
