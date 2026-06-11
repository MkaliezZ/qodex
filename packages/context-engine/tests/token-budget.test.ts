import { describe, it, expect } from "vitest";
import { TokenEstimator } from "../src/budget/estimator.js";

describe("TokenEstimator - Extended", () => {
  const estimator = new TokenEstimator();

  it("estimates long text", () => {
    const text = "a".repeat(1000);
    expect(estimator.estimate(text)).toBe(250); // ceil(1000/4) = 250
  });

  it("estimates mixed CJK and ASCII", () => {
    const text = "你好Hello世界World";
    const count = estimator.estimate(text);
    // 4 CJK = 2 tokens, 10 ASCII = 3 tokens, total = 5
    expect(count).toBe(5);
  });

  it("estimateTotal is sum of parts", () => {
    const parts = ["Hello", " world", " from", " Qodex"];
    const total = estimator.estimateTotal(parts);
    const sum = parts.reduce((s, p) => s + estimator.estimate(p), 0);
    expect(total).toBe(sum);
  });

  it("handles special characters", () => {
    const text = "!@#$%^&*()_+\n\t";
    expect(estimator.estimate(text)).toBeGreaterThan(0);
  });

  it("handles very large text", () => {
    const text = "Hello World\n".repeat(1000);
    expect(estimator.estimate(text)).toBeGreaterThan(1000);
  });
});
