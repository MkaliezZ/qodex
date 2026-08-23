import { describe, expect, it } from "vitest";
import {
  AgentRuntime,
  type AgentBackend,
  type AgentBackendEvent,
  type AgentBackendToolRequest,
  type AgentBackendToolRequestEvent,
  type AgentBackendToolResult,
} from "../../src/index.js";

export type AgentBackendConformanceScenario =
  | "lifecycle"
  | "tool_request"
  | "cancellation"
  | "error";

export interface AgentBackendConformanceFixture {
  readonly backend: AgentBackend;
  readonly settle?: () => void | Promise<void>;
  readonly sentMessageCount: () => number;
  readonly submittedToolResultCount: () => number;
  readonly toolExecutionCount: () => number;
}

export type AgentBackendConformanceFactory = (
  scenario: AgentBackendConformanceScenario,
) => AgentBackendConformanceFixture | Promise<AgentBackendConformanceFixture>;

export function runAgentBackendConformanceTests(
  backendName: string,
  factory: AgentBackendConformanceFactory,
): void {
  describe(`${backendName} AgentBackend conformance`, () => {
    it("supports the session, message, stream, and shutdown lifecycle", async () => {
      const fixture = await factory("lifecycle");
      const runtime = new AgentRuntime({ backend: fixture.backend });
      const session = await runtime.startBackendSession({
        sessionId: `${fixture.backend.id}-lifecycle-session`,
        workspaceIdentity: "conformance-workspace",
      });
      const events: AgentBackendEvent[] = [];
      const stream = await runtime.streamBackendEvents(session.sessionId, undefined, (event) => {
        events.push(event);
      });

      const turn = await runtime.sendBackendMessage(session.sessionId, {
        role: "user",
        content: "Conformance lifecycle message.",
      });
      await fixture.settle?.();

      expect(session).toEqual({
        sessionId: `${fixture.backend.id}-lifecycle-session`,
        workspaceIdentity: "conformance-workspace",
      });
      expect(turn.sessionId).toBe(session.sessionId);
      expect(turn.turnId).toEqual(expect.any(String));
      expect(fixture.sentMessageCount()).toBe(1);
      expect(events[0]).toMatchObject({
        type: "session_started",
        sessionId: session.sessionId,
      });
      expect(events.at(-1)?.type).toBe("turn_completed");

      await stream.close();
      await expect(runtime.shutdownBackend()).resolves.toBeUndefined();
      await expect(runtime.shutdownBackend()).resolves.toBeUndefined();
      await expect(runtime.sendBackendMessage(session.sessionId, {
        role: "user",
        content: "Must fail after shutdown.",
      })).rejects.toThrow();
    });

    it("preserves session, turn, and call identity for inert tool requests", async () => {
      const context = await startScenario(factory, "tool_request");

      const requestEvent = requireToolRequest(context.events);
      expect(requestEvent.sessionId).toBe(context.sessionId);
      expect(requestEvent.turnId).toBe(context.turnId);
      expect(requestEvent.request).toMatchObject({
        sessionId: context.sessionId,
        turnId: context.turnId,
        callId: "conformance-call-1",
        toolName: "run_project_command",
      });
      expect(context.fixture.submittedToolResultCount()).toBe(0);
      expect(context.fixture.toolExecutionCount()).toBe(0);

      await context.stream.close();
      await context.runtime.shutdownBackend();
    });

    it("rejects mismatched session, turn, call, and duplicate tool results", async () => {
      const context = await startScenario(factory, "tool_request");
      const request = requireToolRequest(context.events).request;

      await expect(context.runtime.submitBackendToolResult(request, resultFor(request, {
        sessionId: `${request.sessionId}-wrong`,
      }))).rejects.toThrow();
      await expect(context.runtime.submitBackendToolResult(request, resultFor(request, {
        turnId: `${request.turnId}-wrong`,
      }))).rejects.toThrow();
      await expect(context.runtime.submitBackendToolResult(request, resultFor(request, {
        callId: `${request.callId}-wrong`,
      }))).rejects.toThrow();

      const accepted = resultFor(request);
      await expect(context.runtime.submitBackendToolResult(request, accepted)).resolves.toBeUndefined();
      await expect(context.runtime.submitBackendToolResult(request, accepted)).rejects.toThrow();
      expect(context.fixture.submittedToolResultCount()).toBe(1);
      expect(context.fixture.toolExecutionCount()).toBe(0);

      await context.stream.close();
      await context.runtime.shutdownBackend();
    });

    it("propagates cancellation without replay or late execution", async () => {
      const context = await startScenario(factory, "cancellation");
      const request = requireToolRequest(context.events).request;
      const cancellation = context.events.find((event) => event.type === "turn_cancelled");

      expect(cancellation).toMatchObject({
        type: "turn_cancelled",
        sessionId: context.sessionId,
        turnId: context.turnId,
      });
      expect(context.fixture.toolExecutionCount()).toBe(0);
      await expect(context.runtime.submitBackendToolResult(request, resultFor(request))).rejects.toThrow();

      await context.stream.close();
      const replayed: AgentBackendEvent[] = [];
      const resumed = await context.runtime.streamBackendEvents(
        context.sessionId,
        cancellation!.sequence,
        (event) => replayed.push(event),
      );
      expect(replayed).toEqual([]);
      expect(context.fixture.submittedToolResultCount()).toBe(0);

      await resumed.close();
      await expect(context.runtime.shutdownBackend()).resolves.toBeUndefined();
    });

    it("surfaces backend errors through AgentRuntime without silent completion", async () => {
      const context = await startScenario(factory, "error");

      expect(context.events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "error",
          sessionId: context.sessionId,
          turnId: context.turnId,
          message: "conformance backend failure",
        }),
      ]));
      expect(context.events.some((event) => event.type === "turn_completed")).toBe(false);

      await context.stream.close();
      await context.runtime.shutdownBackend();
    });

    it("keeps policy, approval, AgentFuse, and tool execution outside the backend", async () => {
      const context = await startScenario(factory, "tool_request");
      const methods = collectPrototypeMethods(context.fixture.backend);

      expect(methods).not.toEqual(expect.arrayContaining([
        "approve",
        "approveAction",
        "callAgentFuse",
        "evaluatePolicy",
        "execute",
        "executeTool",
      ]));
      expect(context.fixture.submittedToolResultCount()).toBe(0);
      expect(context.fixture.toolExecutionCount()).toBe(0);

      await context.stream.close();
      await context.runtime.shutdownBackend();
    });
  });
}

