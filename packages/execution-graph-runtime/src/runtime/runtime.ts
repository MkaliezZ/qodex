import { GraphLifecycle } from "../lifecycle/lifecycle.js";
import { ArchiveManager } from "../archive/archive.js";
import { ReplayEngine } from "../replay/replay.js";
import { GraphInspector } from "../inspection/inspector.js";
import { GraphTraverser } from "../traversal/traverser.js";
import { NodeOrchestrator, type NodeDispatchFn } from "../orchestration/orchestrator.js";
import { GraphEventBus } from "../events/bus.js";
import type { ExecutionNode } from "../models/graph.js";
import type { GraphEvent, EventHandler } from "../models/events.js";

export interface ExecutionGraphRuntimeOptions {
  dispatch?: NodeDispatchFn;
}

export class ExecutionGraphRuntime {
  private graphs = new Map<string, GraphLifecycle>();
  private eventBus = new GraphEventBus();
  private archiveManager = new ArchiveManager(this.eventBus);
  private replayEngine = new ReplayEngine(this.archiveManager, this.eventBus);
  private inspector: GraphInspector;
  private traverser = new GraphTraverser();
  private orchestrator: NodeOrchestrator;

  constructor(options: ExecutionGraphRuntimeOptions = {}) {
    this.inspector = new GraphInspector(this.graphs, this.archiveManager);
    this.orchestrator = new NodeOrchestrator(this.eventBus, options.dispatch);

    // Bind query methods after inspector is initialized
    this.getGraph = this.inspector.getGraph.bind(this.inspector);
    this.getNodeState = this.inspector.getNodeState.bind(this.inspector);
    this.getGraphStatus = this.inspector.getGraphStatus.bind(this.inspector);
    this.getProgress = this.inspector.getProgress.bind(this.inspector);
    this.listGraphs = this.inspector.listGraphs.bind(this.inspector);
    this.listArchives = this.inspector.listArchives.bind(this.inspector);
    this.getArchiveHistory = this.inspector.getArchiveHistory.bind(this.inspector);
  }

  // ── Lifecycle ─────────────────────────────────

  buildGraph(params: { planId: string; nodes: ExecutionNode[]; rootNodeId: string }): GraphLifecycle {
    const graph = new GraphLifecycle({
      id: `graph-${params.planId}-${Date.now()}`,
      planId: params.planId,
      nodes: params.nodes,
      rootNodeId: params.rootNodeId,
      status: "created",
    });

    const validation = graph.validate();
    if (validation.valid) {
      graph.transition("validated");
      graph.transition("ready");
      this.eventBus.emit({ type: "graph.validated", graphId: graph.id, valid: true, timestamp: Date.now() });
    } else {
      graph.transition("failed");
      this.eventBus.emit({ type: "graph.failed", graphId: graph.id, reason: "Validation failed", timestamp: Date.now() });
    }

    this.graphs.set(graph.id, graph);
    this.eventBus.emit({ type: "graph.created", graphId: graph.id, planId: params.planId, timestamp: Date.now() });

    return graph;
  }

  async start(graph: GraphLifecycle): Promise<GraphLifecycle> {
    if (!graph.canTransition("running")) {
      throw new Error(`Cannot start graph in ${graph.status} state`);
    }
    return this.orchestrator.executeGraph(graph);
  }

  async cancel(graphId: string): Promise<void> {
    const g = this.graphs.get(graphId);
    if (!g) throw new Error(`Graph ${graphId} not found`);
    if (g.canTransition("cancelled")) {
      g.transition("cancelled");
      this.eventBus.emit({ type: "graph.cancelled", graphId, timestamp: Date.now() });
    }
  }

  // ── Archive ───────────────────────────────────

  archive(graphId: string) {
    const g = this.graphs.get(graphId);
    if (!g) throw new Error(`Graph ${graphId} not found`);
    if (!g.canTransition("archived")) throw new Error(`Cannot archive graph in ${g.status} state`);
    g.transition("archived");
    const archive = this.archiveManager.createArchive(g);
    this.eventBus.emit({ type: "graph.archived", graphId, archiveId: archive.id, timestamp: Date.now() });
    return archive;
  }

  // ── Replay ────────────────────────────────────

  async replayGraph(archiveId: string) {
    return this.replayEngine.replay({ archiveId, type: "graph" });
  }
  async replayNode(archiveId: string, nodeId: string) {
    return this.replayEngine.replay({ archiveId, type: "node", nodeId });
  }
  async replayPath(archiveId: string, nodeIds: string[]) {
    return this.replayEngine.replay({ archiveId, type: "path", nodeIds });
  }

  // ── Query ─────────────────────────────────────

  getGraph!: (id: string) => GraphLifecycle | null;
  getNodeState!: (graphId: string, nodeId: string) => { status: string; result?: unknown } | null;
  getGraphStatus!: (id: string) => string | null;
  getProgress!: (id: string) => ReturnType<typeof this.inspector.getProgress>;
  listGraphs!: () => GraphLifecycle[];
  listArchives!: () => ReturnType<typeof this.inspector.listArchives>;
  getArchiveHistory!: (id: string) => ReturnType<typeof this.inspector.getArchiveHistory>;
  topologicalSort = (graphId: string) => {
    const g = this.graphs.get(graphId);
    if (!g) return [];
    return this.traverser.topologicalSort(g);
  };
  dependencyWalk = (graphId: string, nodeId: string) => {
    const g = this.graphs.get(graphId);
    if (!g) return [];
    return this.traverser.dependencyWalk(g, nodeId);
  };

  // ── Events ────────────────────────────────────

  subscribe(handler: EventHandler): () => void { return this.eventBus.subscribe(handler); }

  // ── Serialization ─────────────────────────────

  exportArchive(id: string) { return this.archiveManager.exportArchive(id); }
  importArchive(data: object) { return this.archiveManager.importArchive(data); }
}
