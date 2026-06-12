/**
 * Execution graph model — DAG of nodes and edges
 */

import type { NodeType } from "./plan.js";

export type { NodeType };

export type NodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type GraphStatus =
  | "building"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type EdgeType = "depends_on" | "produces_for" | "reports_to";

export interface ExecutionNode {
  id: string;
  type: NodeType;
  status: NodeStatus;
  description: string;
  dependencies: string[];
  dependents: string[];
  result?: unknown;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  maxRetries: number;
}

export interface ExecutionEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
}

export interface ExecutionGraphSerialized {
  id: string;
  planId: string;
  nodes: ExecutionNode[];
  edges: ExecutionEdge[];
  rootNodeId: string;
  status: GraphStatus;
  createdAt: number;
  updatedAt: number;
}

export class ExecutionGraph {
  public readonly id: string;
  public readonly planId: string;
  public readonly nodes: Map<string, ExecutionNode>;
  public readonly edges: ExecutionEdge[];
  public readonly rootNodeId: string;
  public status: GraphStatus;
  public readonly createdAt: number;
  public updatedAt: number;

  constructor(params: {
    id: string;
    planId: string;
    nodes: ExecutionNode[];
    rootNodeId: string;
    status?: GraphStatus;
    createdAt?: number;
  }) {
    this.id = params.id;
    this.planId = params.planId;
    this.rootNodeId = params.rootNodeId;
    this.status = params.status ?? "building";
    this.createdAt = params.createdAt ?? Date.now();
    this.updatedAt = Date.now();

    // Compute dependents from dependency declarations
    for (const node of params.nodes) {
      node.dependents = node.dependents ?? [];
      if (node.dependencies.length === 0) continue;
      for (const depId of node.dependencies) {
        const depNode = params.nodes.find((n) => n.id === depId);
        if (depNode) {
          if (!depNode.dependents.includes(node.id)) {
            depNode.dependents.push(node.id);
          }
        }
      }
    }

    this.nodes = new Map(params.nodes.map((n) => [n.id, n]));

    // Build edges from dependency declarations
    this.edges = [];
    for (const node of params.nodes) {
      for (const depId of node.dependencies) {
        this.edges.push({
          id: `${depId}→${node.id}`,
          from: depId,
          to: node.id,
          type: "depends_on",
        });
      }
    }
  }

  getNode(id: string): ExecutionNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): ExecutionNode[] {
    return Array.from(this.nodes.values());
  }

  validateDAG(): { valid: boolean; cycles?: string[][] } {
    // DFS cycle detection
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (nodeId: string, path: string[]): boolean => {
      if (visiting.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        cycles.push([...path.slice(cycleStart), nodeId]);
        return true;
      }
      if (visited.has(nodeId)) return false;

      visiting.add(nodeId);
      path.push(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (dfs(depId, [...path])) return true;
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    }

    return { valid: cycles.length === 0, cycles: cycles.length > 0 ? cycles : undefined };
  }

  validateOrphans(): string[] {
    const referenced = new Set<string>();
    for (const edge of this.edges) {
      referenced.add(edge.from);
      referenced.add(edge.to);
    }
    const orphans: string[] = [];
    for (const nodeId of this.nodes.keys()) {
      if (!referenced.has(nodeId) && nodeId !== this.rootNodeId) {
        orphans.push(nodeId);
      }
    }
    return orphans;
  }

  getReadyNodes(): ExecutionNode[] {
    return this.getAllNodes().filter((node) => {
      if (node.status !== "pending") return false;
      return node.dependencies.every((depId) => {
        const dep = this.nodes.get(depId);
        return dep && dep.status === "completed";
      });
    });
  }

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  toJSON(): ExecutionGraphSerialized {
    return {
      id: this.id,
      planId: this.planId,
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      rootNodeId: this.rootNodeId,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  static fromJSON(json: ExecutionGraphSerialized): ExecutionGraph {
    const graph = new ExecutionGraph({
      id: json.id,
      planId: json.planId,
      nodes: json.nodes,
      rootNodeId: json.rootNodeId,
      status: json.status,
      createdAt: json.createdAt,
    });
    graph.updatedAt = json.updatedAt;
    return graph;
  }
}
