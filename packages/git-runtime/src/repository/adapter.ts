import type { GitRepository, GitStatus, GitCommit, GitBranch } from "../models/repository.js";

export interface GitAdapter {
  detect(rootPath: string): Promise<boolean>;
  init(rootPath: string): Promise<GitRepository>;
  open(rootPath: string): Promise<GitRepository>;
  getStatus(): Promise<GitStatus>;
  stageAll(): Promise<void>;
  commit(message: string): Promise<GitCommit>;
  log(maxCount?: number): Promise<GitCommit[]>;
  createBranch(name: string): Promise<GitBranch>;
  switchBranch(name: string): Promise<void>;
  listBranches(): Promise<GitBranch[]>;
  getCurrentBranch(): Promise<string>;
  getHash(): Promise<string>;
}
