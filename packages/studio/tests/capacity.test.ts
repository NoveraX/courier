/**
 * A capacity counts what Studio holds at once up to a limit — fetches,
 * bytes, threads — and refuses a place given back that was never taken,
 * which would otherwise let one more caller in than the limit.
 */
import { describe, expect, it } from "vitest";

import { createCapacity } from "../src/server/capacity";

describe("createCapacity", () => {
  it("takes up to its limit, and no more", () => {
    const places = createCapacity(2);

    expect([places.take(), places.take(), places.take()]).toEqual([true, true, false]);
    expect(places.used).toBe(2);
  });

  it("takes again what was given back", () => {
    const places = createCapacity(1);
    places.take();

    places.give();

    expect(places.take()).toBe(true);
  });

  it("takes amounts, refusing one that would pass the limit whole", () => {
    const bytes = createCapacity(10);
    bytes.take(6);

    expect(bytes.take(5)).toBe(false);
    expect(bytes.used).toBe(6);
  });

  it("refuses a place given back twice, and keeps counting the places still taken", () => {
    const places = createCapacity(2);
    places.take();
    places.take();
    places.give();
    places.give();

    expect(() => places.give()).toThrow(RangeError);
    expect(places.used).toBe(0);
  });

  it("refuses more given back than is taken, leaving the count as it was", () => {
    const bytes = createCapacity(10);
    bytes.take(4);

    expect(() => bytes.give(5)).toThrow(/Gave back 5 of a capacity that holds 4/);
    expect(bytes.used).toBe(4);
  });
});
