import type { AgentRole, Agent, AgentStatus } from "../models/agent.js";

export class SpecialistFactory {
  create(role: AgentRole, name: string): Agent {
    return { id: crypto.randomUUID(), role, name, status: "idle", createdAt: new Date().toISOString() };
  }

  createDefaultSet(): Agent[] {
    return [
      this.create("review", "Code Reviewer"),
      this.create("refactor", "Refactor Specialist"),
      this.create("research", "Research Analyst"),
      this.create("testing", "Testing Engineer"),
    ];
  }
}

// Mock specialist outputs for development
export const MOCK_OUTPUTS: Record<AgentRole, (description: string) => string> = {
  review: (desc) => `[Review Complete] ${desc}\n\nFindings:\n- Code follows established patterns\n- No critical issues detected\n- Minor style inconsistencies in 2 files`,
  refactor: (desc) => `[Refactor Complete] ${desc}\n\nChanges:\n- Extracted shared logic into utility module\n- Simplified component structure\n- Reduced duplication by 30%`,
  research: (desc) => `[Research Complete] ${desc}\n\nAnalysis:\n- 3 main entry points identified\n- Core logic in src/core/\n- Dependencies: React 18, Express 4, SQLite 3`,
  testing: (desc) => `[Testing Complete] ${desc}\n\nCoverage:\n- Unit tests for core modules: 85%\n- Integration tests: 60%\n- 2 edge cases identified missing coverage`,
  coordinator: (desc) => `[Coordinator] ${desc}`,
};
