import type { SubTask, TaskPlan } from "../models/agent.js";
import type { AgentRole } from "../models/agent.js";

export class TaskPlanner {
  /**
   * Decompose a user prompt into a task plan with subtasks.
   * Uses deterministic keyword matching — no AI planning.
   */
  createPlan(prompt: string): TaskPlan {
    const lowerPrompt = prompt.toLowerCase();
    const subTasks: SubTask[] = [];
    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();

    const addTask = (role: AgentRole, description: string, keywords: string[], scope: string[]) => {
      if (keywords.some((k) => lowerPrompt.includes(k))) {
        subTasks.push({
          id: crypto.randomUUID(),
          parentTaskId: taskId,
          agentId: `${role}-${subTasks.length + 1}`,
          agentRole: role,
          description,
          scope,
          status: "pending",
          createdAt: now,
        });
      }
    };

    addTask("review", "Review code architecture and patterns", ["review", "check", "audit", "inspect"], ["src/", "*.ts"]);
    addTask("review", "Check for code quality issues", ["quality", "lint", "style"], ["src/", "*.ts"]);
    addTask("refactor", "Refactor for better structure", ["refactor", "improve", "restructure", "clean"], ["src/"]);
    addTask("refactor", "Optimize performance", ["performance", "optimize", "speed"], ["src/"]);
    addTask("research", "Explore project dependencies", ["analyze", "explore", "research", "understand", "dependencies"], ["package.json", "*.md"]);
    addTask("research", "Inspect project structure", ["structure", "architecture", "layout", "organization"], ["**/*"]);
    addTask("testing", "Generate unit tests", ["test", "coverage", "testing", "spec"], ["src/", "*.test.ts"]);
    addTask("testing", "Verify code correctness", ["verify", "validate", "correctness"], ["src/"]);

    // Default: if nothing matched, assign a research review
    if (subTasks.length === 0) {
      subTasks.push({
        id: crypto.randomUUID(),
        parentTaskId: taskId,
        agentId: "research-default",
        agentRole: "research",
        description: "Explore and analyze the project",
        scope: ["**/*"],
        status: "pending",
        createdAt: now,
      });
    }

    return { id: taskId, prompt, subTasks, createdAt: now };
  }

  /**
   * Mark a subtask as working.
   */
  startSubTask(plan: TaskPlan, subTaskId: string): TaskPlan {
    const st = plan.subTasks.find((s) => s.id === subTaskId);
    if (st) st.status = "working";
    return plan;
  }

  /**
   * Mark a subtask as completed with output.
   */
  completeSubTask(plan: TaskPlan, subTaskId: string, output: string): TaskPlan {
    const st = plan.subTasks.find((s) => s.id === subTaskId);
    if (st) { st.status = "completed"; st.output = output; }
    return plan;
  }

  /**
   * Mark a subtask as failed.
   */
  failSubTask(plan: TaskPlan, subTaskId: string, error: string): TaskPlan {
    const st = plan.subTasks.find((s) => s.id === subTaskId);
    if (st) { st.status = "failed"; st.output = error; }
    return plan;
  }

  /**
   * Check if all subtasks are complete.
   */
  isComplete(plan: TaskPlan): boolean {
    return plan.subTasks.every((s) => s.status === "completed" || s.status === "failed");
  }

  /**
   * Build scope context string for a subtask.
   */
  buildScopeContext(subTask: SubTask): string {
    return `Scope: ${subTask.scope.join(", ")}\nTask: ${subTask.description}`;
  }
}
