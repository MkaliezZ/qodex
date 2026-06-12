/**
 * Planner — deterministic goal-to-plan decomposition
 *
 * Pure deterministic planner. No LLM. No provider calls.
 */

import type { Goal, Plan, PlanStep, NodeType, AgentRole, GoalDecomposition } from "../models/plan.js";

const DECOMPOSITION_RULES: Array<{
  keywords: string[];
  steps: Array<{ type: NodeType; description: string; agentRole?: AgentRole }>;
}> = [
  {
    keywords: ["refactor", "restructure", "reorganize", "clean up"],
    steps: [
      { type: "task", description: "Analyze current structure", agentRole: "research" },
      { type: "task", description: "Plan refactoring approach", agentRole: "review" },
      { type: "diff", description: "Generate refactoring patch" },
      { type: "review", description: "Validate refactoring correctness", agentRole: "review" },
      { type: "approval", description: "Confirm refactoring changes" },
      { type: "checkpoint", description: "Create checkpoint after refactoring" },
    ],
  },
  {
    keywords: ["bug", "fix", "issue", "error", "broken"],
    steps: [
      { type: "task", description: "Investigate the issue", agentRole: "research" },
      { type: "diff", description: "Produce fix patch" },
      { type: "review", description: "Review the fix", agentRole: "review" },
      { type: "task", description: "Verify fix with tests", agentRole: "testing" },
      { type: "approval", description: "Confirm the fix" },
    ],
  },
  {
    keywords: ["feature", "implement", "add", "create", "build"],
    steps: [
      { type: "task", description: "Analyze requirements", agentRole: "research" },
      { type: "task", description: "Design the implementation", agentRole: "review" },
      { type: "diff", description: "Generate implementation patch" },
      { type: "review", description: "Code review implementation", agentRole: "review" },
      { type: "task", description: "Run tests on the change", agentRole: "testing" },
      { type: "approval", description: "Confirm the implementation" },
      { type: "checkpoint", description: "Create checkpoint post-implementation" },
    ],
  },
  {
    keywords: ["review", "audit", "check", "inspect", "scan"],
    steps: [
      { type: "task", description: "Survey the codebase", agentRole: "research" },
      { type: "review", description: "Produce review findings", agentRole: "review" },
      { type: "task", description: "Generate recommendations", agentRole: "refactor" },
      { type: "report", description: "Aggregate review report" },
    ],
  },
  {
    keywords: ["test", "coverage", "spec"],
    steps: [
      { type: "task", description: "Identify test gaps", agentRole: "research" },
      { type: "task", description: "Write test cases", agentRole: "testing" },
      { type: "diff", description: "Generate test implementation" },
      { type: "review", description: "Verify test correctness", agentRole: "review" },
      { type: "approval", description: "Confirm test additions" },
    ],
  },
];

const DEFAULT_STEPS: Array<{
  type: NodeType;
  description: string;
  agentRole?: AgentRole;
}> = [
  { type: "task", description: "Analyze the request", agentRole: "research" },
  { type: "task", description: "Implement the solution", agentRole: "refactor" },
  { type: "diff", description: "Generate changes" },
  { type: "review", description: "Review changes", agentRole: "review" },
  { type: "approval", description: "Confirm the work" },
];

export class Planner {
  private idCounter = 0;

  decompose(goal: Goal): GoalDecomposition {
    const lowerDesc = goal.description.toLowerCase();
    const match = DECOMPOSITION_RULES.find((rule) =>
      rule.keywords.some((kw) => lowerDesc.includes(kw)),
    );

    const template = match ? match.steps : DEFAULT_STEPS;

    const subgoals = template.map((s) => s.description);

    const leafTasks: PlanStep[] = template.map((s, i) => ({
      id: `step-${++this.idCounter}`,
      order: i,
      type: s.type,
      description: s.description,
      dependencies: i > 0 ? [`step-${this.idCounter - 1}`] : [],
      agentRole: s.agentRole,
      estimatedComplexity: this.estimateComplexity(s.description),
    }));

    return { goal, subgoals, leafTasks };
  }

  createPlan(goal: Goal): Plan {
    const { leafTasks } = this.decompose(goal);
    return {
      id: `plan-${++this.idCounter}`,
      goalId: goal.id,
      steps: leafTasks,
      createdAt: Date.now(),
    };
  }

  private estimateComplexity(description: string): number {
    const complex = ["implement", "refactor", "restructure", "migrate", "rewrite"];
    const moderate = ["fix", "add", "create", "review"];
    const simple = ["check", "verify", "confirm", "inspect"];

    const lower = description.toLowerCase();
    if (complex.some((k) => lower.includes(k))) return 4;
    if (moderate.some((k) => lower.includes(k))) return 2;
    if (simple.some((k) => lower.includes(k))) return 1;
    return 3;
  }
}
