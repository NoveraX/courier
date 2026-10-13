/**
 * One caller's budget as the Generic Cell Rate Algorithm keeps it: the
 * whole budget at once, then one call each `window / requests`, and the
 * exact wait for a refused call.
 */
import { describe, expect, it } from "vitest";

import { takeCall } from "../../src/adapter/rate-limit/gcra";

const THREE_A_SECOND = { requests: 3, window: 3000 };

/* Take `count` calls at `now`, each from what the last one left. */
function burst(count: number, now: number, from?: number) {
  let spentUntil = from;
  const decisions = [];
  for (let index = 0; index < count; index += 1) {
    const taken = takeCall(spentUntil, THREE_A_SECOND, now);
    spentUntil = taken.spentUntil;
    decisions.push(taken.decision);
  }
  return { decisions, spentUntil };
}

describe("takeCall", () => {
  it("lets the whole budget go at once, counting down what is left", () => {
    const { decisions } = burst(3, 0);

    expect(decisions.map(({ allowed, remaining }) => [allowed, remaining])).toEqual([
      [true, 2],
      [true, 1],
      [true, 0],
    ]);
  });

  it("refuses the next, saying how long to wait and when the budget is whole", () => {
    const { decisions } = burst(4, 0);

    expect(decisions[3]).toEqual({
      allowed: false,
      remaining: 0,
      resetMs: 3000,
      retryAfterMs: 1000,
    });
  });

  it("frees one call each window / requests, not the whole budget at the window's edge", () => {
    const { spentUntil } = burst(3, 0);

    expect(takeCall(spentUntil, THREE_A_SECOND, 999).decision.allowed).toBe(false);
    expect(takeCall(spentUntil, THREE_A_SECOND, 1000).decision.allowed).toBe(true);
    expect(burst(2, 1000, spentUntil).decisions.map(({ allowed }) => allowed)).toEqual([
      true,
      false,
    ]);
  });

  it("forgets a caller whose budget is whole again", () => {
    const { spentUntil } = burst(3, 0);

    expect(burst(3, 3000, spentUntil).decisions.every(({ allowed }) => allowed)).toBe(true);
  });

  it("does not count a refused call against the caller", () => {
    const { spentUntil } = burst(5, 0);

    expect(spentUntil).toBe(3000);
  });
});
