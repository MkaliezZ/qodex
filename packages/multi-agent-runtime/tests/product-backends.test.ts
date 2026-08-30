import { describe, expect, it, vi } from "vitest";
import {
  CodexObservedBackend,
  DshGovernanceUnavailableError,
  DshGovernedBackend,
  classifyDshGovernanceTier,
  type AgentBackendTaskInput,
  type AgentProcessRuntimeProbe,
  type AgentProcessTaskTransport,
  type DshRuntimeProbe,
} from "../src/index.js";

describe("product agent backends", () => {
  it("admits available Codex as observed with no governance mode", async () => {
    const backend = new CodexObservedBackend(transport(codexProbe()));

    await expect(backend.probeCapabilities()).resolves.toMatchObject({
      version: "codex-cli 1.2.3",
      capabilities: {
        governanceTier: "OBSERVED",
        governanceMode: "none",
      },
    });
  });

  it("does not let Codex accept a governed task even when called directly", async () => {
    const runTask = vi.fn(async () => taskOutput());
    const backend = new CodexObservedBackend(transport(codexProbe(), runTask));

    await expect(backend.startTask(taskInput(true), () => {})).rejects.toThrow(
      "Codex cannot start a task that requires governed execution",
    );
    expect(runTask).not.toHaveBeenCalled();
  });

  it("admits DSH as governed only when every proven prerequisite is present", async () => {
    const backend = new DshGovernedBackend(transport(dshProbe()));

    await expect(backend.probeCapabilities()).resolves.toMatchObject({
      version: "0.1.2-alpha.1",
      capabilities: {
        governanceTier: "GOVERNED",
        governanceMode: "pre_dispatch_plugin",
      },
    });
  });

  it("classifies a runnable DSH with an incomplete evidence path as observed", () => {
    const probe = dshProbe({ evidenceCaptureAvailable: false });

    expect(classifyDshGovernanceTier(probe)).toBe("OBSERVED");
  });

  it("rechecks DSH admission at start and never silently downgrades", async () => {
    const initial = dshProbe();
    const drifted = dshProbe({ governedProfileValid: false });
    const runTask = vi.fn(async () => taskOutput());
    const probe = vi.fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(drifted);
    const backend = new DshGovernedBackend({ probe, runTask });

    await expect(backend.probeCapabilities()).resolves.toMatchObject({
      capabilities: { governanceTier: "GOVERNED" },
    });
    await expect(backend.startTask(taskInput(true), () => {})).rejects.toEqual(
      expect.objectContaining<Partial<DshGovernanceUnavailableError>>({
        name: "DshGovernanceUnavailableError",
        failedChecks: ["governed_profile"],
      }),
    );
    expect(runTask).not.toHaveBeenCalled();
  });

  it("permits an explicitly non-governed DSH task while reporting observed truth", async () => {
    const runTask = vi.fn(async () => taskOutput());
    const backend = new DshGovernedBackend(transport(
      dshProbe({ agentFuseAdapterAvailable: false }),
      runTask,
    ));

    await expect(backend.probeCapabilities()).resolves.toMatchObject({
      capabilities: { governanceTier: "OBSERVED" },
    });
    await expect(backend.startTask(taskInput(false), () => {})).resolves.toEqual(taskOutput());
    expect(runTask).toHaveBeenCalledOnce();
  });
});

function transport<Probe extends AgentProcessRuntimeProbe>(
  probe: Probe,
  runTask = vi.fn(async () => taskOutput()),
): AgentProcessTaskTransport<Probe> {
  return {
    async probe() { return probe; },
    runTask,
  };
}

function codexProbe(): AgentProcessRuntimeProbe {
  return {
    available: true,
    version: "codex-cli 1.2.3",
    supportsStreaming: true,
    supportsCancel: true,
    supportsToolEvents: true,
    supportsResume: false,
  };
}

function dshProbe(
  overrides: Partial<DshRuntimeProbe["governance"]> = {},
): DshRuntimeProbe {
  return {
    available: true,
    version: "0.1.2-alpha.1",
    runtimeRevision: "audited-revision",
    providerRoute: "deepseek-official",
    model: "deepseek-v4-flash",
    supportsStreaming: true,
    supportsCancel: false,
    supportsToolEvents: true,
    supportsResume: false,
    governance: {
      mode: "pre_dispatch_plugin",
      compatibleRuntime: true,
      agentFuseAdapterAvailable: true,
      preDispatchSeamAvailable: true,
      governedProfileValid: true,
      evidenceCaptureAvailable: true,
      ...overrides,
    },
  };
}

function taskInput(governanceRequired: boolean): AgentBackendTaskInput {
  return {
    taskId: "task-product",
    title: "Product review",
    workspace: "fixture",
    prompt: "Review safely.",
    workerRunId: "task-product:worker:1",
    governanceRequired,
  };
}

function taskOutput() {
  return {
    result: {
      findings: [{
        finding: "Bounded risk",
        evidence: "packages/example.ts:1",
        severity: "low" as const,
        smallestFix: "Keep the boundary.",
        files: ["packages/example.ts"],
      }],
      rawResultReference: "sha256:test",
    },
    governanceEvidence: [],
  };
}
