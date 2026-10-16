/**
 * A call `browsersOnly` let through on Studio's pass reaches Studio marked
 * so, as a request and as a stream; every other call carries no mark.
 */
import { createKeptBodies, STUDIO_PASS_REDEEMER, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";
import { wireStreamHooks } from "../src/runtime/hooks/stream";
import { issueStudioPass, revokeStudioPasses } from "../src/runtime/studio-passes";

afterEach(() => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onStreamOpen = undefined;
  Reflect.deleteProperty(globalThis, Symbol.for("courier.studioPassBook"));
  Reflect.deleteProperty(globalThis, STUDIO_PASS_REDEEMER);
});

function admit(requestId: string): void {
  const pass = issueStudioPass(requestId);
  const redeemer: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
  if (typeof redeemer !== "function") throw new Error("no redeemer");
  Reflect.apply(redeemer, undefined, [pass]);
}

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
  it("is marked on its start, and the run's other calls are not", () => {
    const events = collect();
    admit("pg_in");
    issueStudioPass("pg_unused");

    studioHooks.onRequestStart?.({ ...start, id: "pg_in" });
    studioHooks.onRequestStart?.({ ...start, id: "pg_unused" });
    studioHooks.onRequestStart?.({ ...start, id: "req_page" });

    expect(events.map((event) => Reflect.get(event, "studioPass"))).toEqual([
      true,
      undefined,
      undefined,
    ]);
  });

  it("is marked on its stream's opening", () => {
    const events = collect();
    admit("pg_feed");

    studioHooks.onStreamOpen?.({ ...open, requestId: "pg_feed" });
    studioHooks.onStreamOpen?.({ ...open, requestId: "sse_page" });

    expect(events.map((event) => Reflect.get(event, "studioPass"))).toEqual([true, undefined]);
  });

  it("is no longer marked once its run has ended", () => {
    const events = collect();
    admit("pg_done");
    revokeStudioPasses("pg_done");

    studioHooks.onRequestStart?.({ ...start, id: "pg_done" });

    expect(events[0]).not.toHaveProperty("studioPass");
  });
});
