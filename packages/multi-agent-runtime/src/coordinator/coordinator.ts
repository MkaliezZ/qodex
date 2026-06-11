import type { Agent, AgentReport, SubTask, TaskPlan } from "../models/agent.js";
import type { AgentRole } from "../models/agent.js";
import { TaskPlanner } from "../planner/planner.js";
import { SpecialistFactory, MOCK_OUTPUTS } from "../agents/specialists.js";
import { AgentEventBus } from "../events/bus.js";

export class Coordinator {
  readonly events: AgentEventBus;
  readonly planner: TaskPlanner;
  readonly specialists: SpecialistFactory;

  private _agents: Agent[] = [];
  private _currentPlan: TaskPlan | null = null;
  private _currentReport: AgentReport | null = null;

  constructor() {
    this.events = new AgentEventBus();
    this.planner = new TaskPlanner();
    this.specialists = new SpecialistFactory();
  }

  get agents(): Agent[] { return this._agents; }
  get currentPlan(): TaskPlan | null { return this._currentPlan; }
  get currentReport(): AgentReport | null { return this._currentReport; }

  initialize(): void {
    this._agents = this.specialists.createDefaultSet();
    for (const agent of this._agents) {
      this.events.publish("agent.created", { id: agent.id, role: agent.role, name: agent.name });
    }
  }

  /**
   * Execute a full multi-agent workflow.
   * 1. Create plan from prompt
   * 2. Assign specialists
   * 3. Collect outputs
   * 4. Generate report
   */
  async execute(prompt: string): Promise<AgentReport> {
    // 1. Plan
    this._currentPlan = this.planner.createPlan(prompt);
    this.events.publish("plan.generated", {
      planId: this._currentPlan.id,
      subTaskCount: this._currentPlan.subTasks.length,
    });

    // 2. Dispatch subtasks
    for (const subTask of this._currentPlan.subTasks) {
      this.events.publish("subtask.created", {
        id: subTask.id,
        role: subTask.agentRole,
        description: subTask.description,
      });
    }

    // 3. Execute subtasks
    const findings: string[] = [];
    const recommendations: string[] = [];
    const fileChanges: { path: string; description: string }[] = [];

    for (const subTask of this._currentPlan.subTasks) {
      // Assign agent
      const agent = this._agents.find((a) => a.role === subTask.agentRole);
      if (agent) {
        agent.status = "working";
        this.events.publish("agent.assigned", { agentId: agent.id, role: agent.role, subTaskId: subTask.id });
      }

      // Mark subtask as working
      this.planner.startSubTask(this._currentPlan, subTask.id);

      // Simulate work (in production, this would call ProviderSDK)
      await sleep(50);
      const output = MOCK_OUTPUTS[subTask.agentRole](subTask.description);

      // Complete subtask
      this.planner.completeSubTask(this._currentPlan, subTask.id, output);
      this.events.publish("subtask.completed", { id: subTask.id, role: subTask.agentRole });

      if (agent) {
        agent.status = "completed";
        this.events.publish("agent.completed", { agentId: agent.id, role: agent.role });
      }

      // Collect findings
      findings.push(`[${subTask.agentRole}] ${subTask.description}`);
      recommendations.push(`Apply ${subTask.agentRole} suggestions`);
    }

    // 4. Generate report
    this._currentReport = {
      taskId: this._currentPlan.id,
      summary: `Completed ${this._currentPlan.subTasks.length} tasks for: "${prompt.slice(0, 60)}"`,
      findings,
      recommendations,
      fileChanges,
      generatedAt: new Date().toISOString(),
    };

    this.events.publish("report.generated", {
      taskId: this._currentReport.taskId,
      findingCount: findings.length,
    });

    return this._currentReport;
  }

  /**
   * Run a specific subtask only (for individual agent execution).
   */
  async executeSubTask(subTask: SubTask): Promise<string> {
    const agent = this._agents.find((a) => a.role === subTask.agentRole);
    if (agent) { agent.status = "working"; this.events.publish("agent.assigned", { agentId: agent.id, role: agent.role, subTaskId: subTask.id }); }
    await sleep(30);
    const output = MOCK_OUTPUTS[subTask.agentRole](subTask.description);
    if (agent) { agent.status = "completed"; this.events.publish("agent.completed", { agentId: agent.id, role: agent.role }); }
    return output;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
