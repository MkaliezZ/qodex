import { describe, expect, it, vi } from "vitest";
import {
  BRIDGE_PROTOCOL_VERSION,
  ManagedPythonRuntime,
  buildManagedPythonEnvironment,
  encodeBridgeMessage,
  parseBridgeMessage,
  parseRuntimeManifest,
  selectRuntimeArtifact,
  type ManagedPythonRuntimeInfo,
  type NativeManagedPythonBridge,
} from "../src/index.js";

const manifestFixture = {
  manifestVersion: "kerniq.python-runtime-manifest.v1",
  runtimeVersion: "20260718-cpython-3.12.13-agentfuse-af08d80",
  pythonVersion: "3.12.13",
  distribution: {
    publisher: "astral-sh/python-build-standalone",
    release: "20260718",
    license: "MIT",
    artifacts: [
      {
        platform: "macos",
        architecture: "x86_64",
        url: "https://example.test/python.tar.gz",
        archiveSha256: "1".repeat(64),
        installedTreeSha256: "2".repeat(64),
        archiveFormat: "tar.gz",
        expectedExecutable: "python/bin/python3",
      },
    ],
  },
  agentFuse: {
    repository: "MkaliezZ/dhms-engine",
    commit: "af08d80abaeb196da1e66d9e74c2d1c7002c9c2e",
    packageVersion: "3.5.1",
    url: "https://example.test/dhms.tar.gz",
    archiveSha256: "3".repeat(64),
    installedTreeSha256: "4".repeat(64),
    archiveFormat: "tar.gz",
    expectedModule: "dhms_agentfuse/runtime_guard.py",
  },
  bridge: {
    installedTreeSha256: "5".repeat(64),
  },
  bridgeProtocolVersion: "kerniq.agentfuse.bridge.v1",
  decisionSchemaVersion: "agentfuse-evidence-schema-v0.1",
  installedPackageLock: {
    mode: "verified-source-no-site-packages",
    packages: [],
  },
};

function info(
  state: ManagedPythonRuntimeInfo["state"],
  integrity: ManagedPythonRuntimeInfo["integrity"] = "unknown",
): ManagedPythonRuntimeInfo {
  return {
    state,
    runtimeVersion: manifestFixture.runtimeVersion,
    pythonVersion: state === "NotInstalled" ? null : "3.12.13",
    agentFuseCommit: manifestFixture.agentFuse.commit,
    bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
    integrity,
    lastVerifiedAt: integrity === "verified" ? "2026-07-24T00:00:00.000Z" : null,
    message: state,
  };
}

function native(initial: ManagedPythonRuntimeInfo): NativeManagedPythonBridge {
  let current = initial;
  return {
    inspectRuntime: vi.fn(async () => current),
    provisionRuntime: vi.fn(async () => {
      current = info("Ready", "verified");
      return current;
    }),
    verifyRuntime: vi.fn(async () => {
      current = info("Ready", "verified");
      return current;
    }),
    removeRuntime: vi.fn(async () => {
      current = info("NotInstalled", "not_installed");
      return current;
    }),
    selfCheck: vi.fn(async () => ({
      handshakeMatched: true,
      canonicalImport: true,
      allowDecision: "allow",
      denyDecision: "deny",
      denyHandlerInvocations: 0,
      agentFuseCommit: manifestFixture.agentFuse.commit,
      pythonVersion: "3.12.13",
      bridgeProtocolVersion: BRIDGE_PROTOCOL_VERSION,
    })),
  };
}

