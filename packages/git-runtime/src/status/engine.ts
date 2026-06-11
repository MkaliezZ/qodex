import type { GitStatus } from "../models/repository.js";
import type { GitAdapter } from "../repository/adapter.js";

export class StatusEngine {
  private adapter: GitAdapter;

  constructor(adapter: GitAdapter) {
    this.adapter = adapter;
  }

  async getStatus(): Promise<GitStatus> {
    return this.adapter.getStatus();
  }

  async getFileCount(): Promise<number> {
    const s = await this.getStatus();
    return s.modified.length + s.added.length + s.deleted.length + s.untracked.length;
  }

  async hasChanges(): Promise<boolean> {
    return (await this.getFileCount()) > 0;
  }
}
