import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { RedactedSessionExport } from "@qodex/session-runtime";

export async function saveRedactedSessionExport(title: string, exported: RedactedSessionExport): Promise<boolean> {
  const json = `${JSON.stringify(exported, null, 2)}\n`;
  const fileName = `${safeFileName(title)}-kerniq-session.json`;
  if (isTauri()) {
    const path = await save({ defaultPath: fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return false;
    await writeTextFile(path, json);
    return true;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "session";
}
