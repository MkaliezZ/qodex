import { describe, expect, it } from "vitest";
import projectAccess from "../../src-tauri/capabilities/project-access.json";

describe("Tauri project access capability", () => {
  it("grants only the commands needed for selected-project access", () => {
    expect(projectAccess.permissions).toEqual([
      "core:path:default",
      "core:resources:allow-close",
      "dialog:allow-open",
      "fs:allow-exists",
      "fs:allow-lstat",
      "fs:allow-open",
      "fs:allow-read-dir",
      "fs:allow-read-text-file",
      "fs:allow-stat",
      "fs:allow-write",
    ]);

    expect(projectAccess.permissions.some((permission) => permission.startsWith("shell:"))).toBe(false);
    expect(JSON.stringify(projectAccess)).not.toMatch(/\$HOME|[A-Z]:\\|\/\*\*/);
  });
});
