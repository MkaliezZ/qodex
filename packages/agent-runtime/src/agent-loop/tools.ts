import type { ModelTool, ModelToolCall } from "@qodex/provider-sdk";
import {
  type AgentProjectAccess,
  type ProjectCommandCategory,
  type ProjectCommandDefinition,
} from "./types.js";

const MAX_FILES_SCANNED = 500;
const MAX_TOTAL_BYTES_SCANNED = 5 * 1024 * 1024;
const DEFAULT_MAX_RESULTS = 50;
const HARD_MAX_RESULTS = 200;
const MAX_EXCERPT_LENGTH = 300;
const DEFAULT_LINES = 200;
const HARD_MAX_LINES = 500;
const HARD_MAX_BYTES = 256 * 1024;

export type AgentToolErrorCode =
  | "unknown_tool"
  | "invalid_arguments"
  | "unsafe_path"
  | "file_not_found"
  | "binary_file_unsupported"
  | "command_unavailable"
  | "unknown_command_id"
  | "tool_execution_failed";

export interface AgentToolResult {
  ok: boolean;
  tool: string;
  code?: AgentToolErrorCode;
  error?: string;
  data?: unknown;
  metadata: {
    durationMs: number;
    truncated?: boolean;
  };
}

export const AGENT_TOOLS: ModelTool[] = [
  {
    name: "search_files",
    description: "Search literal text inside eligible files in the opened project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        pathPrefix: { type: "string" },
        caseSensitive: { type: "boolean" },
        maxResults: { type: "integer", minimum: 1, maximum: HARD_MAX_RESULTS },
      },
    },
  },
  {
    name: "read_file",
    description: "Read a bounded line range from one existing project-relative text file.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", minLength: 1 },
        startLine: { type: "integer", minimum: 1 },
        endLine: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    name: "list_project_commands",
    description: "List trusted test, check, lint, typecheck, and build commands discovered from project metadata.",
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "run_project_command",
    description: "Request explicit user approval to run one command from the trusted project command catalog.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["commandId"],
      properties: { commandId: { type: "string", minLength: 1 } },
    },
  },
];

export class AgentToolRegistry {
  private commandCatalog = new Map<string, ProjectCommandDefinition>();

  constructor(private readonly project: AgentProjectAccess) {}

  definitions(): ModelTool[] {
    return AGENT_TOOLS;
  }

  async executeReadTool(call: ModelToolCall): Promise<AgentToolResult> {
    const startedAt = Date.now();
    try {
      if (call.name === "search_files") {
        return this.success(call.name, await this.searchFiles(call.arguments), startedAt);
      }
      if (call.name === "read_file") {
        return this.success(call.name, await this.readFile(call.arguments), startedAt);
      }
      if (call.name === "list_project_commands") {
        return this.success(call.name, await this.listProjectCommands(call.arguments), startedAt);
      }
      if (call.name === "run_project_command") {
        return this.failure(call.name, "invalid_arguments", "Command execution requires approval.", startedAt);
      }
      return this.failure(call.name, "unknown_tool", `Unknown tool: ${call.name}`, startedAt);
    } catch (error) {
      const code = error instanceof ToolInputError ? error.code : "tool_execution_failed";
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return this.failure(call.name, code, message, startedAt);
    }
  }

  async resolveCommand(call: ModelToolCall): Promise<{
    result?: AgentToolResult;
    command?: ProjectCommandDefinition;
  }> {
    const startedAt = Date.now();
    if (call.name !== "run_project_command") {
      return { result: this.failure(call.name, "unknown_tool", `Unknown tool: ${call.name}`, startedAt) };
    }
    if (!isRecord(call.arguments) || !hasOnlyKeys(call.arguments, ["commandId"]) || typeof call.arguments.commandId !== "string") {
      return { result: this.failure(call.name, "invalid_arguments", "commandId must be the only string argument.", startedAt) };
    }
    if (!this.project.commandExecutionAvailable) {
      return { result: this.failure(call.name, "command_unavailable", "Native project commands are unavailable in browser mode.", startedAt) };
    }
    if (this.commandCatalog.size === 0) await this.discoverCommands();
    const command = this.commandCatalog.get(call.arguments.commandId);
    if (!command) {
      return { result: this.failure(call.name, "unknown_command_id", "The requested command is not in the trusted catalog.", startedAt) };
    }
    return { command };
  }

