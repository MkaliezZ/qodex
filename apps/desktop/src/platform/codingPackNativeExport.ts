import { invoke, isTauri } from "@tauri-apps/api/core";

export type CodingPackNativeExportErrorCode =
  | "coding_pack_native_desktop_required"
  | "coding_pack_native_atomic_export_unsupported"
  | "coding_pack_export_authority_invalid"
  | "coding_pack_export_completion_persistence_failed"
  | "coding_pack_export_post_promotion_durability_uncertain"
  | "coding_pack_export_failed";

export type CodingPackNativeExportAvailability =
  | "available"
  | "desktop_required"
  | "platform_unsupported";

export class CodingPackNativeExportError extends Error {
  constructor(readonly code: CodingPackNativeExportErrorCode) {
    super(code);
    this.name = "CodingPackNativeExportError";
  }
}

export interface CodingPackNativeExportRequest {
  readonly operationId: string;
  readonly exportAttemptId: string;
  readonly canonicalManifestJson: string;
  readonly projectBindingId: string;
}

export interface CodingPackNativeExportResult {
  readonly operationId: string;
  readonly exportAttemptId: string;
  readonly exportPlanDigest: string;
  readonly manifestDigest: string;
  readonly targetName: string;
  readonly sourceFileCount: number;
  readonly sourceTotalBytes: number;
  readonly completedAt: string;
}

export function isCodingPackNativeExportAvailable(): boolean {
  return codingPackNativeExportAvailability() === "available";
}

export function codingPackNativeExportAvailability(): CodingPackNativeExportAvailability {
  if (!isTauri()) return "desktop_required";
  if (
    typeof navigator !== "undefined"
    && /Windows/u.test(navigator.userAgent)
  ) {
    return "platform_unsupported";
  }
  return "available";
}

export async function exportCodingPackNative(
  request: CodingPackNativeExportRequest,
): Promise<CodingPackNativeExportResult> {
  const availability = codingPackNativeExportAvailability();
  if (availability !== "available") {
    throw new CodingPackNativeExportError(
      availability === "platform_unsupported"
        ? "coding_pack_native_atomic_export_unsupported"
        : "coding_pack_native_desktop_required",
    );
  }
  try {
    return await invoke<CodingPackNativeExportResult>("coding_pack_export_native", { request });
  } catch (error) {
    const message = typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
    if (message.includes("coding_pack_export_completion_persistence_failed")) {
      throw new CodingPackNativeExportError(
        "coding_pack_export_completion_persistence_failed",
      );
    }
    if (message.includes("coding_pack_export_post_promotion_durability_uncertain")) {
      throw new CodingPackNativeExportError(
        "coding_pack_export_post_promotion_durability_uncertain",
      );
    }
    if (message.includes("coding_pack_native_atomic_export_unsupported")) {
      throw new CodingPackNativeExportError(
        "coding_pack_native_atomic_export_unsupported",
      );
    }
    throw new CodingPackNativeExportError("coding_pack_export_failed");
  }
}
