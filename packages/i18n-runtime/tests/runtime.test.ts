import { describe, it, expect, beforeEach } from "vitest";
import { I18nRuntime } from "../src/runtime/runtime.js";

describe("I18nRuntime", () => {
  let rt: I18nRuntime;

  beforeEach(() => { rt = new I18nRuntime(); });

  it("defaults to en", () => {
    expect(rt.getCurrentLocale()).toBe("en");
  });

  it("lists built-in locales", () => {
    expect(rt.listLocales().map((l) => l.code)).toEqual(expect.arrayContaining(["en", "zh-CN"]));
  });

  it("switches locale", () => {
    rt.setLocale("zh-CN");
    expect(rt.getCurrentLocale()).toBe("zh-CN");
  });

  it("throws on unknown locale", () => {
    expect(() => rt.setLocale("ja")).toThrow("Unknown locale");
  });

  it("translates with loaded bundles", () => {
    rt.loadBundle({
      locale: "en", namespace: "app",
      entries: { sidebar: { files: "Files", sessions: "Sessions" } },
    });
    expect(rt.t("sidebar.files")).toBe("Files");
    expect(rt.t("sidebar.sessions")).toBe("Sessions");
  });

  it("translates with zh-CN locale after switching", () => {
    rt.loadBundle({ locale: "en", namespace: "app", entries: { hello: "Hello" } });
    rt.loadBundle({ locale: "zh-CN", namespace: "app", entries: { hello: "你好" } });

    expect(rt.t("hello")).toBe("Hello");
    rt.setLocale("zh-CN");
    expect(rt.t("hello")).toBe("你好");
  });

  it("falls back to en when zh-CN missing key", () => {
    rt.loadBundle({ locale: "en", namespace: "app", entries: { hello: "Hello", world: "World" } });
    rt.loadBundle({ locale: "zh-CN", namespace: "app", entries: { hello: "你好" } });

    rt.setLocale("zh-CN");
    expect(rt.t("hello")).toBe("你好");
    expect(rt.t("world")).toBe("World"); // fallback to en
  });

  it("emits locale:changed event", () => {
    const events: string[] = [];
    rt.onChange((e) => events.push(e.type));
    rt.setLocale("zh-CN");
    expect(events).toContain("locale:changed");
  });

  it("emits bundle:loaded event", () => {
    const events: string[] = [];
    rt.onChange((e) => events.push(e.type));
    rt.loadBundle({ locale: "en", namespace: "app", entries: { hello: "Hello" } });
    expect(events).toContain("bundle:loaded");
  });

  it("getLocalizedName resolves skill metadata", () => {
    rt.loadBundle({ locale: "en", namespace: "skills", entries: { react: { name: "React", description: "React patterns" } } });
    rt.loadBundle({ locale: "zh-CN", namespace: "skills", entries: { react: { name: "React框架", description: "React模式" } } });

    expect(rt.getLocalizedName("react")).toBe("React");
    rt.setLocale("zh-CN");
    expect(rt.getLocalizedName("react")).toBe("React框架");
  });

  it("exports and imports bundles", () => {
    rt.loadBundle({ locale: "en", namespace: "app", entries: { hello: "Hello" } });
    const bundles = rt.exportBundles("en");
    expect(bundles.length).toBe(1);

    const rt2 = new I18nRuntime();
    rt2.importBundles(bundles);
    expect(rt2.t("hello")).toBe("Hello");
  });

  it("resolves locale from preferences", () => {
    expect(rt.resolveLocale({ user: "zh-CN" })).toBe("zh-CN");
    expect(rt.resolveLocale({ user: "ja" })).toBe("en");
  });

  it("validateBundles detects missing keys", () => {
    rt.loadBundle({ locale: "en", namespace: "app", entries: { hello: "Hello", world: "World" } });
    rt.loadBundle({ locale: "zh-CN", namespace: "app", entries: { hello: "你好" } });
    const missing = rt.validateBundles();
    expect(missing.has("zh-CN")).toBe(true);
    expect(missing.get("zh-CN")!).toContain("app.world");
  });
});