  serialize(result: AgentToolResult): string {
    return JSON.stringify(result);
  }

  private async searchFiles(value: unknown) {
    if (!isRecord(value) || !hasOnlyKeys(value, ["query", "pathPrefix", "caseSensitive", "maxResults"])) {
      throw new ToolInputError("invalid_arguments", "search_files received unsupported arguments.");
    }
    const query = stringField(value, "query");
    if (!query) throw new ToolInputError("invalid_arguments", "query must be a non-empty string.");
    const pathPrefix = optionalStringField(value, "pathPrefix");
    if (pathPrefix && !isSafeRelativePath(pathPrefix)) {
      throw new ToolInputError("unsafe_path", "pathPrefix must be project-relative.");
    }
    const caseSensitive = optionalBooleanField(value, "caseSensitive") ?? false;
    const requestedMax = optionalIntegerField(value, "maxResults") ?? DEFAULT_MAX_RESULTS;
    if (requestedMax < 1 || requestedMax > HARD_MAX_RESULTS) {
      throw new ToolInputError("invalid_arguments", `maxResults must be between 1 and ${HARD_MAX_RESULTS}.`);
    }

    const matches: Array<{ path: string; line: number; excerpt: string }> = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let truncated = false;
    const needle = caseSensitive ? query : query.toLocaleLowerCase("en-US");
    const eligibleFiles = this.project.listFiles()
      .filter((file) => !pathPrefix || file.path === pathPrefix || file.path.startsWith(`${pathPrefix}/`));
    const candidates = eligibleFiles.slice(0, MAX_FILES_SCANNED);
    if (eligibleFiles.length > candidates.length) truncated = true;

    for (const file of candidates) {
      if (filesScanned >= MAX_FILES_SCANNED || bytesScanned >= MAX_TOTAL_BYTES_SCANNED) {
        truncated = true;
        break;
      }
      let content: string;
      try {
        content = await this.project.readFile(file.path);
      } catch {
        continue;
      }
      const bytes = utf8Length(content);
      if (bytesScanned + bytes > MAX_TOTAL_BYTES_SCANNED) {
        truncated = true;
        break;
      }
      filesScanned += 1;
      bytesScanned += bytes;
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const haystack = caseSensitive ? lines[index] : lines[index].toLocaleLowerCase("en-US");
        if (!haystack.includes(needle)) continue;
        matches.push({ path: file.path, line: index + 1, excerpt: lines[index].slice(0, MAX_EXCERPT_LENGTH) });
        if (matches.length >= requestedMax) {
          truncated = true;
          break;
        }
      }
      if (matches.length >= requestedMax) break;
    }

