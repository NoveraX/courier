/**
 * A call another call's request answered reaches Studio marked, on its end
 * and on its failure, naming that call; a call that sent its own request
 * carries no mark.
 */
import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";

afterEach(() => {
  studioHooks.onRequestEnd = undefined;
  studioHooks.onRequestError = undefined;
});

function collect(): AnyStudioEvent[] {
  const bus = new EventBus();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => {
    events.push(event);
  });
  wireRequestHooks(bus, "app", (name) => name, createKeptBodies());
  return events;
}

const end = {
  status: 200,
  data: { ok: true },
  size: 11,
  headers: {},
  requestHeaders: {},
  timing: { total: 40, middleware: 0, fetch: 40, validation: 0 },
  timestamp: 2,
};

describe("a call's shared mark, as the runtime reports it", () => {
  it("goes on the end of a call another's request answered, and on no other", () => {
    const events = collect();

    studioHooks.onRequestEnd?.({ ...end, id: "req_owner" });
    studioHooks.onRequestEnd?.({
      ...end,
      id: "req_joined",
      shared: { by: "flight", with: "req_owner" },
    });

    expect(events[0]).not.toHaveProperty("shared");
    expect(events[1]).toMatchObject({
      type: "request:end",
      shared: { by: "flight", with: "req_owner" },
    });
  });

  it("goes on the failure of a call another's request failed", () => {
    const events = collect();

    studioHooks.onRequestError?.({
      id: "req_joined",
      error: { type: "http", status: 502, message: "HTTP 502" },
      status: 502,
      shared: { by: "flight", with: "req_owner" },
      timestamp: 2,
    });

    expect(events[0]).toMatchObject({
      type: "request:error",
      shared: { by: "flight", with: "req_owner" },
    });
  });
});
