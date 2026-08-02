import { sha256Canonical, type CanonicalValue } from "./canonical.js";

export type ToolSource = "codewhale_native" | "codewhale_mcp" | "codewhale_plugin" | "kerniq_dynamic";

export type ToolClassification =
  | "proven_read_only"
  | "proven_side_effect"
  | "unclassified_fail_closed"
  | "kerniq_intent_only";

export interface ToolSurfaceInput {
  readonly toolName: string;
  readonly source: ToolSource;
  readonly observedSchema?: unknown;
  readonly enabled?: boolean;
  readonly callable?: boolean;
}

export interface ToolSurfaceEntry {
  readonly toolName: string;
  readonly source: ToolSource;
  readonly nativeOrDynamic: "native" | "dynamic";
  readonly classification: ToolClassification;
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
  readonly provenReadOnlyToolCount: number;
  readonly kerniqIntentOnlyToolCount: number;
  readonly provenSideEffectToolCount: number;
  readonly unclassifiedToolCount: number;
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

const CODEWHALE_PROVEN_SIDE_EFFECT_TOOLS: Readonly<Record<string, string>> = Object.freeze({
  Bash: "Aggregates shell and background process execution.",
  Run: "Runs project commands, tests, verifiers, or other local processes.",
  agent: "Spawns a sub-agent control path.",
  code_execution: "Executes Python code.",
  create_goal: "Creates mutable CodeWhale goal state.",
  js_execution: "Executes JavaScript code.",
  notify: "Writes a terminal notification escape sequence.",
  remember: "Writes agent memory.",
  request_user_input: "Creates an external interactive control request.",
  tool_search: "Can hydrate deferred side-effect tools into the callable model surface.",
  update_goal: "Mutates CodeWhale goal state.",
  work_update: "Mutates CodeWhale Work state.",
  "multi_tool_use.parallel": "Can dispatch multiple model-selected tools.",
});

const FILE_READ_ONLY_ACTIONS = new Set(["read", "list", "search_name", "search_content"]);
const GIT_READ_ONLY_ACTIONS = new Set(["status", "diff", "log", "show", "blame"]);

const PROHIBITED_PATTERNS = [
  /(^|[_.:])(?:bash|shell|exec|command|run)(?:$|[_.:])/iu,
  /(?:write|edit|patch|delete|remove|rename|move|copy|git|deploy|publish)/iu,
  /(?:agent|task|fleet|plugin|mcp|memory|remember|web|network|javascript|python)/iu,
];

export function classifyTool(input: ToolSurfaceInput): ToolSurfaceEntry {
  const enabled = input.enabled ?? true;
  const callable = input.callable ?? true;
  if (input.source === "kerniq_dynamic" && KERNIQ_PROPOSAL_TOOL_NAMES.has(input.toolName)) {
    return Object.freeze({
      toolName: input.toolName,
      source: input.source,
      nativeOrDynamic: "dynamic",
      classification: "kerniq_intent_only",
      readOnly: false,
      sideEffectCapable: false,
      classificationReason: "Creates a bounded KerniQ intent only; it has no physical execution path.",
      enabled,
      callable,
    });
  }
  if (input.source === "codewhale_mcp") {
    return unclassified(input, "MCP tool behavior was not independently proven read-only; fail closed.");
  }
  if (input.source === "codewhale_plugin") {
    return unclassified(input, "Plugin tool behavior is outside the reviewed native surface; fail closed.");
  }
  const actions = observedActionEnum(input.observedSchema);
  if (input.toolName === "File" && isNonEmptySubset(actions, FILE_READ_ONLY_ACTIONS)) {
    return provenReadOnly(input, "Pinned Plan-mode File tool exposes only reviewed read-only inspection actions.");
  }
  if (input.toolName === "Git" && hasExactActions(actions, GIT_READ_ONLY_ACTIONS)) {
    return provenReadOnly(input, "Pinned Git tool exposes only reviewed read-only inspection actions.");
  }
  const reason = CODEWHALE_PROVEN_SIDE_EFFECT_TOOLS[input.toolName];
  if (reason) return provenSideEffect(input, reason);
  return unclassified(input, "Exact implementation was not fully proven side-effect-free; fail closed.");
}

export async function assessToolSurface(
  input: readonly ToolSurfaceInput[],
): Promise<ToolSurfaceAssessment> {
  const tools = input.map(classifyTool).sort((left, right) => left.toolName.localeCompare(right.toolName, "en"));
  if (new Set(tools.map((tool) => tool.toolName)).size !== tools.length) {
    throw new TypeError("The CodeWhale tool-surface receipt contains duplicate tool names.");
  }
  const visible = tools.filter((tool) => tool.enabled);
  const prohibited = visible.filter((tool) => tool.callable && isProhibited(tool));
  const provenReadOnly = visible.filter((tool) => tool.classification === "proven_read_only");
  const intents = visible.filter((tool) => tool.classification === "kerniq_intent_only");
  const provenSideEffects = visible.filter((tool) => tool.classification === "proven_side_effect");
  const unclassifiedTools = visible.filter((tool) => tool.classification === "unclassified_fail_closed");
  const digest = await sha256Canonical(tools as unknown as CanonicalValue);
  return Object.freeze({
    outcome: prohibited.length === 0 ? "ADAPTER_ONLY_PASS" : "THIN_FORK_REQUIRED",
    digest,
    modelVisibleToolCount: visible.length,
    provenReadOnlyToolCount: provenReadOnly.length,
    kerniqIntentOnlyToolCount: intents.length,
    provenSideEffectToolCount: provenSideEffects.length,
    unclassifiedToolCount: unclassifiedTools.length,
    readOnlyToolCount: provenReadOnly.length,
    sideEffectToolCount: visible.filter((tool) => tool.sideEffectCapable).length,
    unknownToolCount: unclassifiedTools.length,
    prohibitedToolCallableCount: prohibited.length,
    tools: Object.freeze(tools),
  });
}

function provenReadOnly(input: ToolSurfaceInput, classificationReason: string): ToolSurfaceEntry {
  return Object.freeze({
    toolName: input.toolName,
    source: input.source,
    nativeOrDynamic: input.source === "kerniq_dynamic" ? "dynamic" : "native",
    classification: "proven_read_only",
    readOnly: true,
    sideEffectCapable: false,
    classificationReason,
    enabled: input.enabled ?? true,
    callable: input.callable ?? true,
  });
}

function provenSideEffect(
  input: ToolSurfaceInput,
  classificationReason: string,
): ToolSurfaceEntry {
  return Object.freeze({
    toolName: input.toolName,
    source: input.source,
    nativeOrDynamic: input.source === "kerniq_dynamic" ? "dynamic" : "native",
    classification: "proven_side_effect",
    readOnly: false,
    sideEffectCapable: true,
    classificationReason,
    enabled: input.enabled ?? true,
    callable: input.callable ?? true,
  });
}

function unclassified(input: ToolSurfaceInput, classificationReason: string): ToolSurfaceEntry {
  return Object.freeze({
    toolName: input.toolName,
    source: input.source,
    nativeOrDynamic: input.source === "kerniq_dynamic" ? "dynamic" : "native",
    classification: "unclassified_fail_closed",
    readOnly: false,
    sideEffectCapable: true,
    classificationReason,
    enabled: input.enabled ?? true,
    callable: input.callable ?? true,
  });
}

function isProhibited(tool: ToolSurfaceEntry): boolean {
  if (tool.classification === "kerniq_intent_only" || tool.classification === "proven_read_only") return false;
  return tool.classification === "proven_side_effect"
    || tool.classification === "unclassified_fail_closed"
    || tool.source === "codewhale_mcp"
    || tool.source === "codewhale_plugin"
    || PROHIBITED_PATTERNS.some((pattern) => pattern.test(tool.toolName));
}

function observedActionEnum(schema: unknown): readonly string[] | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties) || !isRecord(schema.properties.action)) return undefined;
  const values = schema.properties.action.enum;
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string")) {
    return undefined;
  }
  const actions = values as string[];
  return new Set(actions).size === actions.length ? actions : undefined;
}

function isNonEmptySubset(actions: readonly string[] | undefined, allowed: ReadonlySet<string>): boolean {
  return Boolean(actions && actions.length > 0 && actions.every((action) => allowed.has(action)));
}

function hasExactActions(actions: readonly string[] | undefined, expected: ReadonlySet<string>): boolean {
  return Boolean(actions && actions.length === expected.size && actions.every((action) => expected.has(action)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
