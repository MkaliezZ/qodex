export interface GitRepository {
  rootPath: string;
  isInitialized: boolean;
  currentBranch: string;
}

export interface GitCheckpoint {
  id: string;
  name: string;
  commitHash: string;
  createdAt: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  createdAt: string;
}

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  commitCount: number;
}

export interface GitEvent {
  type: "checkpoint.created" | "checkpoint.restored" | "commit.created" | "branch.created" | "branch.switched";
  payload: Record<string, unknown>;
  timestamp: string;
}
