export type AgentRole = "coordinator" | "review" | "refactor" | "research" | "testing";
export type AgentStatus = "idle" | "working" | "completed" | "failed";

export interface Agent {
  id: string;
  role: AgentRole;
  name: string;
  status: AgentStatus;
  createdAt: string;
}

export interface SubTask {
  id: string;
  parentTaskId: string;
  agentId: string;
  agentRole: AgentRole;
  description: string;
  scope: string[];
  status: "pending" | "working" | "completed" | "failed";
  output?: string;
  createdAt: string;
}

export interface TaskPlan {
  id: string;
  prompt: string;
  subTasks: SubTask[];
  createdAt: string;
}

export interface AgentReport {
  taskId: string;
  summary: string;
  findings: string[];
  recommendations: string[];
  fileChanges: { path: string; description: string }[];
  generatedAt: string;
}

export interface AgentEvent {
  type: "agent.created" | "agent.assigned" | "agent.completed" |
        "subtask.created" | "subtask.completed" |
        "plan.generated" | "report.generated";
  payload: Record<string, unknown>;
  timestamp: string;
}
