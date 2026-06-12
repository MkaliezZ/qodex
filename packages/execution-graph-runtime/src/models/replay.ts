/**
 * Replay model — read-only observational re-execution
 */

import type { ExecutionRecord } from "./archive.js";

export type ReplayType = "graph" | "node" | "path";

export interface ReplayRequest {
  archiveId: string;
  type: ReplayType;
  nodeId?: string;
  nodeIds?: string[];
}

export interface ReplayResult {
  archiveId: string;
  type: ReplayType;
  events: ExecutionRecord[];
  durationMs: number;
  timestamp: number;
}
