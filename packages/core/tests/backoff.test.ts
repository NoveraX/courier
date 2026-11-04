import { describe, expect, it } from "vitest";

import { ConfigurationError } from "../src/errors/configuration-error";
import { backoffDelay, hintedDelay, resolveBackoff } from "../src/realtime/backoff";

const exact = resolveBackoff({ jitter: false });

describe("resolveBackoff", () => {
  it("reads every setting, a setting given as undefined keeping its default", () => {
    expect(resolveBackoff({ initialMs: undefined, maxMs: 10_000 })).toEqual({
      initialMs: 1000,
      maxMs: 10_000,
      factor: 2,
      jitter: true,
    });
  });

  it.each([
    [{ initialMs: -1 }, "backoff.initialMs is -1"],
    [{ maxMs: Number.POSITIVE_INFINITY }, "backoff.maxMs is Infinity"],
    [{ initialMs: Number.NaN }, "backoff.initialMs is NaN"],
    [{ factor: 0.5 }, "backoff.factor is 0.5"],
  ])("refuses %o, saying which setting", (config, said) => {
    expect(() => resolveBackoff(config)).toThrow(ConfigurationError);
    expect(() => resolveBackoff(config)).toThrow(said);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially from the initial delay without jitter", () => {
    expect([0, 1, 2, 3, 4].map((step) => backoffDelay(step, exact))).toEqual([
      1000, 2000, 4000, 8000, 16000,
    ]);
  });

  it("stops growing at its cap, however many attempts failed", () => {
    expect(backoffDelay(10, exact)).toBe(30_000);
    expect(backoffDelay(10_000, exact)).toBe(30_000);
  });

  it("takes custom settings", () => {
    expect(
      backoffDelay(2, resolveBackoff({ initialMs: 500, factor: 3, maxMs: 10_000, jitter: false })),
    ).toBe(4500);
  });

  it("draws a delay from anywhere between 0 and the exponential one with jitter", () => {
    const backoff = resolveBackoff();

    expect(backoffDelay(3, backoff, () => 0)).toBe(0);
    expect(backoffDelay(3, backoff, () => 0.5)).toBe(4000);
    expect(backoffDelay(3, backoff, () => 0.999_999)).toBe(7999);
  });

  it("keeps a jittered delay below its cap", () => {
    expect(backoffDelay(50, resolveBackoff(), () => 0.999_999)).toBe(29_999);
  });

  it("waits nothing when the initial delay is 0, at any attempt", () => {
    expect(backoffDelay(5_000, resolveBackoff({ initialMs: 0, jitter: false }))).toBe(0);
  });
});

describe("hintedDelay", () => {
  it("waits never less than the server asked, spread past it as a backoff is", () => {
    const backoff = resolveBackoff();

    expect(hintedDelay(5000, 0, backoff, () => 0)).toBe(5000);
    expect(hintedDelay(5000, 0, backoff, () => 0.5)).toBe(5500);
    expect(hintedDelay(5000, 2, backoff, () => 0.5)).toBe(7000);
  });

  it("waits exactly what the server asked plus the exponential delay without jitter", () => {
    expect(hintedDelay(2500, 1, exact)).toBe(4500);
  });
});
