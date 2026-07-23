import { describe, expect, it, vi } from "vitest";
import type { SessionEntry, SessionMutation, SessionRecord } from "@qodex/session-runtime";
import { TauriSessionStore, type TauriSessionInvoker } from "./tauriSessionStore";

const session: SessionRecord = {
  id: "session-1",
  schemaVersion: 1,
  title: "Session",
  status: "Active",
  activeLeafId: "entry-1",
  projectBindingId: null,
  providerId: null,
  modelId: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  completedAt: null,
};

const entry: SessionEntry = {
  id: "entry-1",
  sessionId: "session-1",
  parentEntryId: null,
  sequence: 1,
  type: "SESSION_CREATED",
  payloadVersion: 1,
  payload: {},
  safeMetadata: {},
  createdAt: "2026-01-01T00:00:00Z",
};

describe("TauriSessionStore", () => {
  it("routes create and append through typed native transactions", async () => {
    const invoke = vi.fn(async () => undefined);
    const store = new TauriSessionStore(invoke as unknown as TauriSessionInvoker);
    await store.createSession(session, entry);
    const mutation: SessionMutation = {
      activeLeafId: "entry-2",
      status: "Active",
      updatedAt: "2026-01-01T00:00:01Z",
      completedAt: null,
    };
    await store.appendEntry({ ...entry, id: "entry-2", parentEntryId: "entry-1", sequence: 2 }, mutation);
    expect(invoke).toHaveBeenNthCalledWith(1, "session_store_create", { request: { session, firstEntry: entry } });
    expect(invoke).toHaveBeenNthCalledWith(2, "session_store_append", {
      request: { entry: { ...entry, id: "entry-2", parentEntryId: "entry-1", sequence: 2 }, mutation },
    });
  });

  it("keeps project binding verification and private input on dedicated commands", async () => {
    const invoke = vi.fn(async (command: string) => command === "session_binding_verify");
    const store = new TauriSessionStore(invoke as unknown as TauriSessionInvoker);
    expect(await store.verifyProjectBinding("binding-1", {
      privateRootPath: "/private/project",
      projectFingerprint: "sha256:fixture",
    })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("session_binding_verify", {
      bindingId: "binding-1",
      candidate: { privateRootPath: "/private/project", projectFingerprint: "sha256:fixture" },
    });
  });
});
