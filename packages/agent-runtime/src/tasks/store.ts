/**
 * Qodex Agent Runtime — In-Memory Task Store
 *
 * Holds tasks for the current runtime session.
 * No database persistence — tasks are ephemeral.
 */

import type { AgentTask } from "../types/task.js";
import { TaskStatus } from "../types/task.js";

export class InMemoryTaskStore {
  private tasks = new Map<string, AgentTask>();

  create(sessionId: string, prompt: string, modelId: string): AgentTask {
    const now = new Date().toISOString();
    const task: AgentTask = {
      id: crypto.randomUUID(),
      sessionId,
      prompt,
      modelId,
      status: TaskStatus.Idle,
      createdAt: now,
      updatedAt: now,
      output: "",
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  updateStatus(id: string, status: TaskStatus): AgentTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    task.status = status;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  appendOutput(id: string, text: string): AgentTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    task.output += text;
    task.updatedAt = new Date().toISOString();
    return task;
  }

  list(sessionId?: string): AgentTask[] {
    const all = Array.from(this.tasks.values());
    return sessionId ? all.filter((t) => t.sessionId === sessionId) : all;
  }

  remove(id: string): boolean {
    return this.tasks.delete(id);
  }

  clear(): void {
    this.tasks.clear();
  }

  get size(): number {
    return this.tasks.size;
  }
}
