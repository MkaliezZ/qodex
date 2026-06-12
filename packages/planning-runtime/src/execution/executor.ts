/**
 * Graph Executor — deterministic sequential node execution
 *
 * No parallel execution in M11. Sequential only.
 */

import type { ExecutionGraph, NodeStatus } from "../models/graph.js";
import type { PlanningEventBus } from "../events/bus.js";

export type NodeExecutor = (nodeId: string, graph: ExecutionGraph) => Promise<unknown>;

export class GraphExecutor {
  constructor(
    private eventBus: PlanningEventBus,
    private nodeExecutor?: NodeExecutor,
  ) {}

  async execute(graph: ExecutionGraph): Promise<ExecutionGraph> {
    graph.status = "running";

    while (graph.status === "running") {
      const readyNodes = graph.getReadyNodes();

      if (readyNodes.length === 0) {
        break;
      }

      // Sequential — take the first ready node
      const node = readyNodes[0];
      node.status = "ready";
      this.eventBus.emit({
        type: "node.ready",
        nodeId: node.id,
        graphId: graph.id,
        timestamp: Date.now(),
      });

      await this.executeNode(graph, node);
    }

    // Determine final status
    if (graph.status !== "cancelled") {
      const allNodes = graph.getAllNodes();
      const hasFailed = allNodes.some((n) => n.status === "failed");
      const hasCancelled = allNodes.some((n) => n.status === "cancelled");
      const allDone = allNodes.every(
        (n) => n.status === "completed" || n.status === "failed" || n.status === "cancelled" || n.status === "blocked",
      );

      if (hasCancelled) {
        graph.status = "cancelled";
      } else if (hasFailed && allDone) {
        graph.status = "failed";
      } else if (allDone && !hasFailed) {
        graph.status = "completed";
        // Emit report
        const summary = `${allNodes.length} nodes completed`;
        this.eventBus.emit({
          type: "report.generated",
          graphId: graph.id,
          summary,
          nodeStatuses: allNodes.map((n) => ({ nodeId: n.id, status: n.status as NodeStatus })),
          timestamp: Date.now(),
        });
      }
    }

    graph.updatedAt = Date.now();
    return graph;
  }

  private async executeNode(
    graph: ExecutionGraph,
    node: NonNullable<ReturnType<ExecutionGraph["getNode"]>>,
  ): Promise<void> {
    node.status = "running";
    node.startedAt = Date.now();
    this.eventBus.emit({
      type: "node.started",
      nodeId: node.id,
      graphId: graph.id,
      timestamp: node.startedAt,
    });

    try {
      if (this.nodeExecutor) {
        node.result = await this.nodeExecutor(node.id, graph);
      } else {
        // Default: mock successful execution with a delay
        node.result = { mock: true, nodeId: node.id };
      }

      node.status = "completed";
      node.completedAt = Date.now();
      this.eventBus.emit({
        type: "node.completed",
        nodeId: node.id,
        graphId: graph.id,
        result: node.result,
        timestamp: node.completedAt,
      });

      // Mark failed dependencies' dependents as blocked
      // (handled by getReadyNodes requiring all deps completed)
    } catch (err) {
      node.retryCount++;

      if (node.retryCount > node.maxRetries) {
        node.status = "failed";
        this.eventBus.emit({
          type: "node.failed",
          nodeId: node.id,
          graphId: graph.id,
          error: err instanceof Error ? err.message : String(err),
          retryCount: node.retryCount,
          timestamp: Date.now(),
        });

        // Block all dependents
        for (const dependentId of node.dependents) {
          const dependent = graph.getNode(dependentId);
          if (dependent && (dependent.status === "pending" || dependent.status === "ready")) {
            dependent.status = "blocked";
            this.eventBus.emit({
              type: "node.blocked",
              nodeId: dependentId,
              graphId: graph.id,
              reason: `Dependency ${node.id} failed`,
              timestamp: Date.now(),
            });
          }
        }
      } else {
        // Retry: reset to pending (will be picked up again by getReadyNodes)
        node.status = "pending";
      }
    }
  }

  async cancel(graph: ExecutionGraph): Promise<void> {
    // Only cancel if graph is still in a cancellable state
    if (graph.status === "completed" || graph.status === "failed" || graph.status === "cancelled") {
      return;
    }
    graph.status = "cancelled";
    for (const node of graph.getAllNodes()) {
      if (node.status === "ready" || node.status === "pending" || node.status === "running") {
        node.status = "cancelled";
      }
    }
    graph.updatedAt = Date.now();
  }
}
