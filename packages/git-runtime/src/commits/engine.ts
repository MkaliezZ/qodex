import type { GitCommit } from "../models/repository.js";
import type { GitAdapter } from "../repository/adapter.js";

export class CommitEngine {
  private adapter: GitAdapter;

  constructor(adapter: GitAdapter) {
    this.adapter = adapter;
  }

  async create(message: string): Promise<GitCommit> {
    if (!message.trim()) throw new Error("Commit message cannot be empty");
    return this.adapter.commit(message);
  }

  async list(maxCount = 50): Promise<GitCommit[]> {
    return this.adapter.log(maxCount);
  }

  async getLatest(): Promise<GitCommit | null> {
    const commits = await this.list(1);
    return commits.length > 0 ? commits[0] : null;
  }
}
