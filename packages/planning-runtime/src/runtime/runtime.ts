/**
 * Planning Runtime — coordinates goal-to-execution lifecycle
 *
 * The central entry point for planning and execution coordination.
 * Delegates all execution concerns to other runtimes.
 */

import { Planner } from "../planner/planner.js";
import { ExecutionGraph } from "../models/graph.js";
import { GraphExecutor, type NodeExecutor } from "../execution/executor.js";
import { Replanner, type ReplanRequest } from "../replanning/replanner.js";
import { PlanningEventBus } from "../events/bus.js";
import type { Goal, Plan } from "../models/plan.js";
import type { GraphStatus, NodeStatus, ExecutionGraphSerialized } from "../models/graph.js";
import type { PlanningEvent, EventHandler } from "../models/events.js";

export interface PlanningRuntimeOptions {
  nodeExecutor?: NodeExecutor;
  maxReplanDepth?: number;
}

export class PlanningRuntime {
  private planner: Planner;
  private executor: GraphExecutor;
  private replanner: Replanner;
  private eventBus: PlanningEventBus;
  private graphs: Map<string, ExecutionGraph> = new Map();
  private plans: Map<string, Plan> = new Map();

  constructor(options: PlanningRuntimeOptions = {}) {
    this.eventBus = new PlanningEventBus();
    this.planner = new Planner();
    this.executor = new GraphExecutor(this.eventBus, options.nodeExecutor);
    this.replanner = new Replanner(this.planner, this.eventBus);
  }

  // ── Plan Lifecycle ─────────────────────────────────

  async createPlan(goal: Goal): Promise<Plan> {
    const plan = this.planner.createPlan(goal);
    this.plans.set(plan.id, plan);
    this.eventBus.emit({
      type: "plan.created",
      plan,
      timestamp: Date.now(),
    });
    return plan;
  }

  // ── Execution Lifecycle ────────────────────────────

  async startExecution(plan: Plan): Promise<ExecutionGraph> {
    const graph = this.buildGraph(plan);
    this.graphs.set(graph.id, graph);
    graph.status = "ready";

    this.eventBus.emit({
      type: "graph.created",
      graph: graph.toJSON(),
      timestamp: Date.now(),
    });

    return this.executor.execute(graph);
  }

  private buildGraph(plan: Plan): ExecutionGraph {
    // Determine root: step with no dependencies, or first step
    const rootStep = plan.steps.find((s) => s.dependencies.length === 0) ?? plan.steps[0];

    const nodes = plan.steps.map((step) => ({
      id: step.id,
      type: step.type,
      status: "pending" as NodeStatus,
      description: step.description,
      dependencies: step.dependencies,
      dependents: plan.steps
        .filter((s) => s.dependencies.includes(step.id))
        .map((s) => s.id),
      retryCount: 0,
      maxRetries: 3,
    }));

    return new ExecutionGraph({
      id: `graph-${plan.id}-${Date.now()}`,
      planId: plan.id,
      nodes,
      rootNodeId: rootStep.id,
    });
  }

  async cancelExecution(graphId: string): Promise<void> {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph ${graphId} not found`);
    await this.executor.cancel(graph);
  }

  // ── State Queries ──────────────────────────────────

  getGraph(graphId: string): ExecutionGraph | null {
    return this.graphs.get(graphId) ?? null;
  }

  getNodeStatus(graphId: string, nodeId: string): NodeStatus | null {
    const graph = this.graphs.get(graphId);
    return graph?.getNode(nodeId)?.status ?? null;
  }

  getGraphStatus(graphId: string): GraphStatus | null {
    const graph = this.graphs.get(graphId);
    return graph?.status ?? null;
  }

  // ── Replanning ─────────────────────────────────────

  async requestReplan(request: ReplanRequest): Promise<ReturnType<Replanner["requestReplan"]>> {
    const graph = this.graphs.get(request.graphId);
    if (!graph) throw new Error(`Graph ${request.graphId} not found`);
    const result = await this.replanner.requestReplan(request, graph);
    if (result) {
      // Build new graph from replan result (with the surviving nodes)
      const newGraph = new ExecutionGraph({
        id: result.newGraphId,
        planId: graph.planId,
        nodes: graph.getAllNodes().map((n) => ({
          ...n,
          status: "pending" as const,
          retryCount: 0,
          startedAt: undefined,
          completedAt: undefined,
          result: undefined,
        })),
        rootNodeId: graph.rootNodeId,
        status: "ready",
      });
      this.graphs.set(newGraph.id, newGraph);
    }
    return result;
  }

  // ── Events ─────────────────────────────────────────

  subscribe(handler: EventHandler): () => void {
    return this.eventBus.subscribe(handler);
  }

  // ── Serialization ──────────────────────────────────

  exportGraph(graphId: string): ExecutionGraphSerialized {
    const graph = this.graphs.get(graphId);
    if (!graph) throw new Error(`Graph ${graphId} not found`);
    return graph.toJSON();
  }

  importGraph(model: ExecutionGraphSerialized): ExecutionGraph {
    const graph = ExecutionGraph.fromJSON(model);
    this.graphs.set(graph.id, graph);
    return graph;
  }
}
