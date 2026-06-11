import { describe, it, expect } from "vitest";
import { InMemorySessionStore } from "../src/sessions/store.js";

describe("InMemorySessionStore", () => {
  it("creates a session", () => {
    const store = new InMemorySessionStore();
    const session = store.create("Test Session");
    expect(session.title).toBe("Test Session");
    expect(session.id).toBeTruthy();
    expect(session.createdAt).toBeTruthy();
  });

  it("retrieves a session by id", () => {
    const store = new InMemorySessionStore();
    const created = store.create("Find Me");
    const found = store.get(created.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Find Me");
  });

  it("returns undefined for missing session", () => {
    const store = new InMemorySessionStore();
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("lists all sessions", () => {
    const store = new InMemorySessionStore();
    store.create("S1");
    store.create("S2");
    store.create("S3");
    expect(store.list()).toHaveLength(3);
  });

  it("removes a session", () => {
    const store = new InMemorySessionStore();
    const session = store.create("Remove Me");
    expect(store.remove(session.id)).toBe(true);
    expect(store.get(session.id)).toBeUndefined();
  });

  it("clear removes all sessions", () => {
    const store = new InMemorySessionStore();
    store.create("A");
    store.create("B");
    store.clear();
    expect(store.size).toBe(0);
  });
});
