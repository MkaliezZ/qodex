import type { GraphLifecycle } from "../lifecycle/lifecycle.js";
import type { GraphEventBus } from "../events/bus.js";

export type NodeDispatchFn = (nodeId: string, description: string, type: string) => Promise<unknown>;

export class NodeOrchestrator {
  constructor(
    private eventBus: GraphEventBus,
    private dispatch?: NodeDispatchFn,
  ) {}

  async executeGraph(graph: GraphLifecycle): Promise<GraphLifecycle> {
    graph.transition("running");
    this.eventBus.emit({ type: "graph.started", graphId: graph.id, timestamp: Date.now() });

    while (graph.status === "running") {
      const ready = graph.getReadyNodes();
      if (ready.length === 0) break;

      // Sequential execution
      for (const node of ready) {
        await this.executeNode(graph, node);
        if (graph.status !== "running") break;
      }
    }

    // Determine final status
    const progress = graph.getProgress();
    const totalDone = progress.completed + progress.failed + progress.blocked;
    if (totalDone === progress.total) {
      if (progress.failed > 0) {
        graph.transition("failed");
        this.eventBus.emit({ type: "graph.failed", graphId: graph.id, reason: `${progress.failed} node(s) failed`, timestamp: Date.now() });
      } else {
        graph.transition("completed");
        this.eventBus.emit({ type: "graph.completed", graphId: graph.id, timestamp: Date.now() });
      }
    }

    return graph;
  }

  private async executeNode(graph: GraphLifecycle, node: NonNullable<ReturnType<GraphLifecycle["getNode"]>>): Promise<void> {
    node.status = "running";
    node.startedAt = Date.now();

    this.eventBus.emit({ type: "node.dispatched", graphId: graph.id, nodeId: node.id, timestamp: Date.now() });

    try {
      if (this.dispatch) {
        node.result = await this.dispatch(node.id, node.description, node.type);
      } else {
        node.result = { mock: true, nodeId: node.id };
      }
      node.status = "completed";
      node.completedAt = Date.now();
      this.eventBus.emit({ type: "node.result", graphId: graph.id, nodeId: node.id, status: "completed", timestamp: Date.now() });
    } catch (err) {
      node.retryCount++;
      if (node.retryCount > node.maxRetries) {
        node.status = "failed";
        this.eventBus.emit({ type: "node.result", graphId: graph.id, nodeId: node.id, status: "failed", timestamp: Date.now() });
        // Block dependents
        for (const depId of node.dependents) {
          const dep = graph.getNode(depId);
          if (dep && (dep.status === "pending" || dep.status === "ready")) {
            dep.status = "blocked";
          }
        }
      } else {
        node.status = "pending"; // Retry
      }
    }
  }
}
