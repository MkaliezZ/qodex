import { describe, expect, it, vi } from "vitest";
import {
  AgentEngineError,
  CODEWHALE_EXECUTABLE_SHA256,
  CODEWHALE_MANAGED_PROFILE,
  CODEWHALE_PINNED_IDENTITY,
  CODEWHALE_SOURCE_ARCHIVE_SHA256,
  CODEWHALE_SOURCE_COMMIT,
  CODEWHALE_SOURCE_REPOSITORY,
  CodeWhaleAgentEngineAdapter,
  DynamicToolSettlementGuard,
  EventCursorGate,
  KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL,
  ManagedCodeWhaleSupervisor,
  assessToolSurface,
  assertManagedProfile,
  assertPinnedIdentity,
  buildManagedEnvironment,
  managedProfileDigest,
  redactRuntimeToken,
  validateProposalRequest,
  verifyArchiveDigest,
  verifyExecutableDigest,
  type AgentEngineSubscription,
  type CodeWhaleRuntimeClient,
  type DynamicToolRequest,
  type ManagedChildProcess,
  type ManagedProcessLauncher,
  type ManagedProcessSpec,
  type RuntimeLifecycleProbe,
  type SupervisorStartInput,
  type ToolSurfaceAssessment,
} from "../src/index.js";

const TOKEN = `cwrt_${"A".repeat(43)}`;
const EXECUTABLE_BYTES = new TextEncoder().encode("managed-codewhale-fixture");

