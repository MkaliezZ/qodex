import { describe, expect, it } from "vitest";
import { InMemorySessionStore, SessionRuntime } from "../src/index.js";

function runtime() {
  let id = 0;
  return new SessionRuntime(new InMemorySessionStore(), () => new Date("2026-03-01T00:00:00Z"), () => `id-${++id}`);
}

describe("redacted session export", () => {
  it("exports deterministic active-path JSON without private binding paths or patch contents", async () => {
    const instance = runtime();
    await instance.upsertProjectBinding({
      bindingId: "binding-1",
      displayName: "private-project",
      privateRootPath: "/Users/person/secret/project",
      projectFingerprint: "fingerprint-1",
      lastOpenedAt: "2026-03-01T00:00:00Z",
    });
    const session = await instance.createSession({ title: "Export", projectBindingId: "binding-1" });
    await instance.appendEntry(session.id, {
      type: "PATCH_PROPOSED",
      payload: {
        actionId: "patch-1",
        summary: "Safe summary",
        files: [{ path: "src/a.ts", oldContent: "private old source", newContent: "private new source" }],
      },
      safeMetadata: { actionId: "patch-1" },
    });
    const first = await instance.exportRedactedSession(session.id);
    const second = await instance.exportRedactedSession(session.id);
    expect(first).toEqual(second);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("/Users/person/secret/project");
    expect(serialized).not.toContain("fingerprint-1");
    expect(serialized).not.toContain("private old source");
    expect(serialized).not.toContain("private new source");
    expect(serialized).toContain("private-project");
    expect(serialized).toContain("src/a.ts");
  });

  it("rejects API keys and authorization material before persistence", async () => {
    const instance = runtime();
    const session = await instance.createSession({ title: "Secrets" });
    await expect(instance.appendEntry(session.id, {
      type: "TOOL_COMPLETED",
      payload: { apiKey: "should-never-persist" },
    })).rejects.toThrow("not safe ledger metadata");
    await expect(instance.appendEntry(session.id, {
      type: "MODEL_MESSAGE",
      payload: { text: "Authorization: Bearer abcdefghijklmnop" },
    })).rejects.toThrow("credential value");
  });

  it("keeps project verification private and exact", async () => {
    const instance = runtime();
    await instance.upsertProjectBinding({
      bindingId: "binding-1",
      displayName: "project",
      privateRootPath: "/private/project",
      projectFingerprint: "fingerprint",
      lastOpenedAt: "2026-03-01T00:00:00Z",
    });
    expect(await instance.getProjectBinding("binding-1")).toEqual({
      bindingId: "binding-1",
      displayName: "project",
      projectFingerprint: "fingerprint",
      lastOpenedAt: "2026-03-01T00:00:00Z",
    });
    expect(await instance.verifyProjectBinding("binding-1", {
      privateRootPath: "/private/project",
      projectFingerprint: "fingerprint",
    })).toBe(true);
    expect(await instance.verifyProjectBinding("binding-1", {
      privateRootPath: "/other/project",
      projectFingerprint: "fingerprint",
    })).toBe(false);
  });
});
