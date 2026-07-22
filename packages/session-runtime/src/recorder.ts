import type { SessionRuntime } from "./runtime.js";
import type { AppendEntryInput } from "./types.js";

export class SessionRecorder {
  private readonly recordKeys = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly runtime: SessionRuntime,
    readonly sessionId: string,
    private readonly onRecorded?: () => void | Promise<void>,
  ) {}

  record(entry: AppendEntryInput): void {
    void this.enqueue(entry).catch(() => {
      // Durable barriers and flush surface the queued persistence failure.
    });
  }

  recordDurably(entry: AppendEntryInput): Promise<void> {
    return this.enqueue(entry);
  }

  private enqueue(entry: AppendEntryInput): Promise<void> {
    const recordKey = entry.safeMetadata?.recordKey;
    this.queue = this.queue.then(async () => {
      await this.initialize();
      if (recordKey && this.recordKeys.has(recordKey)) return;
      await this.runtime.appendEntry(this.sessionId, entry);
      if (recordKey) this.recordKeys.add(recordKey);
      await this.onRecorded?.();
    });
    return this.queue;
  }

  async flush(): Promise<void> {
    await this.queue;
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
