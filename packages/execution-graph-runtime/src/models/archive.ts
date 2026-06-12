/**
 * Archive model — immutable snapshots and execution records
 */

import type { ExecutionNode, ExecutionEdge, GraphLifecycleStatus } from "./graph.js";

export interface GraphSnapshot {
  graphId: string;
  planId: string;
  version: number;
  status: GraphLifecycleStatus;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  rootNodeId: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  metadata: {
    nodeCount: number;
    completedCount: number;
    failedCount: number;
    durationMs?: number;
  };
}

export interface ExecutionRecord {
  id: string;
  graphId: string;
  graphVersion: number;
  action: string;
  nodeId?: string;
  timestamp: number;
  details?: unknown;
}

export interface GraphArchive {
  id: string;
  snapshots: GraphSnapshot[];
  records: ExecutionRecord[];
  replayCount: number;
  createdAt: number;
}
