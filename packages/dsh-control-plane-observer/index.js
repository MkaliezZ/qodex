import { appendFileSync } from "node:fs";

export const name = "kerniq-control-plane-observer";

function record(event) {
  const path = process.env.KERNIQ_DSH_EVIDENCE_PATH;
  if (!path) return;
  appendFileSync(path, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function identity(callId, toolName) {
  return {
    toolCallId: String(callId),
    toolName: String(toolName),
  };
}

export function apply(ctx) {
  ctx.on("session/event", (_session, event) => {
    if (event.type !== "tool/call") return;
    record({
      phase: "model_request",
      ...identity(event.data.callId, event.data.name),
      turn: event.data.turn,
      step: event.data.step,
    });
  });

  ctx.on("tools/pre-execute", async (exec, next) => {
    const base = {
      phase: "pre_execute",
      ...identity(exec.callId, exec.name),
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
    record({
      phase: "dispatch",
      ...identity(exec.callId, exec.name),
      observed: true,
    });
    return next();
  }, { prepend: true });

  ctx.on("tools/result", (exec, result) => {
    record({
      phase: "result",
      ...identity(exec.callId, exec.name),
      isError: result.isError,
      errorCode: result.error?.info?.code ?? null,
    });
  }, { prepend: true });
}
