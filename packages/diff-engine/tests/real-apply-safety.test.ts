import { describe, expect, it } from "vitest";
import { DiffEngine } from "../src/engine.js";

function proposal(engine: DiffEngine, files = [
  { path: "src/a.ts", oldContent: "old a", newContent: "new a" },
]) {
  return engine.createProposal("task", "Apply safely", files);
}

describe("real apply safety", () => {
  it("fails when no write target is configured", async () => {
    const engine = new DiffEngine();
    const results = await engine.apply(proposal(engine));
    expect(results[0]).toMatchObject({ success: false, code: "write_target_unavailable" });
  });

  it("detects stale content before writing", async () => {
    const store = new Map([["src/a.ts", "newer user content"]]);
    let writes = 0;
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (path: string, content: string) => { writes += 1; store.set(path, content); },
    };
    const engine = new DiffEngine(target, target);
    const results = await engine.apply(proposal(engine));
    expect(results[0]).toMatchObject({ success: false, code: "content_mismatch" });
    expect(writes).toBe(0);
  });

  it("writes and verifies replacement content", async () => {
    const store = new Map([["src/a.ts", "old a"]]);
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (path: string, content: string) => { store.set(path, content); },
    };
    const engine = new DiffEngine(target, target);
    const results = await engine.apply(proposal(engine));
    expect(results[0]).toMatchObject({ success: true, readbackVerified: true });
    expect(store.get("src/a.ts")).toBe("new a");
  });

  it("reports a write failure and leaves the original content", async () => {
    const store = new Map([["src/a.ts", "old a"]]);
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (_path: string, content: string) => {
        if (content === "new a") throw new Error("disk denied write");
      },
    };
    const engine = new DiffEngine(target, target);
    const results = await engine.apply(proposal(engine));
    expect(results[0]).toMatchObject({ success: false, code: "write_failed", rollbackSucceeded: true });
    expect(store.get("src/a.ts")).toBe("old a");
  });

  it("reports verification mismatch and restores the original", async () => {
    const store = new Map([["src/a.ts", "old a"]]);
    let corruptReadback = false;
    const target = {
      readFile: async (path: string) => corruptReadback ? "corrupt" : store.get(path) ?? "",
      writeFile: async (path: string, content: string) => {
        store.set(path, content);
        corruptReadback = content === "new a";
      },
    };
    const engine = new DiffEngine(target, target);
    const results = await engine.apply(proposal(engine));
    expect(results[0]).toMatchObject({
      success: false,
      code: "write_verification_failed",
      rollbackSucceeded: true,
    });
    expect(store.get("src/a.ts")).toBe("old a");
  });

  it("preflights every file and prevents partial writes", async () => {
    const store = new Map([
      ["src/a.ts", "old a"],
      ["src/b.ts", "changed b"],
    ]);
    let writes = 0;
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (path: string, content: string) => { writes += 1; store.set(path, content); },
    };
    const engine = new DiffEngine(target, target);
    const patch = proposal(engine, [
      { path: "src/a.ts", oldContent: "old a", newContent: "new a" },
      { path: "src/b.ts", oldContent: "old b", newContent: "new b" },
    ]);
    const results = await engine.apply(patch);
    expect(results.some((result) => result.code === "content_mismatch")).toBe(true);
    expect(writes).toBe(0);
    expect(store.get("src/a.ts")).toBe("old a");
  });

  it("restores earlier files when another file changes during apply", async () => {
    const store = new Map([
      ["src/a.ts", "old a"],
      ["src/b.ts", "old b"],
    ]);
    const reads = new Map<string, number>();
    const target = {
      readFile: async (path: string) => {
        const count = (reads.get(path) ?? 0) + 1;
        reads.set(path, count);
        if (path === "src/b.ts" && count === 3) store.set(path, "newer b");
        return store.get(path) ?? "";
      },
      writeFile: async (path: string, content: string) => { store.set(path, content); },
    };
    const engine = new DiffEngine(target, target);
    const patch = proposal(engine, [
      { path: "src/a.ts", oldContent: "old a", newContent: "new a" },
      { path: "src/b.ts", oldContent: "old b", newContent: "new b" },
    ]);

    const results = await engine.apply(patch);

    expect(results.some((result) => result.code === "content_mismatch")).toBe(true);
    expect(store.get("src/a.ts")).toBe("old a");
    expect(store.get("src/b.ts")).toBe("newer b");
  });

  it("rolls back exact original content with readback verification", async () => {
    const original = "line one\nline two\n";
    const store = new Map([["src/a.ts", original]]);
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (path: string, content: string) => { store.set(path, content); },
    };
    const engine = new DiffEngine(target, target);
    const patch = proposal(engine, [{ path: "src/a.ts", oldContent: original, newContent: "replacement" }]);
    expect((await engine.apply(patch))[0].success).toBe(true);
    const results = await engine.rollback(patch);
    expect(results[0]).toMatchObject({ success: true, readbackVerified: true, rollbackSucceeded: true });
    expect(store.get("src/a.ts")).toBe(original);
  });

  it("reports rollback failure", async () => {
    const store = new Map([["src/a.ts", "old a"]]);
    let failRollback = false;
    const target = {
      readFile: async (path: string) => store.get(path) ?? "",
      writeFile: async (path: string, content: string) => {
        if (failRollback && content === "old a") throw new Error("rollback denied");
        store.set(path, content);
      },
    };
    const engine = new DiffEngine(target, target);
    const patch = proposal(engine);
    expect((await engine.apply(patch))[0].success).toBe(true);
    failRollback = true;
    const results = await engine.rollback(patch);
    expect(results[0]).toMatchObject({ success: false, code: "rollback_failed" });
  });
});
