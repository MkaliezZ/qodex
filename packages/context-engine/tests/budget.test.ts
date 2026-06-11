import { describe, it, expect } from "vitest";
import { TokenEstimator } from "../src/budget/estimator.js";

describe("TokenEstimator", () => {
  const estimator = new TokenEstimator();

  it("returns 0 for empty string", () => {
    expect(estimator.estimate("")).toBe(0);
  });

  it("estimates ASCII text", () => {
    const count = estimator.estimate("Hello world"); // 11 chars
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(3); // ceil(11/4) = 3
  });

  it("estimates CJK text", () => {
    const count = estimator.estimate("你好世界"); // 4 CJK chars
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(2); // ceil(4/2) = 2
  });

  it("estimates mixed text", () => {
    const count = estimator.estimate("Hello 你好 world 世界");
    expect(count).toBeGreaterThan(0);
  });

  it("estimates total across sections", () => {
    const total = estimator.estimateTotal(["Hello", " world"]);
    expect(total).toBe(estimator.estimate("Hello") + estimator.estimate(" world"));
  });
});