describe("pinned identity", () => {
  it("freezes the exact reviewed CodeWhale source identity", () => {
    expect(CODEWHALE_SOURCE_REPOSITORY).toBe("https://github.com/Hmbown/CodeWhale");
    expect(CODEWHALE_SOURCE_COMMIT).toBe("4f2c97b0d75c039a9b6069ebcf210cc499583376");
    expect(CODEWHALE_SOURCE_ARCHIVE_SHA256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(CODEWHALE_EXECUTABLE_SHA256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(() => assertPinnedIdentity(CODEWHALE_PINNED_IDENTITY)).not.toThrow();
  });

  it("rejects a source revision mismatch", () => {
    expect(() => assertPinnedIdentity({
      ...CODEWHALE_PINNED_IDENTITY,
      sourceCommit: "0".repeat(40),
    })).toThrowError(AgentEngineError);
  });

  it("rejects archive and executable digest mismatches", async () => {
    await expect(verifyArchiveDigest(new TextEncoder().encode("wrong archive")))
      .rejects.toMatchObject({ code: "digest_mismatch" });
    await expect(verifyExecutableDigest(new TextEncoder().encode("wrong executable")))
      .rejects.toMatchObject({ code: "digest_mismatch" });
  });
});

describe("managed profile and environment", () => {
  it("keeps the required posture fail closed", async () => {
    expect(CODEWHALE_MANAGED_PROFILE).toMatchObject({
      mode: "plan",
      allowShell: false,
      approvalPolicy: "never",
      sandboxMode: "read-only",
      autoApprove: false,
      trustMode: false,
      projectConfig: "disabled",
      mcp: "disabled",
      plugins: "disabled",
      subagents: "disabled",
      updateChecks: "disabled",
      memoryWrites: "disabled",
    });
    expect(await managedProfileDigest()).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(() => assertManagedProfile(CODEWHALE_MANAGED_PROFILE)).not.toThrow();
    expect(() => assertManagedProfile({ ...CODEWHALE_MANAGED_PROFILE, allowShell: true }))
      .toThrow(/may not be loosened/u);
  });

  it("drops inherited credentials and re-adds only documented environment", () => {
    const environment = buildManagedEnvironment({
      inherited: {
        PATH: "/usr/bin",
        LANG: "en_US.UTF-8",
        OPENAI_API_KEY: "secret",
        AWS_SECRET_ACCESS_KEY: "secret",
        CODEWHALE_ALLOW_SHELL: "1",
      },
      managedHome: "/managed/home",
      configPath: "/managed/config.toml",
      managedConfigPath: "/managed/managed.toml",
      requirementsPath: "/managed/requirements.toml",
      runtimeToken: TOKEN,
    });

    expect(environment).toMatchObject({
      PATH: "/usr/bin",
      LANG: "en_US.UTF-8",
      HOME: "/managed/home",
      CODEWHALE_HOME: "/managed/home",
      CODEWHALE_RUNTIME_TOKEN: TOKEN,
    });
    expect(environment).not.toHaveProperty("OPENAI_API_KEY");
    expect(environment).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(environment).not.toHaveProperty("CODEWHALE_ALLOW_SHELL");
  });

  it("redacts runtime tokens from diagnostics", () => {
    const rendered = redactRuntimeToken(`token=${TOKEN} Authorization: Bearer ${TOKEN}`, TOKEN);
    expect(rendered).not.toContain(TOKEN);
    expect(rendered).toContain("[REDACTED_RUNTIME_TOKEN]");
  });
});

describe("model-visible tool surface", () => {
  it("accepts only the intent-only KerniQ proposal tool", async () => {
    const assessment = await assessToolSurface([{
      toolName: "kerniq::propose_project_command",
      source: "kerniq_dynamic",
    }]);

    expect(assessment).toMatchObject({
      outcome: "ADAPTER_ONLY_PASS",
      modelVisibleToolCount: 1,
      readOnlyToolCount: 0,
      sideEffectToolCount: 0,
      unknownToolCount: 0,
      prohibitedToolCallableCount: 0,
    });
  });

  it.each(["Bash", "File", "Git", "Run", "agent", "tool_search", "code_execution", "js_execution"])(
    "classifies callable native %s as a thin-fork trigger",
    async (toolName) => {
      const assessment = await assessToolSurface([
        { toolName, source: "codewhale_native" },
        { toolName: "kerniq::propose_project_command", source: "kerniq_dynamic" },
      ]);
      expect(assessment.outcome).toBe("THIN_FORK_REQUIRED");
      expect(assessment.prohibitedToolCallableCount).toBe(1);
    },
  );

  it("treats MCP, plugin, and unknown tools as side-effect capable", async () => {
    const assessment = await assessToolSurface([
      { toolName: "mcp_read_resource", source: "codewhale_mcp" },
      { toolName: "plugin_inspect", source: "codewhale_plugin" },
      { toolName: "mystery", source: "codewhale_native" },
    ]);
    expect(assessment.outcome).toBe("THIN_FORK_REQUIRED");
    expect(assessment.sideEffectToolCount).toBe(3);
    expect(assessment.unknownToolCount).toBe(1);
    expect(assessment.prohibitedToolCallableCount).toBe(3);
  });

  it("rejects duplicate receipt names", async () => {
    await expect(assessToolSurface([
      { toolName: "File", source: "codewhale_native" },
      { toolName: "File", source: "codewhale_native" },
    ])).rejects.toThrow(/duplicate/u);
  });
});

describe("KerniQ proposal boundary", () => {
  it("exports an exact bounded schema with no arbitrary command or private path", () => {
    expect(KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL).toEqual({
      namespace: "kerniq",
      name: "propose_project_command",
      description: expect.any(String),
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["commandId", "catalogDigest"],
        properties: {
          commandId: { type: "string", minLength: 1, maxLength: 160 },
          catalogDigest: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
        },
      },
      defer_loading: false,
    });
    const serialized = JSON.stringify(KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL);
    for (const forbidden of ["absolute", "credential", "privateRoot", "destination", "shell", "commandString"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("creates intent only after exact call and argument validation", () => {
    expect(validateProposalRequest(request())).toMatchObject({
      kind: "project_command_intent",
      commandId: "package-script:test",
      catalogDigest: `sha256:${"a".repeat(64)}`,
    });
    expect(() => validateProposalRequest(request({ arguments: {
      commandId: "package-script:test",
      catalogDigest: `sha256:${"a".repeat(64)}`,
      shell: "rm -rf .",
    } }))).toThrow(/exact bounded shape/u);
  });

  it("rejects every wrong call route and changed arguments", () => {
    const routeChanges: Partial<DynamicToolRequest>[] = [
      { sessionId: "thread_other" },
      { turnId: "turn_other" },
      { callId: "call_other" },
      { namespace: "other" },
      { toolName: "other" },
    ];
    for (const changed of routeChanges) {
      const guard = new DynamicToolSettlementGuard();
      guard.register(request());
      expect(() => guard.validateResultRoute(request(changed)))
        .toThrowError(expect.objectContaining({ code: "wrong_call_identity" }));
    }

    const guard = new DynamicToolSettlementGuard();
    const original = request();
    guard.register(original);
    expect(() => guard.validateResultRoute(request({ arguments: {
      commandId: "package-script:build",
      catalogDigest: `sha256:${"a".repeat(64)}`,
    } }))).toThrowError(expect.objectContaining({ code: "wrong_call_identity" }));
    expect(guard.mayExecute(request({ arguments: {
      commandId: "package-script:build",
      catalogDigest: `sha256:${"a".repeat(64)}`,
    } }))).toBe(false);
  });

  it("rejects duplicate results", () => {
    const guard = new DynamicToolSettlementGuard();
    const original = request();
    guard.register(original);
    guard.accept(original, result());
    expect(() => guard.accept(original, result()))
      .toThrowError(expect.objectContaining({ code: "duplicate_result" }));
  });

  it("prevents execution after timeout, cancellation, or restart", () => {
    const timedOut = new DynamicToolSettlementGuard();
    timedOut.register(request());
    timedOut.timeout(request());
    expect(timedOut.mayExecute(request())).toBe(false);
    expect(() => timedOut.validateResultRoute(request()))
      .toThrowError(expect.objectContaining({ code: "call_terminal" }));

    const canceled = new DynamicToolSettlementGuard();
    canceled.register(request());
    canceled.cancel(request());
    expect(canceled.mayExecute(request())).toBe(false);

    const restarted = new DynamicToolSettlementGuard();
    restarted.restoreHistorical(request());
    expect(restarted.mayExecute(request())).toBe(false);
    expect(() => restarted.accept(request(), result()))
      .toThrowError(expect.objectContaining({ code: "call_terminal" }));
  });

  it("deduplicates replayed events and rejects another session", () => {
    const gate = new EventCursorGate("thread_1", 5);
    expect(gate.accept({ sessionId: "thread_1", sequence: 5 })).toBe(false);
    expect(gate.accept({ sessionId: "thread_1", sequence: 6 })).toBe(true);
    expect(gate.accept({ sessionId: "thread_1", sequence: 6 })).toBe(false);
    expect(() => gate.accept({ sessionId: "thread_2", sequence: 7 }))
      .toThrowError(expect.objectContaining({ code: "wrong_call_identity" }));
  });
});

describe("managed supervisor and adapter", () => {
  it("blocks the real unsafe receipt before process launch or product execution", async () => {
    const harness = processHarness();
    const unsafe = await assessToolSurface([
      { toolName: "File", source: "codewhale_native" },
      { toolName: "kerniq::propose_project_command", source: "kerniq_dynamic" },
    ]);
    const supervisor = harness.supervisor();

    await expect(supervisor.start(startInput(unsafe)))
      .rejects.toMatchObject({ code: "unsafe_tool_surface" });
    expect(harness.launcher.launch).not.toHaveBeenCalled();
    expect(harness.probe.waitUntilHealthy).not.toHaveBeenCalled();
  });

  it("starts a synthetic structurally safe surface and shuts down in order", async () => {
    const harness = processHarness();
    const safe = await assessToolSurface([{
      toolName: "kerniq::propose_project_command",
      source: "kerniq_dynamic",
    }]);
    const supervisor = harness.supervisor();
    await expect(supervisor.start(startInput(safe))).resolves.toMatchObject({
      status: "healthy",
      pid: 4242,
      startedAt: "2026-08-02T00:00:00.000Z",
    });

    const spec = vi.mocked(harness.launcher.launch).mock.calls[0][0];
    expect(spec.executablePath).toBe("/managed/bin/codewhale-tui");
    expect(spec.args).toEqual([
      "--workspace",
      "/fixture/project",
      "--config",
      "/managed/config.toml",
      "--no-project-config",
      "--disable",
      "mcp",
      "--disable",
      "subagents",
      "serve",
      "--http",
      "--host",
      "127.0.0.1",
      "--port",
      "47878",
      "--workers",
      "1",
    ]);
    expect(spec.args.join(" ")).not.toContain(TOKEN);
    expect(spec.environment.CODEWHALE_RUNTIME_TOKEN).toBe(TOKEN);

    await supervisor.shutdown();
    expect(harness.order).toEqual(["healthy", "interrupt", "shutdown", "terminate", "kill"]);
    expect(supervisor.inspect()).toEqual({ status: "stopped" });
  });

  it("kills a premature child and does not leave an orphan", async () => {
    const harness = processHarness({ healthError: new Error("not healthy") });
    const safe = await assessToolSurface([{
      toolName: "kerniq::propose_project_command",
      source: "kerniq_dynamic",
    }]);
    const supervisor = harness.supervisor();
    await expect(supervisor.start(startInput(safe))).rejects.toThrow("not healthy");
    expect(harness.child.kill).toHaveBeenCalledTimes(1);
    expect(supervisor.inspect()).toEqual({ status: "failed" });
  });

  it("rejects a runtime capability mismatch and kills the child", async () => {
    const harness = processHarness({ externalTools: false });
    const safe = await assessToolSurface([{
      toolName: "kerniq::propose_project_command",
      source: "kerniq_dynamic",
    }]);
    const supervisor = harness.supervisor();
    await expect(supervisor.start(startInput(safe)))
      .rejects.toMatchObject({ code: "identity_mismatch" });
    expect(harness.child.kill).toHaveBeenCalledTimes(1);
    expect(supervisor.inspect()).toEqual({ status: "failed" });
  });

  it("keeps CodeWhale wire objects behind KerniQ-owned types", async () => {
    const harness = processHarness();
    const safe = await assessToolSurface([{
      toolName: "kerniq::propose_project_command",
      source: "kerniq_dynamic",
    }]);
    const supervisor = harness.supervisor();
    await supervisor.start(startInput(safe));
    const runtime = runtimeClient();
    const adapter = new CodeWhaleAgentEngineAdapter({
      supervisor,
      supervisorStart: startInput(safe),
      runtime,
      toolSurface: safe,
    });

    await expect(adapter.createSession("fixture-identity")).resolves.toEqual({
      sessionId: "thread_1",
      workspaceIdentity: "fixture-identity",
    });
    await expect(adapter.startTurn("thread_1", "inspect fixture")).resolves.toEqual({
      sessionId: "thread_1",
      turnId: "turn_1",
      status: "in_progress",
    });
    expect(runtime.createThread).toHaveBeenCalledWith(expect.objectContaining({
      mode: "plan",
      permission_posture: "never",
      allow_shell: false,
      dynamic_tools: [KERNIQ_PROJECT_COMMAND_DYNAMIC_TOOL],
    }));
  });
});

function request(overrides: Partial<DynamicToolRequest> = {}): DynamicToolRequest {
  return {
    sessionId: "thread_1",
    turnId: "turn_1",
    callId: "call_1",
    namespace: "kerniq",
    toolName: "propose_project_command",
    arguments: {
      commandId: "package-script:test",
      catalogDigest: `sha256:${"a".repeat(64)}`,
    },
    ...overrides,
  };
}

function result() {
  return {
    success: true,
    content: [{ type: "input_text" as const, text: "Intent accepted by KerniQ." }],
  };
}

function startInput(toolSurface: ToolSurfaceAssessment): SupervisorStartInput {
  return {
    identity: CODEWHALE_PINNED_IDENTITY,
    executableBytes: EXECUTABLE_BYTES,
    executablePath: "/managed/bin/codewhale-tui",
    workspacePath: "/fixture/project",
    port: 47_878,
    startupTimeoutMs: 5_000,
    environment: {
      inherited: { PATH: "/usr/bin", OPENAI_API_KEY: "must-drop" },
      managedHome: "/managed/home",
      configPath: "/managed/config.toml",
      managedConfigPath: "/managed/managed.toml",
      requirementsPath: "/managed/requirements.toml",
    },
    toolSurface,
  };
}

function processHarness(options: { healthError?: Error; externalTools?: boolean } = {}) {
  const order: string[] = [];
  const child: ManagedChildProcess = {
    pid: 4242,
    exited: new Promise(() => undefined),
    terminate: vi.fn(async () => { order.push("terminate"); }),
    kill: vi.fn(async () => { order.push("kill"); }),
  };
  const launcher: ManagedProcessLauncher = {
    launch: vi.fn(async (_spec: ManagedProcessSpec) => child),
  };
  const probe: RuntimeLifecycleProbe = {
    waitUntilHealthy: vi.fn(async () => {
      if (options.healthError) throw options.healthError;
      order.push("healthy");
    }),
    inspectIdentity: vi.fn(async () => ({
      version: "0.9.3",
      capabilities: {
        threads: true,
        turns: true,
        event_replay: true,
        external_tools: options.externalTools ?? true,
      },
    })),
    interruptLiveTurns: vi.fn(async () => { order.push("interrupt"); }),
    shutdown: vi.fn(async () => { order.push("shutdown"); }),
  };
  return {
    order,
    child,
    launcher,
    probe,
    supervisor: () => new ManagedCodeWhaleSupervisor(
      launcher,
      probe,
      () => TOKEN,
      () => new Date("2026-08-02T00:00:00.000Z"),
      async () => undefined,
    ),
  };
}

function runtimeClient(): CodeWhaleRuntimeClient & {
  createThread: ReturnType<typeof vi.fn>;
} {
  const subscription: AgentEngineSubscription = { close: vi.fn(async () => undefined) };
  return {
    createThread: vi.fn(async () => ({ id: "thread_1" })),
    startTurn: vi.fn(async () => ({ turn: { id: "turn_1", status: "in_progress" } })),
    subscribe: vi.fn(async () => subscription),
    interruptTurn: vi.fn(async () => ({ id: "turn_1", status: "interrupted" })),
    submitToolResult: vi.fn(async () => undefined),
  };
}
