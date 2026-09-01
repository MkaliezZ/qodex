import { describe, expect, it, vi } from "vitest";
import {
  AgentRuntime,
  DeepSeekHarnessBackend,
  DeepSeekHarnessProtocolError,
  type AgentBackendEvent,
  type AgentBackendToolRequestEvent,
} from "../src/index.js";
import {
  MockDeepSeekHarnessTransport,
  type MockDeepSeekHarnessTransportOptions,
} from "./support/mock-dsh-transport.js";

describe("DeepSeekHarnessBackend", () => {
  it("maps a paused DSH tool request into AgentRuntime without executing it", async () => {
    const fixture = await startFixture({
      onMessage: (transport, turn) => {
        transport.emit(turn.sessionId, {
          type: "tool_call.requested",
          turnId: turn.turnId,
          callId: "call-read",
          toolName: "read_file",
          arguments: { path: "src/index.ts" },
        });
      },
    });

    await fixture.runtime.sendBackendMessage(fixture.sessionId, {
      role: "user",
      content: "Inspect the entry point.",
    });

    const request = toolRequest(fixture.events);
    expect(request.request).toEqual({
      sessionId: fixture.sessionId,
      turnId: "dsh-turn-1",
      callId: "call-read",
      toolName: "read_file",
      arguments: { path: "src/index.ts" },
    });
    expect(fixture.transport.submittedResults).toHaveLength(0);
    expect(fixture.transport.toolExecutionCount).toBe(0);
  });

  it("returns a KerniQ denial to DSH as a rejected tool result with no execution", async () => {
    const fixture = await toolFixture("run_project_command");
    const request = toolRequest(fixture.events).request;

    await fixture.runtime.submitBackendToolResult(request, {
      sessionId: request.sessionId,
      turnId: request.turnId,
      callId: request.callId,
      success: false,
      content: {
        error: {
          code: "project_command_denied",
          message: "KerniQ denied this request.",
        },
      },
    });

    expect(fixture.transport.submittedResults).toEqual([
      expect.objectContaining({ success: false, callId: "call-1" }),
    ]);
    expect(fixture.events.at(-1)).toMatchObject({
      type: "tool_result_submitted",
      result: { success: false, callId: "call-1" },
    });
    expect(fixture.transport.toolExecutionCount).toBe(0);
  });

  it("waits for the host-owned decision path before returning an allowed result", async () => {
    const hostDecisionAuthority = vi.fn(() => "allow" as const);
    const fixture = await toolFixture("run_project_command", {
      onToolResult: (transport, result) => {
        transport.emit(result.sessionId, {
          type: "tool_call.resolved",
          turnId: result.turnId,
          callId: result.callId,
          success: result.success,
          content: result.content,
        });
        transport.emit(result.sessionId, {
          type: "model.output",
          turnId: result.turnId,
          content: "The governed command result was observed.",
        });
        transport.emit(result.sessionId, {
          type: "turn.completed",
          turnId: result.turnId,
        });
      },
    });
    const request = toolRequest(fixture.events).request;

    expect(fixture.transport.submittedResults).toHaveLength(0);
    expect(hostDecisionAuthority(request)).toBe("allow");
    await fixture.runtime.submitBackendToolResult(request, {
      sessionId: request.sessionId,
      turnId: request.turnId,
      callId: request.callId,
      success: true,
      content: { exitCode: 0, stdout: "tests passed" },
    });

    expect(hostDecisionAuthority).toHaveBeenCalledOnce();
    expect(fixture.events.map((event) => event.type)).toEqual([
      "session_started",
      "tool_request",
      "tool_result_submitted",
      "message",
      "turn_completed",
    ]);
    expect(fixture.events[3]).toMatchObject({
      type: "message",
      message: { role: "model", content: "The governed command result was observed." },
    });
    expect(fixture.transport.toolExecutionCount).toBe(0);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(fixture.backend))).not.toEqual(
      expect.arrayContaining(["approve", "execute", "evaluatePolicy", "callAgentFuse"]),
    );
  });

  it("maps model output, completion, and runtime errors in transport order", async () => {
    const fixture = await startFixture({
      onMessage: (transport, turn) => {
        transport.emit(turn.sessionId, {
          type: "model.output",
          turnId: turn.turnId,
          content: "First output",
        });
        transport.emit(turn.sessionId, {
          type: "runtime.error",
          turnId: turn.turnId,
          message: "model stream interrupted",
        });
      },
    });

    await fixture.runtime.sendBackendMessage(fixture.sessionId, {
      role: "user",
      content: "Stream a response.",
    });

    expect(fixture.events.map((event) => [event.sequence, event.type])).toEqual([
      [1, "session_started"],
      [2, "message"],
      [3, "error"],
    ]);
  });

  it("cancels once, rejects late results, and suppresses replayed events", async () => {
    const fixture = await toolFixture("run_project_command");
    const request = toolRequest(fixture.events).request;

    await fixture.backend.cancelTurn(request.sessionId, request.turnId);
    await fixture.backend.cancelTurn(request.sessionId, request.turnId);

    expect(fixture.transport.cancelledTurns).toEqual([
      { sessionId: request.sessionId, turnId: request.turnId },
    ]);
    expect(fixture.events.at(-1)).toMatchObject({
      type: "turn_cancelled",
      turnId: request.turnId,
    });
    await expect(fixture.runtime.submitBackendToolResult(request, {
      sessionId: request.sessionId,
      turnId: request.turnId,
      callId: request.callId,
      success: true,
      content: { exitCode: 0 },
    })).rejects.toThrow("does not match a pending request");

    await fixture.stream.close();
    const replayed: AgentBackendEvent[] = [];
    await fixture.runtime.streamBackendEvents(fixture.sessionId, 0, (event) => {
      replayed.push(event);
    });
    expect(replayed).toEqual([]);
    expect(() => fixture.transport.emit(fixture.sessionId, {
      type: "tool_call.requested",
      turnId: request.turnId,
      callId: request.callId,
      toolName: request.toolName,
      arguments: request.arguments,
    })).toThrow("terminal turn");
    expect(fixture.transport.submittedResults).toHaveLength(0);
  });

  it("fails closed on unacknowledged tool resolution", async () => {
    const fixture = await toolFixture("read_file");
    const request = toolRequest(fixture.events).request;

    expect(() => fixture.transport.emit(fixture.sessionId, {
      type: "tool_call.resolved",
      turnId: request.turnId,
      callId: request.callId,
      success: true,
      content: { text: "not submitted by KerniQ" },
    })).toThrow(DeepSeekHarnessProtocolError);
  });

  it("fails closed on an event sequence gap", async () => {
    const fixture = await startFixture();

    expect(() => fixture.transport.emitAtSequence(fixture.sessionId, 3, {
      type: "model.output",
      turnId: "dsh-turn-gap",
      content: "must not be reordered",
    })).toThrow("sequence contains a gap");
    expect(fixture.events.map((event) => event.type)).toEqual(["session_started"]);
  });
});

