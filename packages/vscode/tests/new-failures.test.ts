/**
 * The failures a notice tells of: none at the first look, which learns
 * what was there; an endpoint's newer failure after that; none again for
 * the same endpoint within a minute of its notice; and each Studio's
 * endpoints apart.
 */
import { describe, expect, it } from "vitest";

import { newFailures } from "../src/notify/new-failures";
import type { EndpointStats } from "../src/studio/studio-types";

const failingAt = (at: number, endpoint = "orders.place"): EndpointStats => ({
  source: "shop",
  endpoint,
  calls: 3,
  failed: 1,
  pending: 0,
  statuses: { "500": 1 },
  lastFailure: { at, message: "HTTP 500" },
});

describe("the new failures", () => {
  it("are none at the first look, then each newer failure", () => {
    const seen = new Map();

    const first = newFailures("s1", [failingAt(1_000)], seen, 100_000);
    const same = newFailures("s1", [failingAt(1_000)], seen, 101_000);
    const newer = newFailures("s1", [failingAt(2_000)], seen, 102_000);

    expect(first).toEqual([]);
    expect(same).toEqual([]);
    expect(newer.map((each) => each.stats.lastFailure?.at)).toEqual([2_000]);
  });

  it("leave an endpoint told of within the last minute to the views", () => {
    const seen = new Map();
    newFailures("s1", [failingAt(1_000)], seen, 100_000);
    newFailures("s1", [failingAt(2_000)], seen, 102_000);

    const soon = newFailures("s1", [failingAt(3_000)], seen, 130_000);
    const later = newFailures("s1", [failingAt(4_000)], seen, 170_000);

    expect(soon).toEqual([]);
    expect(later.map((each) => each.stats.lastFailure?.at)).toEqual([4_000]);
  });

  it("keep each Studio's endpoints apart, and pass over endpoints that never failed", () => {
    const seen = new Map();
    const fine = { ...failingAt(0, "products.list"), failed: 0, lastFailure: undefined };
    newFailures("s1", [failingAt(1_000), fine], seen, 100_000);

    const other = newFailures("s2", [failingAt(2_000)], seen, 101_000);
    const mine = newFailures("s1", [failingAt(2_000), fine], seen, 101_000);

    expect(other).toEqual([]);
    expect(mine.map((each) => each.studio)).toEqual(["s1"]);
  });
});
