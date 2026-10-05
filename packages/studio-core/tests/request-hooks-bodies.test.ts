import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";

const orders = Array.from({ length: 5000 }, (_, id) => ({ id, total: id * 3 }));
const TIMING = { total: 1, middleware: 0, fetch: 1, validation: 0 };

function wired() {
  const bus = new EventBus();
  const bodies = createKeptBodies();
  const events: AnyStudioEvent[] = [];
  bus.on((event) => {
    events.push(event);
  });
  wireRequestHooks(bus, "app", (name) => name, bodies);
  return { bodies, events };
}

afterEach(() => {
  studioHooks.onRequestStart = undefined;
  studioHooks.onRequestEnd = undefined;
  studioHooks.onRequestError = undefined;
});

describe("a request's bodies, as the runtime reports them", () => {
  it("carry an answer too large for its event as a part, and keep the whole", () => {
    const { bodies, events } = wired();

    studioHooks.onRequestEnd?.({
      id: "req_1",
      timestamp: 1,
      status: 200,
      data: orders,
      size: 100,
      headers: {},
      requestHeaders: {},
      timing: TIMING,
    });

    const [end] = events;
    expect(end).toMatchObject({ type: "request:end", dataCutFrom: JSON.stringify(orders).length });
    expect((end as { data: unknown[] }).data.at(-1)).toMatch(/^… [\d,]+ more items$/);
    expect(bodies.textOf("req_1", "response")).toBe(JSON.stringify(orders));
  });

  it("carry variables too large for their event as a part, and keep the whole", () => {
    const { bodies, events } = wired();
    const variables = { rows: orders };

    studioHooks.onRequestStart?.({
      id: "req_2",
      timestamp: 1,
      source: "api",
      group: "orders",
      method: "import",
      variables,
      mode: "direct",
      middlewareCount: 0,
      hasValidation: { variables: false, response: false },
    });

    expect(events[0]).toMatchObject({
      type: "request:start",
      variablesCutFrom: expect.any(Number),
    });
    expect(bodies.textOf("req_2", "request")).toBe(JSON.stringify(variables));
  });

  it("carry an error's large body as a part, and small bodies whole with nothing kept", () => {
    const { bodies, events } = wired();

    studioHooks.onRequestError?.({
      id: "req_3",
      timestamp: 1,
      error: { type: "http", status: 500, message: "Server error" },
      status: 500,
      data: { trace: "t".repeat(40_000) },
    });
    studioHooks.onRequestEnd?.({
      id: "req_4",
      timestamp: 1,
      status: 200,
      data: { id: 1 },
      size: 8,
      headers: {},
      requestHeaders: {},
      timing: TIMING,
    });

    expect(events[0]).toMatchObject({ type: "request:error", dataCutFrom: 40_012 });
    expect(bodies.textOf("req_3", "response")).toContain("ttt");
    expect(events[1]).toMatchObject({ data: { id: 1 } });
    expect(events[1]).not.toHaveProperty("dataCutFrom");
    expect(bodies.textOf("req_4", "response")).toBeUndefined();
  });
});
