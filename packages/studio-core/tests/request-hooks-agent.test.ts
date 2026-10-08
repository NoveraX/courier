/**
 * A call an MCP server made for an agent reaches Studio with the tool and
 * the client its runtime reported; the application's own calls with neither.
 */
import { createKeptBodies, studioHooks } from "@noverax/courier/internal";
import { afterEach, describe, expect, it } from "vitest";

import { EventBus } from "../src/event-bus";
import type { AnyStudioEvent } from "../src/events";
import { wireRequestHooks } from "../src/runtime/hooks/request";

afterEach(() => {
  studioHooks.onRequestStart = undefined;
});

describe("an agent's call, as the runtime reports it", () => {
  it("carries the tool and the client to Studio", () => {
    const bus = new EventBus();
    const events: AnyStudioEvent[] = [];
    bus.on((event) => {
      events.push(event);
    });
    wireRequestHooks(bus, "mcp", (name) => name, createKeptBodies());
    const start = {
      timestamp: 1,
      source: "shop",
      group: "orders",
      method: "cancel",
      variables: { id: "7" },
      mode: "direct" as const,
      middlewareCount: 1,
      hasValidation: { variables: true, response: false },
    };

    studioHooks.onRequestStart?.({
      ...start,
      id: "req_1",
      agent: { tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" },
    });
    studioHooks.onRequestStart?.({ ...start, id: "req_2" });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "request:start",
      agent: { tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" },
    });
    expect(events[1]).not.toHaveProperty("agent");
  });
});
