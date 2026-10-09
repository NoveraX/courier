/**
 * A tool's limit, against the official client over HTTP: the model is told
 * it with the tool, a call beyond it is refused at once with when to call
 * again — and shows in Studio as a call that never ran — each caller is
 * counted apart when the handler says how to tell them apart, and no person
 * is asked to confirm a call its limit would refuse.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { studioHooks } from "@noverax/courier/internal";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createMcpHandler, type McpHandlerOptions } from "../src";
import { Order, type ShopUpstream, startShopUpstream } from "./support/shop";

type Principal = "ada" | "grace";

const { endpoint } = courier();
let upstream: ShopUpstream;
const servers: Server[] = [];

beforeAll(async () => {
  upstream = await startShopUpstream();
});
afterAll(() => upstream.close());
afterEach(async () => {
  upstream.received.length = 0;
  studioHooks.onRequestStart = undefined;
  studioHooks.onRequestError = undefined;
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

function limitedShop(baseURL: string) {
  return defineApi({
    name: "shop",
    baseURL,
    groups: {
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          get: endpoint
            .get(":id")
            .variables(z.object({ id: z.string() }))
            .response(Order)
            .agent({
              description: "One order by its id",
              access: "read",
              limit: { maxCalls: 2, window: 60_000 },
            }),
          cancel: endpoint
            .del(":id")
            .variables(z.object({ id: z.string() }))
            .agent({
              description: "Cancel an order that has not shipped",
              access: "destructive",
              limit: { maxCalls: 1, window: 3_600_000 },
            }),
        },
      }),
    },
  });
}

async function serve(options: Partial<McpHandlerOptions<Principal>> = {}): Promise<string> {
  const mcp = createMcpHandler<Principal>({
    sources: { shop: limitedShop(upstream.baseURL) },
    authorize: (request) => {
      const key = request.headers.get("authorization");
      return key === "Bearer ada-key" ? "ada" : key === "Bearer grace-key" ? "grace" : null;
    },
    ...options,
  });
  const server = createServer(async (req, res) => {
    await sendWebResponse(await mcp.handle(toWebRequest(req, res)), res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

async function client(url: string, key: string, asked?: () => void) {
  const connected = new Client(
    { name: "limited-agent", version: "1.0" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      ...(asked && { capabilities: { elicitation: { form: {} } } }),
    },
  );
  if (asked) {
    connected.setRequestHandler("elicitation/create", async () => {
      asked();
      return { action: "accept", content: {} };
    });
  }
  await connected.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    }) as never,
  );
  return connected;
}

const text = (result: { content?: unknown }) => JSON.stringify(result.content);

describe("a tool's limit", () => {
  it("is told to the model, and refuses a call over it with when to call again, shown in Studio", async () => {
    const started = vi.fn();
    const failed = vi.fn();
    studioHooks.onRequestStart = started;
    studioHooks.onRequestError = failed;
    const agent = await client(await serve(), "ada-key");

    const { tools } = await agent.listTools();
    const first = await agent.callTool({ name: "orders_get", arguments: { id: "7" } });
    const second = await agent.callTool({ name: "orders_get", arguments: { id: "7" } });
    const third = await agent.callTool({ name: "orders_get", arguments: { id: "7" } });

    expect(tools.find((tool) => tool.name === "orders_get")?.description).toBe(
      "One order by its id\n\nTakes at most 2 calls a minute from each caller; a call beyond that is refused, with when to call again.",
    );
    expect([first.isError, second.isError, third.isError]).toEqual([false, false, true]);
    expect(text(third)).toMatch(
      /Not run: orders_get takes 2 calls a minute from each caller, and this caller made them; it may call again in (?:[1-5]?\d|60) s\./,
    );
    expect(upstream.received).toEqual(["GET /orders/7", "GET /orders/7"]);
    const refused = failed.mock.calls.map(([event]) => event.error).at(-1);
    expect(refused).toEqual({
      type: "aborted",
      message: expect.stringContaining("takes 2 calls a minute"),
    });
    expect(started.mock.calls.at(-1)?.[0].agent).toMatchObject({
      tool: "orders_get",
      client: "limited-agent 1.0",
    });
  });

  it("counts each caller apart when the handler tells them apart, and every caller together when not", async () => {
    const apart = await serve({ limitPer: (principal) => principal });
    const together = await serve();
    const calls = async (url: string, key: string, times: number) => {
      const agent = await client(url, key);
      const results = [];
      for (let made = 0; made < times; made++) {
        results.push(
          (await agent.callTool({ name: "orders_get", arguments: { id: "7" } })).isError,
        );
      }
      return results;
    };

    expect([await calls(apart, "ada-key", 2), await calls(apart, "grace-key", 3)]).toEqual([
      [false, false],
      [false, false, true],
    ]);
    expect([await calls(together, "ada-key", 1), await calls(together, "grace-key", 2)]).toEqual([
      [false],
      [false, true],
    ]);
  });

  it("asks no person to confirm a call its limit would refuse", async () => {
    const asked = vi.fn();
    const agent = await client(await serve(), "ada-key", asked);

    const first = await agent.callTool({ name: "orders_cancel", arguments: { id: "7" } });
    const second = await agent.callTool({ name: "orders_cancel", arguments: { id: "8" } });

    expect(first.isError).toBe(false);
    expect(second.isError).toBe(true);
    expect(text(second)).toContain("orders_cancel takes 1 call an hour from each caller");
    expect(text(second)).toMatch(/call again in 60 min\./);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(upstream.received).toEqual(["DELETE /orders/7"]);
  });
});