async function startScenario(
  factory: AgentBackendConformanceFactory,
  scenario: AgentBackendConformanceScenario,
) {
  const fixture = await factory(scenario);
  const runtime = new AgentRuntime({ backend: fixture.backend });
  const session = await runtime.startBackendSession({
    sessionId: `${fixture.backend.id}-${scenario}-session`,
  });
  const events: AgentBackendEvent[] = [];
  const stream = await runtime.streamBackendEvents(session.sessionId, undefined, (event) => {
    events.push(event);
  });
  const turn = await runtime.sendBackendMessage(session.sessionId, {
    role: "user",
    content: `Run ${scenario} conformance scenario.`,
  });
  await fixture.settle?.();
  return {
    events,
    fixture,
    runtime,
    sessionId: session.sessionId,
    stream,
    turnId: turn.turnId,
  };
}

function requireToolRequest(events: readonly AgentBackendEvent[]): AgentBackendToolRequestEvent {
  const event = events.find(
    (candidate): candidate is AgentBackendToolRequestEvent => candidate.type === "tool_request",
  );
  if (!event) throw new Error("Conformance scenario did not emit a tool request.");
  return event;
}

function resultFor(
  request: AgentBackendToolRequest,
  overrides: Partial<AgentBackendToolResult> = {},
): AgentBackendToolResult {
  return {
    sessionId: request.sessionId,
    turnId: request.turnId,
    callId: request.callId,
    success: true,
    content: { stdout: "governed result" },
    ...overrides,
  };
}

function collectPrototypeMethods(value: object): string[] {
  const methods = new Set<string>();
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) methods.add(name);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return [...methods];
}
