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
});
