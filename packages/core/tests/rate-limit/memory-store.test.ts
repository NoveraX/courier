/**
 * Callers' counts kept in the process: one budget per key, forgotten once
 * whole again, and a bounded number of callers remembered at once.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryRateLimitStore } from "../../src/adapter/rate-limit/memory-store";

const TWO_A_MINUTE = { requests: 2, window: 60_000 };

/* The entries a store's map handed out to its walks since this was last cleared. */
let walked = 0;

/* A map that counts each entry a walk of it is handed, kept by a store in place of its own:
   what a call costs is read as the callers it looked at, a count the same however busy the
   machine running the test is, where a clock is not. */
class WalkCountingMap<K, V> extends Map<K, V> {
  override entries(): MapIterator<[K, V]> {
    return counted(super.entries());
  }

  override keys(): MapIterator<K> {
    return counted(super.keys());
  }

  override values(): MapIterator<V> {
    return counted(super.values());
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }

  override forEach(each: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    super.forEach((value, key, map) => {
      walked += 1;
      each.call(thisArg, value, key, map);
    });
  }
}

/* The map's own iterator, counting each entry it hands out. */
function counted<T>(iterator: MapIterator<T>): MapIterator<T> {
  const next = iterator.next.bind(iterator);
  iterator.next = () => {
    const step = next();
    if (step.done !== true) walked += 1;
    return step;
  };
  return iterator;
}

/* A store remembering `maxCallers` at once, whose map counts its walks: the store makes its
   map as it is made, so the map is stubbed for that moment alone. */
function storeCountingWalks(maxCallers: number) {
  vi.stubGlobal("Map", WalkCountingMap);
  try {
    return memoryRateLimitStore({ maxCallers });
  } finally {
    vi.unstubAllGlobals();
  }
}

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

  it("forgets the longest-idle caller by looking at it alone, however many callers it remembers", () => {
    const walks = [1_000, 100_000].map((remembered) => {
      const store = storeCountingWalks(remembered);
      for (let n = 0; n < remembered; n += 1) store.take(`caller ${n}`, TWO_A_MINUTE);
      const newcomers = Array.from({ length: 101 }, (_, n) => {
        walked = 0;
        store.take(`newcomer ${n}`, TWO_A_MINUTE);
        return walked;
      });
      /* The middle newcomer's walk: the sweep of the callers whose budget is whole, made once
         in many calls, falls in one newcomer's call at most. */
      return newcomers.sort((a, b) => a - b)[50];
    });

    expect(walks).toEqual([1, 1]);
  });
});

describe("a store no call comes to", () => {
  const ONE_A_MINUTE = { requests: 1, window: 60_000 };

  beforeEach(() => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it("forgets each caller within a window of its budget being whole again, then keeps no timer", () => {
    const store = memoryRateLimitStore();
    store.take("first", ONE_A_MINUTE);
    vi.advanceTimersByTime(1);
    store.take("last", ONE_A_MINUTE);

    /* The first is forgotten as its budget is whole; the last, whole a moment later, is kept. */
    vi.advanceTimersByTime(59_999);
    expect(vi.getTimerCount()).toBe(1);

    /* Two windows after its call, short of the moment it was made in. */
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps no timer without callers, and none that keeps the process running", () => {
    const set = vi.spyOn(globalThis, "setTimeout");
    const store = memoryRateLimitStore();
    expect(vi.getTimerCount()).toBe(0);

    store.take("a", ONE_A_MINUTE);
    store.take("b", ONE_A_MINUTE);

    expect(vi.getTimerCount()).toBe(1);
    expect(set).toHaveBeenCalledTimes(1);
    const timer = set.mock.results[0]?.value as NodeJS.Timeout | undefined;
    expect(timer?.hasRef()).toBe(false);
    set.mockRestore();
  });

  it("sweeps as often as the shortest window it counts in, and once a second at most", () => {
    const store = memoryRateLimitStore();
    store.take("calls", ONE_A_MINUTE);
    store.take("writes", { requests: 1, window: 10_000 });

    vi.advanceTimersToNextTimer();
    expect(Date.now()).toBe(10_000);

    store.take("bursts", { requests: 10, window: 100 });
    vi.advanceTimersToNextTimer();
    expect(Date.now()).toBe(11_000);
  });
});
