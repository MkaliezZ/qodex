import type { GitCheckpoint } from "../models/repository.js";
import type { GitAdapter } from "../repository/adapter.js";

export class CheckpointEngine {
  private checkpoints: GitCheckpoint[] = [];
  private adapter: GitAdapter;

  constructor(adapter: GitAdapter) {
    this.adapter = adapter;
  }

  async create(name: string): Promise<GitCheckpoint> {
    const hash = await this.adapter.getHash();
    const existing = this.checkpoints.find((c) => c.name === name);
    if (existing) throw new Error(`Checkpoint "${name}" already exists`);

    const checkpoint: GitCheckpoint = {
      id: crypto.randomUUID(),
      name,
      commitHash: hash,
      createdAt: new Date().toISOString(),
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  async restore(name: string): Promise<GitCheckpoint> {
    const cp = this.checkpoints.find((c) => c.name === name);
    if (!cp) throw new Error(`Checkpoint "${name}" not found`);
    return cp;
  }

  list(): GitCheckpoint[] {
    return [...this.checkpoints];
  }

  remove(name: string): boolean {
    const idx = this.checkpoints.findIndex((c) => c.name === name);
    if (idx === -1) return false;
    this.checkpoints.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.checkpoints = [];
  }

  get count(): number {
    return this.checkpoints.length;
  }
}
