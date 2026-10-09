import { describe, expect, it } from "vitest";

import { callLimits } from "../../src/protocol/call-limits";

const MINUTE = { maxCalls: 2, window: 60_000 };

function clocked() {
  let at = 1_000;
  return { now: () => at, pass: (ms: number) => (at += ms) };
}

describe("the calls a limited tool takes", () => {
  it("takes up to its limit, then says how long until the oldest call leaves the window", () => {
    const clock = clocked();
    const limits = callLimits(clock.now);

    expect(limits.take("orders_get", MINUTE, "ada")).toBe(0);
    clock.pass(10_000);
    expect(limits.take("orders_get", MINUTE, "ada")).toBe(0);
    clock.pass(5_000);
    expect(limits.take("orders_get", MINUTE, "ada")).toBe(45_000);
    clock.pass(45_000);
    expect(limits.take("orders_get", MINUTE, "ada")).toBe(0);
  });

  it("counts each caller and each tool apart, and a look counts nothing", () => {
    const limits = callLimits(clocked().now);

    limits.take("orders_get", MINUTE, "ada");
    limits.take("orders_get", MINUTE, "ada");

    expect(limits.waitOf("orders_get", MINUTE, "ada")).toBeGreaterThan(0);
    expect(limits.waitOf("orders_get", MINUTE, "grace")).toBe(0);
    expect(limits.waitOf("orders_list", MINUTE, "ada")).toBe(0);
    expect(limits.waitOf("orders_get", MINUTE, "grace")).toBe(0);
    expect(limits.take("orders_get", MINUTE, "grace")).toBe(0);
  });

  it("keeps a bounded number of callers, forgetting the one seen longest ago", () => {
    const clock = clocked();
    const limits = callLimits(clock.now);
    const one = { maxCalls: 1, window: 60_000 };

    limits.take("orders_get", one, "first");
    for (let caller = 0; caller < 10_000; caller++)
      limits.take("orders_get", one, `caller-${caller}`);

    expect(limits.waitOf("orders_get", one, "caller-9999")).toBeGreaterThan(0);
    expect(limits.waitOf("orders_get", one, "first")).toBe(0);
  });
});
