import { CODEWHALE_RUNTIME_VERSION, assertPinnedIdentity, verifyExecutableDigest } from "./identity.js";
import { buildManagedEnvironment, redactRuntimeToken, type ManagedEnvironmentInput } from "./profile.js";
import type { ToolSurfaceAssessment } from "./toolSurface.js";
import { AgentEngineError, type AgentEngineIdentity, type AgentEngineProcess } from "./types.js";

export interface ManagedProcessSpec {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
}

export interface ManagedChildProcess {
  readonly pid: number;
  readonly exited: Promise<{ readonly code: number | null; readonly signal: string | null }>;
  terminate(): Promise<void>;
  kill(): Promise<void>;
}

export interface ManagedProcessLauncher {
  launch(spec: ManagedProcessSpec): Promise<ManagedChildProcess>;
}

export interface RuntimeLifecycleProbe {
  waitUntilHealthy(input: {
    readonly host: "127.0.0.1";
    readonly port: number;
    readonly token: string;
    readonly timeoutMs: number;
  }): Promise<void>;
  inspectIdentity(): Promise<{
    readonly version: string;
    readonly capabilities: Readonly<Record<string, boolean>>;
  }>;
  interruptLiveTurns(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface SupervisorStartInput {
  readonly identity: AgentEngineIdentity;
  readonly executableBytes: Uint8Array;
  readonly executablePath: string;
  readonly workspacePath: string;
  readonly port: number;
  readonly startupTimeoutMs: number;
  readonly environment: Omit<ManagedEnvironmentInput, "runtimeToken">;
  readonly toolSurface: ToolSurfaceAssessment;
}

export class ManagedCodeWhaleSupervisor {
  private child?: ManagedChildProcess;
  private runtimeToken?: string;
  private process: AgentEngineProcess = Object.freeze({ status: "stopped" });

  constructor(
    private readonly launcher: ManagedProcessLauncher,
    private readonly probe: RuntimeLifecycleProbe,
    private readonly tokenFactory: () => string,
    private readonly clock: () => Date = () => new Date(),
    private readonly executableVerifier: (bytes: Uint8Array) => Promise<void> = verifyExecutableDigest,
  ) {}

  inspect(): AgentEngineProcess {
    return this.process;
  }

  async start(input: SupervisorStartInput): Promise<AgentEngineProcess> {
    if (this.process.status !== "stopped") {
      throw new AgentEngineError("runtime_unavailable", "A managed CodeWhale instance is already active.");
    }
    if (input.toolSurface.outcome !== "ADAPTER_ONLY_PASS") {
      throw new AgentEngineError("unsafe_tool_surface", "CodeWhale cannot start through the product adapter with a prohibited model tool surface.");
    }
    assertPinnedIdentity(input.identity);
    await this.executableVerifier(input.executableBytes);
    assertAbsolutePath(input.executablePath);
    assertAbsolutePath(input.workspacePath);
    if (!Number.isSafeInteger(input.port) || input.port < 1024 || input.port > 65_535) {
      throw new TypeError("Managed CodeWhale requires a high loopback port.");
    }
    if (!Number.isSafeInteger(input.startupTimeoutMs) || input.startupTimeoutMs < 100 || input.startupTimeoutMs > 60_000) {
      throw new TypeError("Managed CodeWhale requires a bounded startup timeout.");
    }
    this.process = Object.freeze({ status: "starting" });
    const token = this.tokenFactory();
    this.runtimeToken = token;
    const environment = buildManagedEnvironment({ ...input.environment, runtimeToken: token });
    const spec: ManagedProcessSpec = Object.freeze({
      executablePath: input.executablePath,
      args: Object.freeze([
        "--workspace",
        input.workspacePath,
        "--config",
        input.environment.configPath,
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
        String(input.port),
        "--workers",
        "1",
      ]),
      cwd: input.workspacePath,
      environment: Object.freeze(environment),
    });
    try {
      this.child = await this.launcher.launch(spec);
      const child = this.child;
      await withTimeout(Promise.race([
        this.probe.waitUntilHealthy({
          host: "127.0.0.1",
          port: input.port,
          token,
          timeoutMs: input.startupTimeoutMs,
        }),
        child.exited.then(() => {
          throw new AgentEngineError("runtime_exited", "CodeWhale exited before the health gate passed.");
        }),
      ]), input.startupTimeoutMs);
      assertRuntimeIdentity(await this.probe.inspectIdentity());
      this.process = Object.freeze({
        status: "healthy",
        pid: child.pid,
        startedAt: this.clock().toISOString(),
      });
      void child.exited.then(() => {
        if (this.child === child && this.process.status === "healthy") {
          this.child = undefined;
          this.runtimeToken = undefined;
          this.process = Object.freeze({ status: "failed" });
        }
      });
      return this.process;
    } catch (error) {
      await this.child?.kill().catch(() => undefined);
      this.child = undefined;
      this.runtimeToken = undefined;
      this.process = Object.freeze({ status: "failed" });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.child) {
      this.process = Object.freeze({ status: "stopped" });
      this.runtimeToken = undefined;
      return;
    }
    this.process = Object.freeze({ status: "stopping", pid: this.child.pid });
    try {
      await this.probe.interruptLiveTurns();
      await this.probe.shutdown();
      await this.child.terminate();
    } finally {
      await this.child.kill().catch(() => undefined);
      this.child = undefined;
      this.runtimeToken = undefined;
      this.process = Object.freeze({ status: "stopped" });
    }
  }

  safeDiagnostic(value: string): string {
    return this.runtimeToken ? redactRuntimeToken(value, this.runtimeToken) : value;
  }
}

function assertAbsolutePath(value: string): void {
  if (!value.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(value)) {
    throw new TypeError("Managed CodeWhale paths must be absolute.");
  }
}

const REQUIRED_RUNTIME_CAPABILITIES = ["threads", "turns", "event_replay", "external_tools"];

function assertRuntimeIdentity(input: {
  readonly version: string;
  readonly capabilities: Readonly<Record<string, boolean>>;
}): void {
  if (input.version !== CODEWHALE_RUNTIME_VERSION) {
    throw new AgentEngineError("identity_mismatch", "CodeWhale runtime version does not match the pinned executable.");
  }
  const missing = REQUIRED_RUNTIME_CAPABILITIES.filter((capability) => input.capabilities[capability] !== true);
  if (missing.length > 0) {
    throw new AgentEngineError("identity_mismatch", `CodeWhale runtime capability mismatch: ${missing.join(", ")}.`);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new AgentEngineError("runtime_timeout", "CodeWhale did not become healthy before the startup deadline."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
