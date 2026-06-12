import { describe, it, expect } from "vitest";
import { SourceManager, validateSource } from "../../src/registry/source.js";

describe("SourceManager", () => {
  it("adds valid source", () => {
    const sm = new SourceManager();
    sm.add({ id: "s1", name: "Test", url: "https://example.com", enabled: true, priority: 0 });
    expect(sm.list().length).toBe(1);
  });

  it("rejects duplicate source", () => {
    const sm = new SourceManager();
    sm.add({ id: "s1", name: "A", url: "https://a.com", enabled: true, priority: 0 });
    expect(() => sm.add({ id: "s1", name: "B", url: "https://b.com", enabled: true, priority: 0 })).toThrow("already exists");
  });

  it("removes source", () => {
    const sm = new SourceManager();
    sm.add({ id: "s1", name: "T", url: "https://t.com", enabled: true, priority: 0 });
    expect(sm.remove("s1")).toBe(true);
    expect(sm.list().length).toBe(0);
    expect(sm.remove("nope")).toBe(false);
  });

  it("lists enabled sources only", () => {
    const sm = new SourceManager();
    sm.add({ id: "a", name: "A", url: "https://a.com", enabled: true, priority: 0 });
    sm.add({ id: "b", name: "B", url: "https://b.com", enabled: false, priority: 0 });
    expect(sm.listEnabled().length).toBe(1);
  });
});

describe("validateSource", () => {
  it("rejects file:// URL", () => {
    expect(validateSource({ id: "s", name: "S", url: "file:///etc/passwd" }).valid).toBe(false);
  });

  it("rejects http:// URL", () => {
    expect(validateSource({ id: "s", name: "S", url: "http://example.com" }).valid).toBe(false);
  });

  it("rejects javascript: URL", () => {
    expect(validateSource({ id: "s", name: "S", url: "javascript:alert(1)" }).valid).toBe(false);
  });

  it("accepts HTTPS URL", () => {
    expect(validateSource({ id: "s", name: "S", url: "https://example.com" }).valid).toBe(true);
  });
});
