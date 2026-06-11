import type { GitRepository, GitCheckpoint, GitCommit, GitBranch, GitStatus } from "./models/repository.js";
import type { GitAdapter } from "./repository/adapter.js";
import { MockGitAdapter } from "./repository/mock-adapter.js";
import { CheckpointEngine } from "./checkpoints/engine.js";
import { CommitEngine } from "./commits/engine.js";
import { BranchEngine } from "./branches/engine.js";
import { StatusEngine } from "./status/engine.js";
import { GitEventBus } from "./repository/events.js";

export class GitRuntime {
  readonly events: GitEventBus;
  readonly checkpoints: CheckpointEngine;
  readonly commits: CommitEngine;
  readonly branches: BranchEngine;
  readonly status: StatusEngine;

  private adapter: GitAdapter;
  private _repository: GitRepository | null = null;
  private _rootPath: string = "";

  constructor(adapter?: GitAdapter) {
    this.adapter = adapter ?? new MockGitAdapter();
    this.events = new GitEventBus();
    this.checkpoints = new CheckpointEngine(this.adapter);
    this.commits = new CommitEngine(this.adapter);
    this.branches = new BranchEngine(this.adapter);
    this.status = new StatusEngine(this.adapter);
  }

  get repository(): GitRepository | null { return this._repository; }
  get rootPath(): string { return this._rootPath; }
  get isOpen(): boolean { return this._repository !== null; }

  async openRepository(rootPath: string): Promise<GitRepository> {
    this._rootPath = rootPath;
    const detected = await this.adapter.detect(rootPath);
    if (detected) {
      this._repository = await this.adapter.open(rootPath);
    } else {
      this._repository = await this.adapter.init(rootPath);
    }
    return this._repository;
  }

  async initializeRepository(rootPath: string): Promise<GitRepository> {
    this._rootPath = rootPath;
    this._repository = await this.adapter.init(rootPath);
    return this._repository;
  }

  async getStatus(): Promise<GitStatus> {
    return this.status.getStatus();
  }

  async createCheckpoint(name: string): Promise<GitCheckpoint> {
    const cp = await this.checkpoints.create(name);
    this.events.publish("checkpoint.created", { name, id: cp.id, hash: cp.commitHash });
    return cp;
  }

  async restoreCheckpoint(name: string): Promise<GitCheckpoint> {
    const cp = await this.checkpoints.restore(name);
    this.events.publish("checkpoint.restored", { name, id: cp.id });
    return cp;
  }

  async createCommit(message: string): Promise<GitCommit> {
    const commit = await this.commits.create(message);
    this.events.publish("commit.created", { hash: commit.hash, message });
    return commit;
  }

  async createBranch(name: string): Promise<GitBranch> {
    const branch = await this.branches.create(name);
    this.events.publish("branch.created", { name });
    return branch;
  }

  async switchBranch(name: string): Promise<void> {
    await this.branches.switch(name);
    this.events.publish("branch.switched", { name });
    if (this._repository) this._repository.currentBranch = name;
  }
}
