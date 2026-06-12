import type { ExecutionNode } from "../models/graph.js";
import type { GraphLifecycle } from "../lifecycle/lifecycle.js";

export class GraphTraverser {
  topologicalSort(graph: GraphLifecycle): string[] {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    for (const n of graph.getAllNodes()) inDegree.set(n.id, n.dependencies.length);
    for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

    while (queue.length) {
      const current = queue.shift()!;
      result.push(current);
      const node = graph.getNode(current);
      if (node) {
        for (const depId of node.dependents) {
          const deg = inDegree.get(depId)! - 1;
          inDegree.set(depId, deg);
          if (deg === 0) queue.push(depId);
        }
      }
    }

    return result.length === inDegree.size ? result : result;
  }

  dependencyWalk(graph: GraphLifecycle, startNodeId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = graph.getNode(id);
      if (node) {
        for (const depId of node.dependencies) walk(depId);
        result.push(id);
      }
    };
    walk(startNodeId);
    return result;
  }

  reverseDependencyWalk(graph: GraphLifecycle, startNodeId: string): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const walk = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      result.push(id);
      const node = graph.getNode(id);
      if (node) {
        for (const depId of node.dependents) walk(depId);
      }
    };
    walk(startNodeId);
    return result;
  }

  getAllPaths(graph: GraphLifecycle): string[][] {
    const roots = graph.getAllNodes().filter((n) => n.dependencies.length === 0);
    const paths: string[][] = [];
    for (const root of roots) {
      this.findPaths(graph, root.id, new Set<string>(), [], paths);
    }
    return paths;
  }

  private findPaths(
    graph: GraphLifecycle, currentId: string,
    visited: Set<string>, currentPath: string[], result: string[][],
  ): void {
    currentPath.push(currentId);
    visited.add(currentId);
    const node = graph.getNode(currentId);
    if (!node || node.dependents.length === 0) {
      result.push([...currentPath]);
    } else {
      for (const depId of node.dependents) {
        if (!visited.has(depId)) {
          this.findPaths(graph, depId, new Set(visited), [...currentPath], result);
        }
      }
    }
  }
}
