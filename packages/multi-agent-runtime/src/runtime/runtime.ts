import { Coordinator } from "../coordinator/coordinator.js";
import type { AgentReport, TaskPlan, Agent, SubTask } from "../models/agent.js";
import { AgentEventBus } from "../events/bus.js";

export class MultiAgentRuntime {
  readonly coordinator: Coordinator;
  readonly events: AgentEventBus;
  private _reports: AgentReport[] = [];

  constructor() {
    this.coordinator = new Coordinator();
    this.events = this.coordinator.events;
  }

  initialize(): void {
    this.coordinator.initialize();
  }

  async execute(prompt: string): Promise<AgentReport> {
    const report = await this.coordinator.execute(prompt);
    this._reports.push(report);
    return report;
  }

  async executeSubTask(subTask: SubTask): Promise<string> {
    return this.coordinator.executeSubTask(subTask);
  }

  get reports(): AgentReport[] {
    return [...this._reports];
  }

  get latestReport(): AgentReport | null {
    return this._reports.length > 0 ? this._reports[this._reports.length - 1] : null;
  }

  get agents(): Agent[] {
    return this.coordinator.agents;
  }

  get currentPlan(): TaskPlan | null {
    return this.coordinator.currentPlan;
  }

  get currentReport(): AgentReport | null {
    return this.coordinator.currentReport;
  }
}
