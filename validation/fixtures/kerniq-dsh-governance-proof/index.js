import { appendFileSync, writeFileSync } from "node:fs";

export const name = "kerniq-governance-proof";
export const inject = ["tools"];

const TOOL_NAME = "kerniq_write_probe";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required proof environment variable: ${name}`);
  return value;
}

function record(event) {
  appendFileSync(
    requiredEnv("KERNIQ_DSH_EVIDENCE_PATH"),
    `${JSON.stringify(event)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

export function apply(ctx) {
  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name !== TOOL_NAME) return next();
    const base = {
      phase: "pre_execute",
      toolCallId: String(exec.callId),
      toolName: exec.name,
    };
    record({ ...base, observed: true });
    try {
      const decision = await next();
      record({ ...base, decision: decision.kind });
      return decision;
    } catch (error) {
      record({
        ...base,
        decision: "error",
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  }, { prepend: true });

  ctx.on("tools/execute", async (exec, next) => {
    if (exec.name !== TOOL_NAME) return next();
    record({
      phase: "dispatch",
      toolCallId: String(exec.callId),
      toolName: exec.name,
      observed: true,
    });
    return next();
  }, { prepend: true });

  ctx.on("tools/result", (exec, result) => {
    if (exec.name !== TOOL_NAME) return;
    record({
      phase: "result",
      toolCallId: String(exec.callId),
      toolName: exec.name,
      isError: result.isError,
      errorCode: result.error?.info?.code ?? null,
    });
  }, { prepend: true });

  ctx.tools.register({
    name: TOOL_NAME,
    description: "Write one fixed harmless governance proof marker. Call exactly once when explicitly requested.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        content: {
          type: "string",
          description: "The exact proof token supplied by the user.",
        },
      },
      required: ["content"],
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { written: { type: "boolean" } },
        required: ["written"],
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const expectedContent = requiredEnv("KERNIQ_DSH_EXPECTED_CONTENT");
      if (args?.content !== expectedContent) throw new Error("proof token mismatch");
      writeFileSync(
        requiredEnv("KERNIQ_DSH_BODY_MARKER_PATH"),
        `${String(exec.callId)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      writeFileSync(
        requiredEnv("KERNIQ_DSH_TARGET_PATH"),
        `${expectedContent}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      return { written: true };
    },
  });
}
