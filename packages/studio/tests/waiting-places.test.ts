/**
 * Places for work that waits its turn: no more than the limit at once,
 * the rest let in first come first served as places are given back, a
 * caller that goes away while it waits leaves the line, and a place given
 * back that none had taken is refused.
 */
import { describe, expect, it } from "vitest";

import { createWaitingPlaces } from "../src/server/waiting-places";

function settled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
  ]);
}

describe("createWaitingPlaces", () => {
  it("lets callers in up to its limit at once", async () => {
    const places = createWaitingPlaces(2);

    await places.enter();
    await places.enter();

    expect(places.taken).toBe(2);
    expect(await settled(places.enter())).toBe(false);
    expect(places.waiting).toBe(1);
  });

  it("lets those waiting in first come first served as places are given back", async () => {
    const places = createWaitingPlaces(1);
    await places.enter();
    const order: string[] = [];
    const first = places.enter().then(() => order.push("first"));
    const second = places.enter().then(() => order.push("second"));

    places.leave();
    await first;
    places.leave();
    await second;

    expect(order).toEqual(["first", "second"]);
    expect(places.taken).toBe(1);
  });

  it("takes a caller out of the line once it goes away, with its signal's reason", async () => {
    const places = createWaitingPlaces(1);
    await places.enter();
    const caller = new AbortController();
    const waiting = places.enter(caller.signal);

    caller.abort(new Error("gone"));

    await expect(waiting).rejects.toThrow("gone");
    expect(places.waiting).toBe(0);
    places.leave();
    expect(places.taken).toBe(0);
  });

  it("refuses a caller whose signal is aborted already", async () => {
    const places = createWaitingPlaces(1);
    const caller = new AbortController();
    caller.abort(new Error("gone"));

    await expect(places.enter(caller.signal)).rejects.toThrow("gone");
    expect(places.taken).toBe(0);
  });

  it("refuses a place given back that none had taken", () => {
    const places = createWaitingPlaces(1);

    expect(() => places.leave()).toThrow(RangeError);
  });
});
