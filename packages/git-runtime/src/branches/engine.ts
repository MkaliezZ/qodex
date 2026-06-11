import type { GitBranch } from "../models/repository.js";
import type { GitAdapter } from "../repository/adapter.js";

export class BranchEngine {
  private adapter: GitAdapter;

  constructor(adapter: GitAdapter) {
    this.adapter = adapter;
  }

  async create(name: string): Promise<GitBranch> {
    if (!name.trim()) throw new Error("Branch name cannot be empty");
    const branch = await this.adapter.createBranch(name);
    return branch;
  }

  async switch(name: string): Promise<void> {
    await this.adapter.switchBranch(name);
  }

  async list(): Promise<GitBranch[]> {
    return this.adapter.listBranches();
  }

  async getCurrent(): Promise<string> {
    return this.adapter.getCurrentBranch();
  }
}
