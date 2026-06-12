import { describe, it, expect, beforeEach } from "vitest";
import { I18nRuntime } from "../src/runtime/runtime.js";
import { LocaleRegistry } from "../src/registry/registry.js";
import { LocaleResolver } from "../src/resolver/resolver.js";

describe("LocaleRegistry", () => {
  let r: LocaleRegistry;
  beforeEach(() => { r = new LocaleRegistry(); });

  it("registers and retrieves locales", () => {
    r.register({ code: "ja", language: "ja", label: "日本語", direction: "ltr" });
    expect(r.get("ja")?.label).toBe("日本語");
    expect(r.has("ja")).toBe(true);
  });

  it("lists all registered locales", () => {
    r.register({ code: "en", language: "en", label: "English", direction: "ltr" });
    r.register({ code: "fr", language: "fr", label: "Français", direction: "ltr" });
    expect(r.list().length).toBe(2);
  });

  it("removes a locale", () => {
    r.register({ code: "de", language: "de", label: "Deutsch", direction: "ltr" });
    expect(r.remove("de")).toBe(true);
    expect(r.has("de")).toBe(false);
    expect(r.remove("xx")).toBe(false);
  });

  it("returns undefined for unknown locale", () => {
    expect(r.get("zz")).toBeUndefined();
  });

  it("default locale is en", () => {
    expect(r.getDefault()).toBe("en");
    r.setDefault("zh-CN");
    expect(r.getDefault()).toBe("zh-CN");
  });
});

describe("LocaleResolver", () => {
  let reg: LocaleRegistry;
  let resolver: LocaleResolver;

  beforeEach(() => {
    reg = new LocaleRegistry();
    reg.register({ code: "en", language: "en", label: "English", direction: "ltr" });
    reg.register({ code: "zh-CN", language: "zh", region: "CN", label: "中文", direction: "ltr" });
    resolver = new LocaleResolver(reg);
  });

  it("resolves exact match", () => {
    expect(resolver.resolve({ user: "zh-CN" })).toBe("zh-CN");
  });

  it("falls back user→project→system→default", () => {
    expect(resolver.resolve({ user: "ja" })).toBe("en");
  });

  it("strips region for fallback", () => {
    reg.register({ code: "zh", language: "zh", label: "中文(通用)", direction: "ltr" });
    expect(resolver.resolve({ user: "zh-TW" })).toBe("zh");
  });

  it("handles underscore format", () => {
    reg.register({ code: "zh", language: "zh", label: "中文", direction: "ltr" });
    expect(resolver.resolve({ user: "zh_CN" })).toBe("zh");
  });

  it("returns default when nothing matches", () => {
    expect(resolver.resolve({})).toBe("en");
  });

  it("project preference overrides system", () => {
    expect(resolver.resolve({ project: "zh-CN", system: "en" })).toBe("zh-CN");
  });

  it("user preference wins over everything", () => {
    reg.register({ code: "fr", language: "fr", label: "Français", direction: "ltr" });
    expect(resolver.resolve({ user: "fr", project: "zh-CN", system: "en" })).toBe("fr");
  });
});
