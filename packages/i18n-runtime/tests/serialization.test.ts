import { describe, it, expect } from "vitest";
import { validateBundle, detectMissingKeys } from "../src/validation/validation.js";
import type { TranslationBundle } from "../src/models/bundle.js";

describe("Validation", () => {
  it("validates a complete bundle", () => {
    const r = validateBundle({ locale: "en", namespace: "app", entries: { hello: "Hello" } });
    expect(r.valid).toBe(true);
  });

  it("detects missing fields", () => {
    const r = validateBundle({ locale: "", namespace: "app", entries: {} });
    expect(r.valid).toBe(false);
  });

  it("detects missing translations", () => {
    const base: TranslationBundle = { locale: "en", namespace: "app", entries: { a: { x: "X", y: "Y" } } };
    const target: TranslationBundle = { locale: "zh-CN", namespace: "app", entries: { a: { x: "中文X" } } };
    const missing = detectMissingKeys(base, target);
    expect(missing).toContain("a.y");
    expect(missing.length).toBe(1);
  });

  it("returns empty when all keys present", () => {
    const base: TranslationBundle = { locale: "en", namespace: "app", entries: { hello: "Hello" } };
    const target: TranslationBundle = { locale: "zh-CN", namespace: "app", entries: { hello: "你好" } };
    expect(detectMissingKeys(base, target)).toHaveLength(0);
  });
});
