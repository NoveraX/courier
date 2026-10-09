/**
 * `.agent()`: an endpoint offered to AI agents keeps what it was offered as,
 * checked where it was written; a call an MCP server makes for an agent
 * carries `ctx.agent` through the endpoint's middleware and tells Studio the
 * tool, while the application's own calls carry neither.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AgentCall } from "../src/agent/types";
import { courier, defineApi } from "../src/define";
import { defineMiddleware } from "../src/middleware/define";
import type { MiddlewareContext } from "../src/middleware/types";
import { studioHooks } from "../src/studio";
import { executeRequest } from "../src/utils/execute";

const { endpoint } = courier();

describe(".agent()", () => {
  it("keeps what an endpoint is offered as, through every refinement after it", () => {
    const order = endpoint
      .get("orders/:id")
      .agent({ description: "  One order by its id  ", access: "read", title: "Order" })
      .response(z.object({ id: z.string() }));

    expect(order.options.agent).toEqual({
      description: "One order by its id",
      access: "read",
      title: "Order",
    });
    expect(Object.isFrozen(order.options.agent)).toBe(true);
    expect(endpoint.get("orders/:id").options.agent).toBeUndefined();
  });

  it("refuses what cannot describe a tool, where it was written", () => {
    const refused = [
      undefined,
      { access: "read" },
      { description: "  ", access: "read" },
      { description: "Lists", access: "admin" },
      { description: "Lists", access: "read", name: "orders.list" },
      { description: "Lists", access: "read", name: "x".repeat(65) },
      { description: "Lists", access: "read", scope: "all" },
    ];

    for (const given of refused) {
      expect(() => endpoint.get("orders").agent(given as never)).toThrow(
        expect.objectContaining({
          code: "AGENT_OPTIONS_INVALID",
          message: expect.stringContaining('GET "orders"'),
        }),
      );
    }
    expect(
      endpoint.get("orders").agent({ description: "Lists", access: "read", name: "list-orders_2" })
        .options.agent?.name,
    ).toBe("list-orders_2");
  });

  it("keeps a limit of whole calls in a window of at least a second, and refuses any other", () => {
    const refund = endpoint.post("orders/:id/refund").agent({
      description: "Refund an order",
      access: "destructive",
      limit: { maxCalls: 3, window: 60_000 },
    });
    const refused = [
      5,
      { maxCalls: 3 },
      { maxCalls: 0, window: 60_000 },
      { maxCalls: 1.5, window: 60_000 },
      { maxCalls: 3, window: 999 },
      { maxCalls: 3, window: "1m" },
      { maxCalls: 3, window: 60_000, per: "agent" },
    ];

    expect(refund.options.agent?.limit).toEqual({ maxCalls: 3, window: 60_000 });
    expect(Object.isFrozen(refund.options.agent?.limit)).toBe(true);
    for (const limit of refused) {
      expect(() =>
        endpoint.post("orders").agent({ description: "Places", access: "write", limit } as never),
      ).toThrow(
        expect.objectContaining({
          code: "AGENT_OPTIONS_INVALID",
          message: expect.stringContaining("limit"),
        }),
      );
    }
  });

  it("offers an endpoint that writes as a read only once it says it reads", () => {
    const search = endpoint.post("search").reads().agent({ description: "Search", access: "read" });
    expect(search.options.agent?.access).toBe("read");

    function typedOut(): void {
      // @ts-expect-error an endpoint that writes is not a read to an agent
      endpoint.post("orders").agent({ description: "Create", access: "read" });
      // @ts-expect-error a closure is taken to write until it says it reads
      endpoint.via((http) => http.get("x")).agent({ description: "X", access: "read" });
    }
    expect(typedOut).toBeTypeOf("function");
    expect(
      endpoint.del("orders/:id").agent({ description: "Cancel", access: "destructive" }).options
        .agent?.access,
    ).toBe("destructive");
  });
});

describe("a call made for an agent", () => {
  const seen: MiddlewareContext[] = [];
  const record = defineMiddleware("record", "before", (ctx) => {
    seen.push(ctx);
  });
  const shop = defineApi({
    name: "shop",
    baseURL: "https://api.example.com",
    middleware: [record],
    endpoints: {
      order: endpoint.get("orders/:id").agent({ description: "One order", access: "read" }),
    },
  });
  const agent: AgentCall = {
    tool: "order",
    access: "read",
    principal: { token: "secret-token" },
    client: { name: "code-editor", version: "2.1.0" },
  };

  beforeEach(() => {
    seen.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ id: "1" })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    studioHooks.onRequestStart = undefined;
  });

  it("carries ctx.agent through the middleware; the application's own call does not", async () => {
    await executeRequest(
      { shop },
      { source: "shop", method: "order", variables: { id: "1" } },
      { agent },
    );
    await executeRequest({ shop }, { source: "shop", method: "order", variables: { id: "1" } });

    expect(seen.map((ctx) => ctx.agent)).toEqual([agent, undefined]);
  });

  it("tells Studio the tool and the client, never who the server let in", async () => {
    const started = vi.fn();
    studioHooks.onRequestStart = started;

    await executeRequest(
      { shop },
      { source: "shop", method: "order", variables: { id: "1" } },
      { agent },
    );
    await executeRequest({ shop }, { source: "shop", method: "order", variables: { id: "1" } });

    expect(started).toHaveBeenCalledTimes(2);
    expect(started.mock.calls[0]?.[0].agent).toEqual({
      tool: "order",
      access: "read",
      client: "code-editor 2.1.0",
    });
    expect(JSON.stringify(started.mock.calls[0]?.[0])).not.toContain("secret-token");
    expect(started.mock.calls[1]?.[0]).not.toHaveProperty("agent");
  });
});