describe("managed Python manifest and orchestration", () => {
  it("parses a pinned trusted manifest and selects exact platform artifacts", () => {
    const manifest = parseRuntimeManifest(manifestFixture);
    expect(selectRuntimeArtifact(manifest, "macos", "x86_64")).toMatchObject({
      archiveSha256: "1".repeat(64),
      installedTreeSha256: "2".repeat(64),
      expectedExecutable: "python/bin/python3",
    });
  });

  it.each([
    [{ ...manifestFixture, manifestVersion: "latest" }],
    [{
      ...manifestFixture,
      agentFuse: { ...manifestFixture.agentFuse, commit: "main" },
    }],
    [{
      ...manifestFixture,
      distribution: {
        ...manifestFixture.distribution,
        artifacts: [{
          ...manifestFixture.distribution.artifacts[0],
          url: "http://example.test/python.tar.gz",
        }],
      },
    }],
    [{
      ...manifestFixture,
      installedPackageLock: {
        mode: "verified-source-no-site-packages",
        packages: ["unpinned"],
      },
    }],
  ])("rejects unpinned or unsafe manifest values", (candidate) => {
    expect(() => parseRuntimeManifest(candidate)).toThrowError(
      expect.objectContaining({ code: "invalid_manifest" }),
    );
  });

  it("fails closed for an unsupported platform", () => {
    const manifest = parseRuntimeManifest(manifestFixture);
    expect(() => selectRuntimeArtifact(manifest, "windows", "x86_64")).toThrowError(
      expect.objectContaining({ code: "unsupported_platform" }),
    );
  });

  it("provisions only after explicit orchestration from an installable state", async () => {
    const bridge = native(info("NotInstalled", "not_installed"));
    const runtime = new ManagedPythonRuntime(bridge);
    expect((await runtime.provisionRuntime()).state).toBe("Ready");
    expect(bridge.provisionRuntime).toHaveBeenCalledTimes(1);
  });

  it("does not auto-provision during inspection", async () => {
    const bridge = native(info("NotInstalled", "not_installed"));
    const runtime = new ManagedPythonRuntime(bridge);
    expect((await runtime.inspectRuntime()).state).toBe("NotInstalled");
    expect(bridge.provisionRuntime).not.toHaveBeenCalled();
  });

  it("repairs only a broken runtime", async () => {
    const brokenBridge = native(info("Broken", "failed"));
    expect((await new ManagedPythonRuntime(brokenBridge).repairRuntime()).state).toBe("Ready");
    const readyBridge = native(info("Ready", "verified"));
    await expect(new ManagedPythonRuntime(readyBridge).repairRuntime())
      .rejects.toMatchObject({ code: "invalid_state" });
  });

  it("requires verified Ready state for self-check", async () => {
    const unavailable = new ManagedPythonRuntime(native(info("Broken", "failed")));
    await expect(unavailable.selfCheck()).rejects.toMatchObject({ code: "runtime_unavailable" });
    const ready = new ManagedPythonRuntime(native(info("Ready", "verified")));
    expect((await ready.selfCheck()).denyHandlerInvocations).toBe(0);
  });

  it("removes only installed states through the native boundary", async () => {
    const bridge = native(info("Ready", "verified"));
    const runtime = new ManagedPythonRuntime(bridge);
    expect((await runtime.removeRuntime()).state).toBe("NotInstalled");
    expect(bridge.removeRuntime).toHaveBeenCalledTimes(1);
  });
});

describe("managed process contract helpers", () => {
  it("forwards only the environment allowlist and bridge-prefixed configuration", () => {
    const environment = buildManagedPythonEnvironment({
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      HOME: "/private/home",
      OPENAI_API_KEY: "secret",
      ANTHROPIC_API_KEY: "secret",
      AWS_SECRET_ACCESS_KEY: "secret",
      GITHUB_TOKEN: "secret",
      GH_TOKEN: "secret",
      SLACK_TOKEN: "secret",
      GOOGLE_APPLICATION_CREDENTIALS: "secret",
      DATABASE_URL: "secret",
    }, {
      KERNIQ_BRIDGE_PROTOCOL: BRIDGE_PROTOCOL_VERSION,
    });
    expect(environment).toEqual({
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      KERNIQ_BRIDGE_PROTOCOL: BRIDGE_PROTOCOL_VERSION,
      PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1",
    });
    expect(JSON.stringify(environment)).not.toContain("secret");
  });

  it("rejects bridge configuration outside the explicit prefix", () => {
    expect(() => buildManagedPythonEnvironment({}, { OPENAI_API_KEY: "secret" }))
      .toThrow("KERNIQ_BRIDGE_");
  });

  it("encodes and parses bounded protocol messages", () => {
    const message = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      messageId: "message-1",
      messageType: "health_check",
      payload: {},
    } as const;
    const encoded = encodeBridgeMessage(message);
    expect(parseBridgeMessage(encoded, "message-1")).toEqual(message);
  });

  it("rejects oversized, malformed, mismatched, and wrong-version messages", () => {
    const base = {
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      messageId: "message-1",
      messageType: "health_result",
      payload: {},
    } as const;
    expect(() => encodeBridgeMessage(base, 8)).toThrowError(
      expect.objectContaining({ code: "message_too_large" }),
    );
    expect(() => parseBridgeMessage("{", undefined)).toThrowError(
      expect.objectContaining({ code: "protocol_mismatch" }),
    );
    expect(() => parseBridgeMessage(JSON.stringify(base), "other")).toThrowError(
      expect.objectContaining({ code: "protocol_mismatch" }),
    );
    expect(() => parseBridgeMessage(JSON.stringify({
      ...base,
      protocolVersion: "future",
    }))).toThrowError(expect.objectContaining({ code: "protocol_mismatch" }));
  });
});
