/**
 * Replanner — handles plan revision on failure, dependency change, or user request
 *
 * Max replan depth: 3
 * No autonomous background replanning
 * No hidden graph mutation
 */

import type { ExecutionGraph } from "../models/graph.js";
import { ExecutionGraph as ExecutionGraphClass } from "../models/graph.js";
import type { PlanStep } from "../models/plan.js";
import type { Planner } from "../planner/planner.js";
import type { PlanningEventBus } from "../events/bus.js";

export type ReplanReason = "failure" | "dependency_change" | "user_request";

export interface ReplanRequest {
  graphId: string;
  reason: ReplanReason;
  failedNodeIds?: string[];
  userInput?: string;
  timestamp: number;
}

export interface NodeChange {
  type: "added" | "removed" | "modified";
  nodeId: string;
}

export interface ReplanResult {
  originalGraphId: string;
  newGraphId: string;
  changes: NodeChange[];
  reason: ReplanReason;
  timestamp: number;
  depth: number;
}

export class Replanner {
  private replanCount = 0;
  private readonly maxDepth = 3;

  constructor(
    private planner: Planner,
    private eventBus: PlanningEventBus,
  ) {}

  canReplan(): boolean {
    return this.replanCount < this.maxDepth;
  }

  async requestReplan(
    request: ReplanRequest,
    originalGraph: ExecutionGraph,
  ): Promise<ReplanResult | null> {
    if (!this.canReplan()) {
      return null; // Max replan depth exceeded
    }

    this.eventBus.emit({
      type: "replan.requested",
      graphId: request.graphId,
      reason: request.reason,
      timestamp: Date.now(),
    });

    this.replanCount++;

    // Remove failed nodes from new graph
    const failedIds = new Set(request.failedNodeIds ?? []);
    const survivingNodes = originalGraph.getAllNodes().filter(
      (n) => !failedIds.has(n.id) && n.status !== "failed" && n.status !== "blocked",
    );

    // Build changes list
    const changes: NodeChange[] = [];
    for (const failedId of failedIds) {
      changes.push({ type: "removed", nodeId: failedId });
    }

    const newGraph = new ExecutionGraphClass({
      id: `graph-replan-${this.replanCount}-${Date.now()}`,
      planId: originalGraph.planId,
      nodes: survivingNodes.map((n) => ({
        ...n,
        status: "pending" as const,
        retryCount: 0,
        startedAt: undefined,
        completedAt: undefined,
        result: undefined,
      })),
      rootNodeId: originalGraph.rootNodeId,
      status: "ready",
    });

    this.eventBus.emit({
      type: "replan.completed",
      graphId: request.graphId,
      newGraphId: newGraph.id,
      timestamp: Date.now(),
    });

    return {
      originalGraphId: request.graphId,
      newGraphId: newGraph.id,
      changes,
      reason: request.reason,
      timestamp: Date.now(),
      depth: this.replanCount,
    };
  }

  getCurrentDepth(): number {
    return this.replanCount;
  }

  reset(): void {
    this.replanCount = 0;
  }
}
