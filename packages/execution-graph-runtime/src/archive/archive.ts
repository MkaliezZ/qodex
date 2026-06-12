import type { GraphSnapshot, ExecutionRecord, GraphArchive } from "../models/archive.js";
import type { GraphLifecycle } from "../lifecycle/lifecycle.js";
import type { GraphEventBus } from "../events/bus.js";

export class ArchiveManager {
  private archives = new Map<string, GraphArchive>();
  private recordCounter = 0;

  constructor(private eventBus: GraphEventBus) {}

  createArchive(graph: GraphLifecycle): GraphArchive {
    const progress = graph.getProgress();
    const snapshot: GraphSnapshot = {
      graphId: graph.id,
      planId: graph.planId,
      version: 1,
      status: graph.status,
      nodes: graph.getAllNodes().map((n) => ({ ...n, dependents: [...n.dependents] })),
      edges: graph.edges.map((e) => ({ ...e })),
      rootNodeId: graph.rootNodeId,
      createdAt: graph.createdAt,
      startedAt: graph.startedAt,
      completedAt: graph.completedAt,
      metadata: {
        nodeCount: progress.total,
        completedCount: progress.completed,
        failedCount: progress.failed,
        durationMs: graph.startedAt && graph.completedAt ? graph.completedAt - graph.startedAt : undefined,
      },
    };

    const records: ExecutionRecord[] = graph.getAllNodes().map((n) => ({
      id: `rec-${++this.recordCounter}`,
      graphId: graph.id,
      graphVersion: 1,
      action: n.status === "completed" ? "node_completed" : n.status === "failed" ? "node_failed" : "node_" + n.status,
      nodeId: n.id,
      timestamp: n.completedAt ?? Date.now(),
      details: n.result ?? undefined,
    }));

    const archive: GraphArchive = {
      id: `archive-${graph.id}`,
      snapshots: [snapshot],
      records,
      replayCount: 0,
      createdAt: Date.now(),
    };

    this.archives.set(archive.id, archive);

    this.eventBus.emit({
      type: "history.created", archiveId: archive.id, recordCount: records.length, timestamp: Date.now(),
    });

    return archive;
  }

  getArchive(id: string): GraphArchive | null { return this.archives.get(id) ?? null; }
  listArchives(): GraphArchive[] { return Array.from(this.archives.values()); }

  exportArchive(id: string): object | null {
    const a = this.archives.get(id);
    return a ? JSON.parse(JSON.stringify(a)) : null;
  }

  importArchive(data: object): GraphArchive {
    const a = data as GraphArchive;
    this.archives.set(a.id, a);
    return a;
  }
}
