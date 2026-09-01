import {
  DeepSeekHarnessBackend,
  MockAgentBackend,
  type MockAgentBackendEventTemplate,
} from "../src/index.js";
import {
  runAgentBackendConformanceTests,
  type AgentBackendConformanceScenario,
} from "./conformance/agent-backend-conformance.js";
import { MockDeepSeekHarnessTransport } from "./support/mock-dsh-transport.js";

runAgentBackendConformanceTests("MockAgentBackend", (scenario) => {
  const backend = new MockAgentBackend({ turns: [mockScenario(scenario)] });
  return {
    backend,
    sentMessageCount: () => backend.sentMessages.length,
    submittedToolResultCount: () => backend.submittedToolResults.length,
    toolExecutionCount: () => 0,
  };
});

runAgentBackendConformanceTests("DeepSeekHarnessBackend", (scenario) => {
  let settle = () => {};
  const transport = new MockDeepSeekHarnessTransport({
    onMessage: (activeTransport, turn) => {
      if (scenario === "lifecycle") {
        activeTransport.emit(turn.sessionId, {
          type: "model.output",
          turnId: turn.turnId,
          content: "Conformance response.",
        });
        settle = () => {
          activeTransport.emit(turn.sessionId, {
            type: "turn.completed",
            turnId: turn.turnId,
          });
        };
        return;
      }
      if (scenario === "error") {
        activeTransport.emit(turn.sessionId, {
          type: "runtime.error",
          turnId: turn.turnId,
          message: "conformance backend failure",
        });
        return;
      }
      activeTransport.emit(turn.sessionId, {
        type: "tool_call.requested",
        turnId: turn.turnId,
        callId: "conformance-call-1",
        toolName: "run_project_command",
        arguments: { commandId: "package-script:test" },
      });
      if (scenario === "cancellation") {
        settle = () => {
          activeTransport.emit(turn.sessionId, {
            type: "turn.cancelled",
            turnId: turn.turnId,
            reason: "conformance_cancelled",
          });
        };
      }
    },
  });
  const backend = new DeepSeekHarnessBackend({ transport });
  return {
    backend,
    settle: () => settle(),
    sentMessageCount: () => transport.sentMessages.length,
    submittedToolResultCount: () => transport.submittedResults.length,
    toolExecutionCount: () => transport.toolExecutionCount,
  };
});

function mockScenario(
  scenario: AgentBackendConformanceScenario,
): readonly MockAgentBackendEventTemplate[] {
  if (scenario === "lifecycle") {
    return [
      { type: "message", content: "Conformance response." },
      { type: "turn_completed" },
    ];
  }
  if (scenario === "error") {
    return [{ type: "error", message: "conformance backend failure" }];
  }
  const request: MockAgentBackendEventTemplate = {
    type: "tool_request",
    callId: "conformance-call-1",
    toolName: "run_project_command",
    arguments: { commandId: "package-script:test" },
  };
  if (scenario === "cancellation") {
    return [request, { type: "turn_cancelled", reason: "conformance_cancelled" }];
  }
  return [request];
}