async function startFixture(options: MockDeepSeekHarnessTransportOptions = {}) {
  const transport = new MockDeepSeekHarnessTransport(options);
  const backend = new DeepSeekHarnessBackend({ transport });
  const runtime = new AgentRuntime({ backend });
  const session = await runtime.startBackendSession({
    sessionId: "kerniq-dsh-session",
    workspaceIdentity: "workspace-fixture",
  });
  const events: AgentBackendEvent[] = [];
  const stream = await runtime.streamBackendEvents(session.sessionId, undefined, (event) => {
    events.push(event);
  });
  return {
    backend,
    events,
    runtime,
    sessionId: session.sessionId,
    stream,
    transport,
  };
}

async function toolFixture(
  toolName: string,
  options: Omit<MockDeepSeekHarnessTransportOptions, "onMessage"> = {},
) {
  const fixture = await startFixture({
    ...options,
    onMessage: (transport, turn) => {
      transport.emit(turn.sessionId, {
        type: "tool_call.requested",
        turnId: turn.turnId,
        callId: "call-1",
        toolName,
        arguments: toolName === "run_project_command"
          ? { commandId: "package-script:test" }
          : { path: "src/index.ts" },
      });
    },
  });
  await fixture.runtime.sendBackendMessage(fixture.sessionId, {
    role: "user",
    content: `Request ${toolName}.`,
  });
  return fixture;
}

function toolRequest(events: readonly AgentBackendEvent[]): AgentBackendToolRequestEvent {
  const event = events.find(
    (candidate): candidate is AgentBackendToolRequestEvent => candidate.type === "tool_request",
  );
  if (!event) throw new Error("Expected a tool request event.");
  return event;
}
