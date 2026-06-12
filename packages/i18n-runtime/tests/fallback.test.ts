import { describe, it, expect, beforeEach } from "vitest";
import { FallbackEngine } from "../src/fallback/fallback.js";
import { LocaleRegistry } from "../src/registry/registry.js";
import type { TranslationBundle } from "../src/models/bundle.js";

function bundle(locale: string, ns: string, entries: Record<string, unknown>): TranslationBundle {
  return { locale, namespace: ns, entries: entries as Record<string, string> };
}

describe("FallbackEngine", () => {
  let reg: LocaleRegistry;
  let fb: FallbackEngine;

  beforeEach(() => {
    reg = new LocaleRegistry();
    reg.register({ code: "en", language: "en", label: "English", direction: "ltr" });
    reg.register({ code: "zh-CN", language: "zh", region: "CN", label: "中文", direction: "ltr" });
    fb = new FallbackEngine(reg);

    fb.loadBundle(bundle("en", "app", { hello: "Hello" }));
    fb.loadBundle(bundle("zh-CN", "app", { hello: "你好" }));
  });

  it("resolves translation in requested locale", () => {
    const r = fb.resolve("hello", "zh-CN", "app");
    expect(r.value).toBe("你好");
    expect(r.fallbackUsed).toBe(false);
  });

  it("falls back when key missing in target locale", () => {
    // only en has goodbye
    fb.loadBundle(bundle("en", "app", { hello: "Hello", goodbye: "Goodbye" }));
    const r = fb.resolve("goodbye", "zh-CN", "app");
    expect(r.value).toBe("Goodbye");
    expect(r.fallbackUsed).toBe(true);
  });

  it("strips region for fallback", () => {
    reg.register({ code: "zh", language: "zh", label: "中文", direction: "ltr" });
    fb.loadBundle(bundle("zh", "app", { hello: "哈啰" }));
    const r = fb.resolve("hello", "zh-TW", "app");
    expect(r.value).toBe("哈啰");
    expect(r.fallbackUsed).toBe(true);
  });

  it("falls back to en as last resort", () => {
    fb.loadBundle(bundle("en", "app", { only: "Only English" }));
    const r = fb.resolve("only", "zh-CN", "app");
    expect(r.value).toBe("Only English");
    expect(r.fallbackUsed).toBe(true);
  });

  it("returns key itself as absolute last resort", () => {
    const r = fb.resolve("nonexistent", "zh-CN", "app");
    expect(r.value).toBe("nonexistent");
  });

  it("resolves dot-notation nested keys", () => {
    fb.loadBundle(bundle("en", "app", { sidebar: { files: "Files" } }));
    const r = fb.resolve("sidebar.files", "en", "app");
    expect(r.value).toBe("Files");
  });
});
