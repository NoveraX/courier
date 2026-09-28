import { describe, expect, it } from "vitest";

import { samplePattern } from "../src/auto/pattern-sample";

describe("samplePattern", () => {
  const patterns = [
    /^\d{5}$/,
    /^[a-z]+(?:-[a-z]+)*$/,
    /^[A-Z]{2}-\d{3,4}$/,
    /^(?:red|green|blue)$/,
    /^[^\s@]+@[a-z]+\.(?:com|org)$/,
    /^\w{3}\.\w+$/,
    /^(?<area>\d{3})-\d{4}$/,
    /^(?=.*\d)[a-z\d]{6}$/,
    /^A[\x42-\x44]?\p{L}{2}$/u,
    /^SKU-\d{5}$/i,
  ];

  it.each(patterns)("generates a value matching %s", (pattern) => {
    for (let seed = 1; seed <= 10; seed++) {
      const value = samplePattern(pattern, seed);
      expect(value).toBeDefined();
      expect(pattern.test(value ?? "")).toBe(true);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const pattern = /^[a-z]{8}$/;
    expect(samplePattern(pattern, 4)).toBe(samplePattern(pattern, 4));
    const values = new Set(Array.from({ length: 10 }, (_, i) => samplePattern(pattern, i + 1)));
    expect(values.size).toBeGreaterThan(5);
  });

  it("returns undefined for a backreference", () => {
    expect(samplePattern(/^(a+)\1$/, 1)).toBeUndefined();
  });

  it("returns undefined when no generated value passes the pattern", () => {
    expect(samplePattern(/^(?!a)a$/, 1)).toBeUndefined();
  });
});
