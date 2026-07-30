import { describe, expect, it, vi } from "vitest";
import type { TauriProjectBridge } from "./tauriBridge";
import {
  detectProjectEnvironment,
  openProjectDirectory,
} from "./openProjectDirectory";

function nativeBridge(selected: string | null = "/fixture"): TauriProjectBridge {
  return {
    pickDirectory: vi.fn(async () => selected),
    separator: () => "/",
    basename: vi.fn(async () => "fixture"),
    join: vi.fn(async (...paths) => paths.join("/")),
    normalize: vi.fn(async (path) => path),
    readDirectory: vi.fn(async () => []),
    readTextFile: vi.fn(async () => ""),
    readFileBytes: vi.fn(async () => new Uint8Array()),
    writeExistingTextFile: vi.fn(async () => undefined),
    exists: vi.fn(async () => true),
    stat: vi.fn(async () => ({
      isFile: false,
      isDirectory: true,
      isSymlink: false,
      size: 0,
    })),
    lstat: vi.fn(async () => ({
      isFile: false,
      isDirectory: true,
      isSymlink: false,
      size: 0,
    })),
  };
}

describe("project environment selection", () => {
  it("prefers Tauri when both native and browser APIs are present", async () => {
    const browserPicker = vi.fn();
    expect(detectProjectEnvironment({
      isTauriRuntime: () => true,
      browserHost: { showDirectoryPicker: browserPicker },
    })).toBe("tauri");

    const opened = await openProjectDirectory({
      isTauriRuntime: () => true,
      browserHost: { showDirectoryPicker: browserPicker },
      tauriBridge: nativeBridge(),
    });
    expect(opened).toMatchObject({ name: "fixture", source: "tauri" });
    expect(browserPicker).not.toHaveBeenCalled();
  });

  it("uses the browser adapter outside Tauri", async () => {
    const handle = { name: "browser-fixture" } as FileSystemDirectoryHandle;
    const opened = await openProjectDirectory({
      isTauriRuntime: () => false,
      browserHost: { showDirectoryPicker: vi.fn(async () => handle) },
    });
    expect(opened).toMatchObject({ name: "browser-fixture", source: "browser" });
  });

  it("reports unsupported environments", async () => {
    expect(detectProjectEnvironment({ isTauriRuntime: () => false, browserHost: {} })).toBe("unsupported");
    await expect(openProjectDirectory({ isTauriRuntime: () => false, browserHost: {} })).rejects.toMatchObject({
      code: "write_target_unavailable",
    });
  });

  it("treats native dialog cancellation as no state change", async () => {
    const bridge = nativeBridge(null);
    await expect(openProjectDirectory({ isTauriRuntime: () => true, tauriBridge: bridge })).resolves.toBeNull();
    expect(bridge.readDirectory).not.toHaveBeenCalled();
  });

  it("treats browser dialog cancellation as no state change", async () => {
    const cancelled = Object.assign(new Error("cancelled"), { name: "AbortError" });
    await expect(openProjectDirectory({
      isTauriRuntime: () => false,
      browserHost: { showDirectoryPicker: vi.fn(async () => { throw cancelled; }) },
    })).resolves.toBeNull();
  });
});
