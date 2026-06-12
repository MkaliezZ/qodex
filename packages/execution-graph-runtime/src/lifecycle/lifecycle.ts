import type { ExecutionNode, ExecutionEdge, GraphLifecycleStatus, NodeStatus } from "../models/graph.js";
import { LEGAL_TRANSITIONS } from "../models/graph.js";

export class GraphLifecycle {
  public readonly id: string;
  public readonly planId: string;
  public status: GraphLifecycleStatus;
  public nodes: Map<string, ExecutionNode>;
  public edges: ExecutionEdge[];
  public readonly rootNodeId: string;
  public readonly createdAt: number;
  public startedAt?: number;
  public completedAt?: number;

  constructor(params: {
    id: string; planId: string; nodes: ExecutionNode[];
    rootNodeId: string; status?: GraphLifecycleStatus; createdAt?: number;
  }) {
    this.id = params.id;
    this.planId = params.planId;
    this.rootNodeId = params.rootNodeId;
    this.status = params.status ?? "created";
    this.createdAt = params.createdAt ?? Date.now();
    this.edges = [];
    this.nodes = new Map(params.nodes.map((n) => {
      n.dependents = n.dependents ?? [];
      return [n.id, n];
    }));

    // Compute dependents and edges
    for (const node of params.nodes) {
      for (const depId of node.dependencies) {
        this.edges.push({ id: `${depId}->${node.id}`, from: depId, to: node.id, type: "depends_on" });
        const dep = this.nodes.get(depId);
        if (dep && !dep.dependents.includes(node.id)) dep.dependents.push(node.id);
      }
    }
  }

  getNode(id: string): ExecutionNode | null { return this.nodes.get(id) ?? null; }
  getAllNodes(): ExecutionNode[] { return Array.from(this.nodes.values()); }

  getProgress(): { completed: number; total: number; failed: number; blocked: number } {
    let completed = 0, failed = 0, blocked = 0;
    for (const n of this.nodes.values()) {
      if (n.status === "completed") completed++;
      else if (n.status === "failed") failed++;
      else if (n.status === "blocked") blocked++;
    }
    return { completed, total: this.nodes.size, failed, blocked };
  }

  getReadyNodes(): ExecutionNode[] {
    return this.getAllNodes().filter((n) =>
      n.status === "pending" && n.dependencies.every((d) => this.nodes.get(d)?.status === "completed"),
    );
  }

  validate(): { valid: boolean; cycles?: string[][]; orphans?: string[] } {
    const visiting = new Set<string>(); const visited = new Set<string>(); const cycles: string[][] = [];
    const dfs = (id: string, path: string[]): boolean => {
      if (visiting.has(id)) { cycles.push([...path.slice(path.indexOf(id)), id]); return true; }
      if (visited.has(id)) return false;
      visiting.add(id); path.push(id);
      const n = this.nodes.get(id);
      if (n) for (const d of n.dependencies) dfs(d, [...path]);
      visiting.delete(id); visited.add(id);
      return false;
    };
    for (const id of this.nodes.keys()) if (!visited.has(id)) dfs(id, []);
    const orphans = this.getAllNodes().filter((n) => {
      if (n.id === this.rootNodeId) return false;
      const hasDeps = n.dependencies.length > 0;
      const hasDependents = n.dependents.length > 0;
      const isReferenced = this.getAllNodes().some((o) => o.dependencies.includes(n.id));
      return !hasDeps && !hasDependents && !isReferenced;
    }).map((n) => n.id);
    return { valid: cycles.length === 0 && orphans.length === 0, cycles: cycles.length ? cycles : undefined, orphans: orphans.length ? orphans : undefined };
  }

  canTransition(to: GraphLifecycleStatus): boolean {
    return LEGAL_TRANSITIONS[this.status]?.includes(to) ?? false;
  }

  transition(to: GraphLifecycleStatus): boolean {
    if (!this.canTransition(to)) return false;
    this.status = to;
    if (to === "running") this.startedAt = Date.now();
    if (to === "completed" || to === "failed") this.completedAt = Date.now();
    return true;
  }
}
