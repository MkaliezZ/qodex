import type { GraphLifecycle } from "../lifecycle/lifecycle.js";
import type { ArchiveManager } from "../archive/archive.js";
import type { GraphArchive } from "../models/archive.js";

export class GraphInspector {
  constructor(
    private graphs: Map<string, GraphLifecycle>,
    private archiveManager: ArchiveManager,
  ) {}

  getGraph(id: string): GraphLifecycle | null { return this.graphs.get(id) ?? null; }
  getNodeState(graphId: string, nodeId: string): { status: string; result?: unknown } | null {
    const g = this.graphs.get(graphId);
    if (!g) return null;
    const n = g.getNode(nodeId);
    return n ? { status: n.status, result: n.result } : null;
  }
  getGraphStatus(id: string): string | null { return this.graphs.get(id)?.status ?? null; }
  getProgress(id: string) { return this.graphs.get(id)?.getProgress() ?? null; }
  listGraphs(): GraphLifecycle[] { return Array.from(this.graphs.values()); }
  listArchives(): GraphArchive[] { return this.archiveManager.listArchives(); }
  getArchiveHistory(id: string) { return this.archiveManager.getArchive(id)?.records ?? null; }
}
