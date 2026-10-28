/**
 * A call's hold on its endpoint, which a newer call takes: from the moment
 * the call starts until it settles, across its attempts and the waits
 * between them. An older call with no request in flight is cancelled at
 * once and never sends; one with a request in flight is cancelled once the
 * newer call's request has started, so an identical newer call can join
 * it; and a call that settles without sending cancels those all the same.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HTTPError } from "../src/errors";
import { studioHooks } from "../src/studio";
import {
  type EndpointHolds,
  holdEndpoint,
  supportsAbortController,
} from "../src/utils/cancel-previous";

const KEY = "api:users.search";

function holds(): EndpointHolds {
  return new Map();
}

/** Hold the endpoint and send a request, as a call with one in flight has. */
function inFlight(table: EndpointHolds, key = KEY) {
  const hold = holdEndpoint(table, key);
  hold.sending();
  hold.sent();
  return hold;
}

afterEach(() => {
  studioHooks.onCallSuperseded = undefined;
  studioHooks.onRequestAbort = undefined;
});

describe("supportsAbortController", () => {
  it("is true in Node.js", () => {
    expect(supportsAbortController).toBe(true);
  });
});

describe("holdEndpoint", () => {
  it("cancels nothing for the first call to an endpoint", () => {
    const superseded = vi.fn();
    studioHooks.onRequestAbort = superseded;

    const hold = inFlight(holds());

    expect(hold.signal.aborted).toBe(false);
    expect(superseded).not.toHaveBeenCalled();
  });

  it("cancels at once an older call with no request in flight, with a 499, and tells Studio", () => {
    const table = holds();
    const cancelled = vi.fn();
    const superseded = vi.fn();
    studioHooks.onCallSuperseded = cancelled;
    studioHooks.onRequestAbort = superseded;
    const older = holdEndpoint(table, KEY);

    const newer = holdEndpoint(table, KEY);

    expect(older.signal.aborted).toBe(true);
    expect(older.signal.reason).toBeInstanceOf(HTTPError);
    expect((older.signal.reason as HTTPError).status).toBe(499);
    expect(newer.signal.aborted).toBe(false);
    expect(superseded).toHaveBeenCalledWith(expect.objectContaining({ reason: "superseded" }));
    expect(cancelled).toHaveBeenCalledWith(expect.objectContaining({ key: KEY }));
  });

  it("cancels an older call with a request in flight once the newer one's request has started", () => {
    const table = holds();
    const older = inFlight(table);

    const newer = holdEndpoint(table, KEY);
    const abortedBeforeSent = older.signal.aborted;
    newer.sending();
    newer.sent();

    expect(abortedBeforeSent).toBe(false);
    expect(older.signal.aborted).toBe(true);
    expect(newer.signal.aborted).toBe(false);
  });

  it("refuses to send a call a newer one superseded while its request was in flight", () => {
    const table = holds();
    const older = inFlight(table);
    holdEndpoint(table, KEY);
    older.returned();

    expect(() => older.sending()).toThrow(expect.objectContaining({ status: 499 }));
    expect(older.signal.aborted).toBe(true);
  });

  it("cancels, when it settles without sending, the older calls it superseded", () => {
    const table = holds();
    const older = inFlight(table);
    const newer = holdEndpoint(table, KEY);

    newer.release();

    expect(older.signal.aborted).toBe(true);
    expect(table.has(KEY)).toBe(false);
  });

  it("cancels every older call once the newest call's request starts", () => {
    const table = holds();
    const first = inFlight(table);
    const second = holdEndpoint(table, KEY);
    const third = holdEndpoint(table, KEY);

    third.sending();
    third.sent();

    expect([first.signal.aborted, second.signal.aborted, third.signal.aborted]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("lets go of the endpoint when the call settles, keeping a newer call's hold", () => {
    const table = holds();
    const older = inFlight(table);
    const newer = holdEndpoint(table, KEY);

    older.returned();
    older.release();
    newer.sending();

    expect(newer.signal.aborted).toBe(false);
    expect(table.get(KEY)).toHaveLength(1);
  });

  it("leaves the calls to other endpoints alone", () => {
    const table = holds();
    const search = holdEndpoint(table, KEY);

    inFlight(table, "api:geo.suggest");

    expect(search.signal.aborted).toBe(false);
  });
});
