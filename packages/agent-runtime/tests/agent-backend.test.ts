import { describe, expect, it } from "vitest";
import {
  AgentBackendUnavailableError,
  AgentRuntime,
  CodeWhaleBackend,
  DeepSeekHarnessBackend,
  MockAgentBackend,
  type AgentBackendEvent,
  type AgentBackendToolRequestEvent,
} from "../src/index.js";

describe("AgentBackend boundary", () => {
  it("lets AgentRuntime exchange deterministic events and tool results with MockAgentBackend", async () => {
    const backend = new MockAgentBackend({
      turns: [[
        { type: "message", content: "Inspecting the project." },
        {
          type: "tool_request",
          callId: "call-1",
          toolName: "read_file",
          arguments: { path: "src/index.ts" },
        },
      ]],
    });
    const runtime = new AgentRuntime({ backend });
    const session = await runtime.startBackendSession({
      sessionId: "kerniq-session-1",
      workspaceIdentity: "workspace-1",
    });
    const events: AgentBackendEvent[] = [];
    const stream = await runtime.streamBackendEvents(session.sessionId, undefined, (event) => {
      events.push(event);
    });

    const turn = await runtime.sendBackendMessage(session.sessionId, {
      role: "user",
      content: "Read the entry point.",
    });

    const requestEvent = events.find(
      (event): event is AgentBackendToolRequestEvent => event.type === "tool_request",
    );
    expect(turn).toEqual({ sessionId: session.sessionId, turnId: "mock-turn-1" });
    expect(events.map((event) => event.type)).toEqual([
      "session_started",
      "message",
      "tool_request",
    ]);
    expect(requestEvent?.request).toMatchObject({
      callId: "call-1",
      toolName: "read_file",
      arguments: { path: "src/index.ts" },
    });
    expect(backend.submittedToolResults).toHaveLength(0);

    const request = requestEvent!.request;
    await runtime.submitBackendToolResult(request, {
      sessionId: request.sessionId,
      turnId: request.turnId,
      callId: request.callId,
      success: true,
      content: { text: "export {};" },
    });

    expect(backend.submittedToolResults).toHaveLength(1);
    expect(events.map((event) => event.type)).toEqual([
      "session_started",
      "message",
      "tool_request",
      "tool_result_submitted",
      "turn_completed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);

    await stream.close();
    await runtime.shutdownBackend();
    await expect(runtime.sendBackendMessage(session.sessionId, {
      role: "user",
      content: "Must fail after shutdown.",
    })).rejects.toThrow("shut down");
  });

  it("keeps tool requests inert until KerniQ submits a governed result", async () => {
    const backend = new MockAgentBackend({
      turns: [[{
        type: "tool_request",
        callId: "command-1",
        toolName: "run_project_command",
        arguments: { commandId: "package-script:test" },
      }]],
    });
    const runtime = new AgentRuntime({ backend });
    const session = await runtime.startBackendSession({});
    const events: AgentBackendEvent[] = [];
    await runtime.streamBackendEvents(session.sessionId, undefined, (event) => events.push(event));

    await runtime.sendBackendMessage(session.sessionId, { role: "user", content: "Run tests." });

    expect(events.at(-1)?.type).toBe("tool_request");
    expect(backend.submittedToolResults).toHaveLength(0);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(backend))).not.toEqual(
      expect.arrayContaining(["approve", "execute", "evaluatePolicy", "writeFile"]),
    );
  });

  it.each([
    ["CodeWhale", new CodeWhaleBackend()],
    ["DeepSeek Harness", new DeepSeekHarnessBackend()],
  ])("keeps the %s placeholder fail-closed", async (_name, backend) => {
    const runtime = new AgentRuntime({ backend });
    await expect(runtime.startBackendSession({})).rejects.toBeInstanceOf(
      AgentBackendUnavailableError,
    );
  });

  it("requires an explicitly configured backend for backend operations", async () => {
    const runtime = new AgentRuntime();
    await expect(runtime.startBackendSession({})).rejects.toThrow(
      "No agent backend is configured.",
    );
    await expect(runtime.shutdownBackend()).resolves.toBeUndefined();
  });
});
