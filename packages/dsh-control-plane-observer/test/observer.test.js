import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { apply, name } from "../index.js";

test("observes model requests and execution lifecycle without registering tools", async () => {
  const root = mkdtempSync(join(tmpdir(), "kerniq-observer-"));
  const evidencePath = join(root, "evidence.jsonl");
  const previousPath = process.env.KERNIQ_DSH_EVIDENCE_PATH;
  process.env.KERNIQ_DSH_EVIDENCE_PATH = evidencePath;
  const handlers = new Map();
  const ctx = {
    on(event, handler) {
      handlers.set(event, handler);
    },
  };

  try {
    apply(ctx);
    assert.equal(name, "kerniq-control-plane-observer");
    assert.deepEqual([...handlers.keys()], [
      "session/event",
      "tools/pre-execute",
      "tools/execute",
      "tools/result",
    ]);

    const exec = { callId: "call-7", name: "read" };
    handlers.get("session/event")({}, {
      type: "tool/call",
      data: { callId: "call-7", name: "read", turn: 2, step: 1 },
    });
    assert.deepEqual(
      await handlers.get("tools/pre-execute")(exec, async () => ({ kind: "allow" })),
      { kind: "allow" },
    );
    await handlers.get("tools/execute")(exec, async () => ({ isError: false }));
    handlers.get("tools/result")(exec, { isError: false });

    const events = readFileSync(evidencePath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.phase), [
      "model_request",
      "pre_execute",
      "pre_execute",
      "dispatch",
      "result",
    ]);
    assert.ok(events.every((event) => event.toolCallId === "call-7"));
  } finally {
    if (previousPath === undefined) delete process.env.KERNIQ_DSH_EVIDENCE_PATH;
    else process.env.KERNIQ_DSH_EVIDENCE_PATH = previousPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("loads without diagnostic marker environment variables", () => {
  const previousPath = process.env.KERNIQ_DSH_EVIDENCE_PATH;
  delete process.env.KERNIQ_DSH_EVIDENCE_PATH;
  const ctx = { on() {} };
  try {
    assert.doesNotThrow(() => apply(ctx));
  } finally {
    if (previousPath !== undefined) process.env.KERNIQ_DSH_EVIDENCE_PATH = previousPath;
  }
});
