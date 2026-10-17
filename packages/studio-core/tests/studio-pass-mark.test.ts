/**
 * A call `browsersOnly` let through on Studio's pass reaches Studio marked
 * so, as a request and as a stream, when the proxy says that very request
 * redeemed its pass. A request that only names the Studio request id of a
 * call whose pass was redeemed carries no mark.
 */
import { createKeptBodies, STUDIO_PASS_REDEEMER, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";
import { wireStreamHooks } from "../src/runtime/hooks/stream";
import { issueStudioPass } from "../src/runtime/studio-passes";

afterEach(() => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onStreamOpen = undefined;
  Reflect.deleteProperty(globalThis, Symbol.for("courier.studioPassBook"));
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
});

function collect(): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => {
    events.push(event);
  });
  wireRequestHooks(bus, "app", (name) => name, createKeptBodies());
  wireStreamHooks(bus, "app", (name) => name);
  return events;
}

const start = {
  timestamp: 1,
  source: "shop",
  group: "orders",
  method: "list",
  variables: {},
  mode: "proxy" as const,
  middlewareCount: 0,
  hasValidation: { variables: false, response: false },
};

const open = {
  timestamp: 1,
  source: "shop",
  group: "live",
  method: "feed",
  transport: "sse" as const,
  mode: "proxy" as const,
};

describe("a call let through on Studio's pass, as the runtime reports it", () => {
  it("is marked on its start when the proxy says its own pass was redeemed", () => {
    const events = collect();

    studioHooks.onRequestStart?.({ ...start, id: "pg_in", studioPass: true });
    studioHooks.onRequestStart?.({ ...start, id: "req_page" });

    expect(events.map((event) => Reflect.get(event, "studioPass"))).toEqual([true, undefined]);
  });

  it("is marked on its stream's opening when the proxy says so", () => {
    const events = collect();

    studioHooks.onStreamOpen?.({ ...open, requestId: "pg_feed", studioPass: true });
    studioHooks.onStreamOpen?.({ ...open, requestId: "sse_page" });

    expect(events.map((event) => Reflect.get(event, "studioPass"))).toEqual([true, undefined]);
  });

  it("is not claimed by a request that names the id of a call whose pass was redeemed", () => {
    const events = collect();
    const pass = issueStudioPass("pg_taken");
    const redeemer: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
    if (typeof redeemer !== "function") throw new Error("no redeemer");
    Reflect.apply(redeemer, undefined, [pass]);

    studioHooks.onRequestStart?.({ ...start, id: "pg_taken" });
    studioHooks.onStreamOpen?.({ ...open, requestId: "pg_taken" });

    expect(events[0]).not.toHaveProperty("studioPass");
    expect(events[1]).not.toHaveProperty("studioPass");
  });
});