    return { query, matches, filesScanned, bytesScanned, truncated };
  }

  private async readFile(value: unknown) {
    if (!isRecord(value) || !hasOnlyKeys(value, ["path", "startLine", "endLine"])) {
      throw new ToolInputError("invalid_arguments", "read_file received unsupported arguments.");
    }
    const path = stringField(value, "path");
    if (!path || !isSafeRelativePath(path)) {
      throw new ToolInputError("unsafe_path", "path must identify a project-relative file.");
    }
    if (!this.project.listFiles().some((file) => file.path === path)) {
      throw new ToolInputError("file_not_found", "The requested regular text file could not be read.");
    }
    const startLine = optionalIntegerField(value, "startLine") ?? 1;
    const requestedEnd = optionalIntegerField(value, "endLine") ?? startLine + DEFAULT_LINES - 1;
    if (startLine < 1 || requestedEnd < startLine || requestedEnd - startLine + 1 > HARD_MAX_LINES) {
      throw new ToolInputError("invalid_arguments", `read_file accepts at most ${HARD_MAX_LINES} ordered lines.`);
    }

    let content: string;
    try {
      content = await this.project.readFile(path);
    } catch (error) {
      throw new ToolInputError(
        error instanceof Error && error.message.toLowerCase().includes("binary")
          ? "binary_file_unsupported"
          : "file_not_found",
        "The requested regular text file could not be read.",
      );
    }
    const lines = content.split("\n");
    const actualStart = startLine;
    const actualEnd = Math.min(requestedEnd, lines.length);
    const selected = actualEnd >= actualStart ? lines.slice(actualStart - 1, actualEnd).join("\n") : "";
    const bounded = truncateUtf8(selected, HARD_MAX_BYTES);
    return {
      path,
      content: bounded.value,
      startLine: actualStart,
      endLine: actualEnd,
      totalLines: lines.length,
      truncated: bounded.truncated || actualEnd < lines.length,
    };
  }

  private async listProjectCommands(value: unknown) {
    if (!isRecord(value) || !hasOnlyKeys(value, [])) {
      throw new ToolInputError("invalid_arguments", "list_project_commands accepts an empty object.");
    }
    await this.discoverCommands();
    return {
      available: this.project.commandExecutionAvailable,
      commands: [...this.commandCatalog.values()],
      warning: this.project.commandExecutionAvailable
        ? "Project scripts may have side effects and each execution requires explicit approval."
        : "Native project commands are unavailable in browser mode.",
    };
  }

  private async discoverCommands(): Promise<void> {
    this.commandCatalog.clear();
    const paths = new Set(this.project.listFiles().map((file) => file.path));
    if (paths.has("package.json")) {
      try {
        const packageJson = JSON.parse(await this.project.readFile("package.json")) as unknown;
        if (isRecord(packageJson) && isRecord(packageJson.scripts)) {
          for (const script of Object.keys(packageJson.scripts).sort()) {
            if (!safeScriptName(script) || typeof packageJson.scripts[script] !== "string") continue;
            const category = commandCategory(script);
            const scriptSource = packageJson.scripts[script] as string;
            this.commandCatalog.set(`package-script:${script}`, {
              id: `package-script:${script}`,
              label: `pnpm ${script}`,
              executable: "pnpm",
              args: ["run", script],
              cwd: ".",
              source: "package.json",
              category,
              catalogDigest: await catalogDigest(`package.json\0${script}\0${scriptSource}`),
            });
          }
        }
      } catch {
        // Malformed metadata yields no package command rather than an unsafe guess.
      }
    }
    if (paths.has("Cargo.toml")) {
      for (const name of ["test", "check"] as const) {
        this.commandCatalog.set(`cargo:${name}`, {
          id: `cargo:${name}`,
          label: `cargo ${name}`,
          executable: "cargo",
          args: [name],
          cwd: ".",
          source: "cargo",
          category: name,
          catalogDigest: await catalogDigest(`cargo\0${name}`),
        });
      }
    }
  }

  private success(tool: string, data: unknown, startedAt: number): AgentToolResult {
    return { ok: true, tool, data, metadata: { durationMs: Date.now() - startedAt } };
  }

  private failure(
    tool: string,
    code: AgentToolErrorCode,
    error: string,
    startedAt: number,
  ): AgentToolResult {
    return { ok: false, tool, code, error, metadata: { durationMs: Date.now() - startedAt } };
  }
}

class ToolInputError extends Error {
  constructor(readonly code: AgentToolErrorCode, message: string) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key));
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] as string : undefined;
}

function optionalStringField(value: Record<string, unknown>, key: string): string | undefined {
  if (!(key in value)) return undefined;
  if (typeof value[key] !== "string") throw new ToolInputError("invalid_arguments", `${key} must be a string.`);
  return value[key] as string;
}

function optionalBooleanField(value: Record<string, unknown>, key: string): boolean | undefined {
  if (!(key in value)) return undefined;
  if (typeof value[key] !== "boolean") throw new ToolInputError("invalid_arguments", `${key} must be a boolean.`);
  return value[key] as boolean;
}

function optionalIntegerField(value: Record<string, unknown>, key: string): number | undefined {
  if (!(key in value)) return undefined;
  if (typeof value[key] !== "number" || !Number.isInteger(value[key])) {
    throw new ToolInputError("invalid_arguments", `${key} must be an integer.`);
  }
  return value[key] as number;
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0
    && path === path.trim()
    && !path.includes("\0")
    && !path.includes("\\")
    && !path.startsWith("/")
    && !/^[A-Za-z]:\//.test(path)
    && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function safeScriptName(name: string): boolean {
  return /^(test|check|lint|typecheck|build)(?::[A-Za-z0-9._-]+)?$/.test(name);
}

function commandCategory(name: string): ProjectCommandCategory {
  const category = name.split(":", 1)[0];
  return category as ProjectCommandCategory;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return { value, truncated: false };
  return { value: new TextDecoder().decode(encoded.slice(0, maxBytes)), truncated: true };
}

async function catalogDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
