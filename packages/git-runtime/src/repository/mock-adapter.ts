import type { GitAdapter } from "./adapter.js";
import type { GitRepository, GitStatus, GitCommit, GitBranch } from "../models/repository.js";

export class MockGitAdapter implements GitAdapter {
  private initialized = false;
  private commits: GitCommit[] = [];
  private branches: GitBranch[] = [{ name: "main", isCurrent: true, commitCount: 0 }];
  private currentBranchName = "main";
  private hashCounter = 0;
  private files = new Map<string, string>();

  async detect(_rootPath: string): Promise<boolean> {
    return this.initialized;
  }

  async init(rootPath: string): Promise<GitRepository> {
    this.initialized = true;
    this.commits = [];
    this.branches = [{ name: "main", isCurrent: true, commitCount: 0 }];
    this.currentBranchName = "main";
    this.hashCounter = 0;
    return { rootPath, isInitialized: true, currentBranch: "main" };
  }

  async open(rootPath: string): Promise<GitRepository> {
    return { rootPath, isInitialized: this.initialized, currentBranch: this.currentBranchName };
  }

  async getStatus(): Promise<GitStatus> {
    const status: GitStatus = { modified: [], added: [], deleted: [], untracked: [] };
    for (const [path] of this.files) {
      if (path.startsWith("modified:")) status.modified.push(path.slice(9));
      else if (path.startsWith("added:")) status.added.push(path.slice(6));
      else if (path.startsWith("deleted:")) status.deleted.push(path.slice(8));
      else status.untracked.push(path);
    }
    return status;
  }

  markModified(path: string) { this.files.set(`modified:${path}`, "1"); }
  markAdded(path: string) { this.files.set(`added:${path}`, "1"); }
  markDeleted(path: string) { this.files.set(`deleted:${path}`, "1"); }
  markUntracked(path: string) { this.files.set(path, "1"); }
  clearFiles() { this.files.clear(); }

  async stageAll(): Promise<void> {
    this.files.clear();
  }

  async commit(message: string): Promise<GitCommit> {
    this.hashCounter++;
    const hash = `mock${String(this.hashCounter).padStart(9, "0")}`;
    const commit: GitCommit = { hash, message, createdAt: new Date().toISOString() };
    this.commits.push(commit);
    const branch = this.branches.find((b) => b.name === this.currentBranchName);
    if (branch) branch.commitCount++;
    this.files.clear();
    return commit;
  }

  async log(maxCount = 50): Promise<GitCommit[]> {
    return [...this.commits].reverse().slice(0, maxCount);
  }

  async createBranch(name: string): Promise<GitBranch> {
    const existing = this.branches.find((b) => b.name === name);
    if (existing) return existing;
    const branch: GitBranch = { name, isCurrent: false, commitCount: 0 };
    this.branches.push(branch);
    return branch;
  }

  async switchBranch(name: string): Promise<void> {
    const branch = this.branches.find((b) => b.name === name);
    if (!branch) throw new Error(`Branch "${name}" not found`);
    this.branches.forEach((b) => (b.isCurrent = false));
    branch.isCurrent = true;
    this.currentBranchName = name;
  }

  async listBranches(): Promise<GitBranch[]> {
    return [...this.branches];
  }

  async getCurrentBranch(): Promise<string> {
    return this.currentBranchName;
  }

  async getHash(): Promise<string> {
    return this.commits.length > 0 ? this.commits[this.commits.length - 1].hash : "mock000000000";
  }
}
