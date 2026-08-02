import { sha256Canonical, type CanonicalValue } from "./canonical.js";

export type ToolSource = "codewhale_native" | "codewhale_mcp" | "codewhale_plugin" | "kerniq_dynamic";

export interface ToolSurfaceEntry {
  readonly toolName: string;
  readonly source: ToolSource;
  readonly nativeOrDynamic: "native" | "dynamic";
  readonly readOnly: boolean;
  readonly sideEffectCapable: boolean;
  readonly classificationReason: string;
  readonly enabled: boolean;
  readonly callable: boolean;
}

export interface ToolSurfaceAssessment {
  readonly outcome: "ADAPTER_ONLY_PASS" | "THIN_FORK_REQUIRED";
  readonly digest: string;
  readonly modelVisibleToolCount: number;
  readonly readOnlyToolCount: number;
  readonly sideEffectToolCount: number;
  readonly unknownToolCount: number;
  readonly prohibitedToolCallableCount: number;
  readonly tools: readonly ToolSurfaceEntry[];
}

const KERNIQ_PROPOSAL_TOOL_NAMES = new Set([
  "propose_project_command",
  "kerniq.propose_project_command",
  "kerniq::propose_project_command",
]);

const CODEWHALE_SIDE_EFFECT_TOOLS: Readonly<Record<string, string>> = Object.freeze({
  Bash: "Aggregates shell and background process execution.",
  File: "Aggregates filesystem reads and mutations in one callable tool.",
  Git: "Aggregates read and Git mutation operations.",
  Run: "Runs project commands, tests, verifiers, or other local processes.",
  Web: "May perform network requests and is not proven read-only.",
  agent: "Spawns a sub-agent control path.",
  code_execution: "Executes Python code.",
  js_execution: "Executes JavaScript code.",
  remember: "Writes agent memory.",
  request_user_input: "Creates an external interactive control request.",
  tasks: "Creates or mutates durable task state.",
  tool_search: "Can hydrate deferred side-effect tools into the callable model surface.",
  work_update: "Mutates CodeWhale Work state.",
  "multi_tool_use.parallel": "Can dispatch multiple model-selected tools.",
});

const PROHIBITED_PATTERNS = [
  /(^|[_.:])(?:bash|shell|exec|command|run)(?:$|[_.:])/iu,
  /(?:write|edit|patch|delete|remove|rename|move|copy|git|deploy|publish)/iu,
  /(?:agent|task|fleet|plugin|mcp|memory|remember|web|network|javascript|python)/iu,
];

export function classifyTool(input: {
  readonly toolName: string;
  readonly source: ToolSource;
  readonly enabled?: boolean;
  readonly callable?: boolean;
}): ToolSurfaceEntry {
  const enabled = input.enabled ?? true;
  const callable = input.callable ?? true;
  if (input.source === "kerniq_dynamic" && KERNIQ_PROPOSAL_TOOL_NAMES.has(input.toolName)) {
    return Object.freeze({
      toolName: input.toolName,
      source: input.source,
      nativeOrDynamic: "dynamic",
      readOnly: false,
      sideEffectCapable: false,
      classificationReason: "Creates a bounded KerniQ intent only; it has no physical execution path.",
      enabled,
      callable,
    });
  }
  if (input.source === "codewhale_mcp") {
    return sideEffect(input, "MCP tools are side-effect-capable unless independently proven read-only.");
  }
  if (input.source === "codewhale_plugin") {
    return sideEffect(input, "Plugin tools are side-effect-capable by policy.");
  }
  const reason = CODEWHALE_SIDE_EFFECT_TOOLS[input.toolName];
  if (reason) return sideEffect(input, reason);
  return sideEffect(input, "Unknown or unclassified tools are side-effect-capable by policy.");
}

export async function assessToolSurface(
  input: readonly {
    readonly toolName: string;
    readonly source: ToolSource;
    readonly enabled?: boolean;
    readonly callable?: boolean;
  }[],
): Promise<ToolSurfaceAssessment> {
  const tools = input.map(classifyTool).sort((left, right) => left.toolName.localeCompare(right.toolName, "en"));
  if (new Set(tools.map((tool) => tool.toolName)).size !== tools.length) {
    throw new TypeError("The CodeWhale tool-surface receipt contains duplicate tool names.");
  }
  const visible = tools.filter((tool) => tool.enabled);
  const prohibited = visible.filter((tool) => tool.callable && isProhibited(tool));
  const unknown = visible.filter((tool) => tool.classificationReason.startsWith("Unknown"));
  const digest = await sha256Canonical(tools as unknown as CanonicalValue);
  return Object.freeze({
    outcome: prohibited.length === 0 ? "ADAPTER_ONLY_PASS" : "THIN_FORK_REQUIRED",
    digest,
    modelVisibleToolCount: visible.length,
    readOnlyToolCount: visible.filter((tool) => tool.readOnly).length,
    sideEffectToolCount: visible.filter((tool) => tool.sideEffectCapable).length,
    unknownToolCount: unknown.length,
    prohibitedToolCallableCount: prohibited.length,
    tools: Object.freeze(tools),
  });
}

function sideEffect(
  input: { readonly toolName: string; readonly source: ToolSource; readonly enabled?: boolean; readonly callable?: boolean },
  classificationReason: string,
): ToolSurfaceEntry {
  return Object.freeze({
    toolName: input.toolName,
    source: input.source,
    nativeOrDynamic: input.source === "kerniq_dynamic" ? "dynamic" : "native",
    readOnly: false,
    sideEffectCapable: true,
    classificationReason,
    enabled: input.enabled ?? true,
    callable: input.callable ?? true,
  });
}

function isProhibited(tool: ToolSurfaceEntry): boolean {
  if (KERNIQ_PROPOSAL_TOOL_NAMES.has(tool.toolName) && !tool.sideEffectCapable) return false;
  return tool.sideEffectCapable
    || tool.source === "codewhale_mcp"
    || tool.source === "codewhale_plugin"
    || PROHIBITED_PATTERNS.some((pattern) => pattern.test(tool.toolName));
}
