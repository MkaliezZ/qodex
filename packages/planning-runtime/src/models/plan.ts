/**
 * Plan model — goal decomposition and step definitions
 */

export interface Goal {
  id: string;
  description: string;
  constraints?: string[];
  context?: {
    selectedFiles?: string[];
    projectName?: string;
  };
  timestamp: number;
}

export type NodeType =
  | "goal"
  | "plan"
  | "task"
  | "review"
  | "diff"
  | "checkpoint"
  | "approval"
  | "tool"
  | "report";

export type AgentRole = "review" | "refactor" | "research" | "testing";

export interface PlanStep {
  id: string;
  order: number;
  type: NodeType;
  description: string;
  dependencies: string[];
  agentRole?: AgentRole;
  estimatedComplexity?: number;
}

export interface Plan {
  id: string;
  goalId: string;
  steps: PlanStep[];
  createdAt: number;
}

export interface GoalDecomposition {
  goal: Goal;
  subgoals: string[];
  leafTasks: PlanStep[];
}
