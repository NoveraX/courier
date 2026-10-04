import { describe, expect, it } from "vitest";
import { calculateBackoff } from "../src/realtime/backoff";

describe("calculateBackoff", () => {
  it("returns initialMs on first attempt without jitter", () => {
    expect(calculateBackoff(0, { jitter: false })).toBe(1000);
  });

  it("grows exponentially without jitter", () => {
    const delays = [0, 1, 2, 3, 4].map((a) => calculateBackoff(a, { jitter: false }));
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("caps at maxMs", () => {
    expect(calculateBackoff(10, { jitter: false })).toBe(30_000);
    expect(calculateBackoff(100, { jitter: false })).toBe(30_000);
  });

  it("respects custom config", () => {
    const delay = calculateBackoff(2, {
      initialMs: 500,
      factor: 3,
      maxMs: 10_000,
      jitter: false,
    });
    // 500 * 3^2 = 4500
    expect(delay).toBe(4500);
  });

  it("applies jitter between 50% and 100% of exponential", () => {
    const results = Array.from({ length: 100 }, () => calculateBackoff(0));
    const min = Math.min(...results);
    const max = Math.max(...results);

    // Should be between 500 (50% of 1000) and 1000 (100%)
    expect(min).toBeGreaterThanOrEqual(500);
    expect(max).toBeLessThanOrEqual(1000);
    // Should have some variance (not all the same)
    expect(max).toBeGreaterThan(min);
  });

  it("keeps the default of a setting given as undefined", () => {
    const delay = calculateBackoff(2, {
      initialMs: undefined,
      maxMs: undefined,
      factor: undefined,
      jitter: false,
    });

    expect(delay).toBe(4000);
  });

  it("returns integer values with jitter", () => {
    const results = Array.from({ length: 50 }, () => calculateBackoff(3));
    for (const r of results) {
      expect(Number.isInteger(r)).toBe(true);
    }
  });
});
