/**
 * Callers' counts kept in the process: one budget per key, forgotten once
 * whole again, and a bounded number of callers remembered at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryRateLimitStore } from "../../src/adapter/rate-limit/memory-store";

const TWO_A_MINUTE = { requests: 2, window: 60_000 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("memoryRateLimitStore", () => {
  it("keeps a budget for each key apart", () => {
    const store = memoryRateLimitStore();

    const first = [
      store.take("a", TWO_A_MINUTE),
      store.take("a", TWO_A_MINUTE),
      store.take("a", TWO_A_MINUTE),
    ];
    const other = store.take("b", TWO_A_MINUTE);

    expect(first.map((decision) => "allowed" in decision && decision.allowed)).toEqual([
      true,
      true,
      false,
    ]);
    expect(other).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("lets a caller go again once the time it was told to wait has passed", () => {
    const store = memoryRateLimitStore();
    store.take("a", TWO_A_MINUTE);
    store.take("a", TWO_A_MINUTE);
    const refused = store.take("a", TWO_A_MINUTE);

    vi.setSystemTime("retryAfterMs" in refused ? refused.retryAfterMs : 0);

    expect(store.take("a", TWO_A_MINUTE)).toMatchObject({ allowed: true });
  });

  it("forgets the longest-idle caller past the callers it may remember, and never refuses a new one", () => {
    const store = memoryRateLimitStore({ maxCallers: 2 });
    store.take("a", TWO_A_MINUTE);
    store.take("a", TWO_A_MINUTE);
    store.take("b", TWO_A_MINUTE);

    expect(store.take("c", TWO_A_MINUTE)).toMatchObject({ allowed: true });
    expect(store.take("a", TWO_A_MINUTE)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("forgets the longest-idle caller as fast as it counts a call, however many callers it remembers", () => {
    const store = memoryRateLimitStore();
    const remembered = 100_000;
    for (let n = 0; n < remembered; n += 1) store.take(`caller ${n}`, TWO_A_MINUTE);
    const known = Array.from({ length: 400 }, (_, n) => `caller ${remembered - 400 + n}`);
    let newcomers = 0;

    /* The fastest of a few rounds: a pause to collect garbage, or the store's own sweep of the
       callers whose budget is whole, measures neither kind of call. */
    const fastest = (calls: () => void): number => {
      let best = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 5; round += 1) {
        const started = performance.now();
        calls();
        best = Math.min(best, performance.now() - started);
      }
      return best;
    };
    const ofKnown = fastest(() => {
      for (const key of known) store.take(key, TWO_A_MINUTE);
    });
    const ofNew = fastest(() => {
      for (let n = 0; n < known.length; n += 1) {
        newcomers += 1;
        store.take(`newcomer ${newcomers}`, TWO_A_MINUTE);
      }
    });

    expect(ofNew / ofKnown).toBeLessThan(10);
  });
});
