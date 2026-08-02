import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  available: false,
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
  isTauri: () => tauri.available,
}));

import {
  CodingPackNativeExportError,
  codingPackNativeExportAvailability,
  exportCodingPackNative,
  isCodingPackNativeExportAvailable,
} from "./codingPackNativeExport";

const request = {
  operationId: "operation-1",
  exportAttemptId: "export-attempt-1",
  canonicalManifestJson: "{\"manifestDigest\":\"portable\"}",
  projectBindingId: "project-1",
};

describe("native Coding Pack export boundary", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    tauri.available = false;
    tauri.invoke.mockReset();
  });

  it("fails Windows native export closed without invoking the command", async () => {
    tauri.available = true;
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0)" });
    expect(codingPackNativeExportAvailability()).toBe("platform_unsupported");
    await expect(exportCodingPackNative(request)).rejects.toMatchObject({
      code: "coding_pack_native_atomic_export_unsupported",
    });
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it("fails browser export closed without invoking any write command", async () => {
    expect(isCodingPackNativeExportAvailable()).toBe(false);
    await expect(exportCodingPackNative(request)).rejects.toEqual(
      new CodingPackNativeExportError("coding_pack_native_desktop_required"),
    );
    expect(tauri.invoke).not.toHaveBeenCalled();
  });

  it("invokes only the narrow opaque native request", async () => {
    tauri.available = true;
    const result = {
      operationId: "operation-1",
      exportAttemptId: "export-attempt-1",
      exportPlanDigest: `sha256:${"1".repeat(64)}`,
      manifestDigest: `sha256:${"2".repeat(64)}`,
      targetName: `kerniq-coding-pack-${"2".repeat(64)}`,
      sourceFileCount: 1,
      sourceTotalBytes: 27,
      completedAt: "2026-07-30T00:00:03.000Z",
    };
    tauri.invoke.mockResolvedValue(result);

    await expect(exportCodingPackNative(request)).resolves.toEqual(result);
    expect(tauri.invoke).toHaveBeenCalledWith("coding_pack_export_native", { request });
    expect(JSON.stringify(tauri.invoke.mock.calls)).not.toContain("absoluteDestination");
    expect(JSON.stringify(tauri.invoke.mock.calls)).not.toContain("absoluteProjectPath");
    expect(JSON.stringify(tauri.invoke.mock.calls)).not.toContain("shell");
  });

  it("preserves the completion-persistence uncertainty classification", async () => {
    tauri.available = true;
    tauri.invoke.mockRejectedValue("coding_pack_export_completion_persistence_failed");
    await expect(exportCodingPackNative(request)).rejects.toMatchObject({
      code: "coding_pack_export_completion_persistence_failed",
    });
  });

  it("preserves post-promotion durability uncertainty", async () => {
    tauri.available = true;
    tauri.invoke.mockRejectedValue(
      "coding_pack_export_post_promotion_durability_uncertain",
    );
    await expect(exportCodingPackNative(request)).rejects.toMatchObject({
      code: "coding_pack_export_post_promotion_durability_uncertain",
    });
  });
});
