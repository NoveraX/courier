/**
 * The application's MCP endpoint over real HTTP, against the official
 * clients of both protocol eras, and against requests no client would send:
 * who may call, from where, with what, and what a malformed request is told.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  Client as ModernClient,
  StreamableHTTPClientTransport as ModernHttp,
} from "@modelcontextprotocol/client";
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport as LegacyHttp } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { sendWebResponse, toWebRequest } from "@noverax/courier/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMcpHandler, type McpHandlerOptions } from "../src";
import { type ShopUpstream, seenByMiddleware, shopApi, startShopUpstream } from "./support/shop";

type Principal = "admin" | "intern";

let upstream: ShopUpstream;
const servers: Server[] = [];
/* What each POST asked for, in order: its method, and whether it brought a confirmation back. */
const exchanges: string[] = [];

beforeAll(async () => {
  upstream = await startShopUpstream();
});
afterAll(async () => {
  await upstream.close();
});
afterEach(async () => {
  upstream.received.length = 0;
  exchanges.length = 0;
  seenByMiddleware.length = 0;
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

const authorize = (request: Request): Principal | null => {
  const key = request.headers.get("authorization");
  return key === "Bearer admin-key" ? "admin" : key === "Bearer intern-key" ? "intern" : null;
};

async function endpoint(options: Partial<McpHandlerOptions<Principal>> = {}): Promise<string> {
  const mcp = createMcpHandler<Principal>({
    sources: { shop: shopApi(upstream.baseURL) },
    authorize,
    allow: (tool, principal) => principal === "admin" || tool.access !== "destructive",
    ...options,
  });
  const server = createServer(async (req, res) => {
    const request = toWebRequest(req, res);
    const body = request.method === "POST" ? await request.clone().text() : "";
    const message =
      body === ""
        ? undefined
        : (JSON.parse(body) as { method?: string; params?: Record<string, unknown> });
    if (message?.method)
      exchanges.push(`${message.method}${message.params?.requestState ? " +state" : ""}`);
    await sendWebResponse(await mcp.handle(request), res);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
}

const headersFor = (key: string) => ({ headers: { authorization: `Bearer ${key}` } });

async function modernClient(url: string, key: string, answer?: "accept" | "decline") {
  const client = new ModernClient(
    { name: "modern-http", version: "2.3.1" },
    {
      versionNegotiation: { mode: { pin: "2026-07-28" } },
      ...(answer && { capabilities: { elicitation: { form: {} } } }),
    },
  );
  if (answer)
    client.setRequestHandler("elicitation/create", async () => ({ action: answer, content: {} }));
  await client.connect(new ModernHttp(new URL(url), { requestInit: headersFor(key) }) as never);
  return client;
}

async function legacyClient(url: string, key: string) {
  const client = new LegacyClient(
    { name: "legacy-http", version: "1.32.1" },
    { capabilities: { elicitation: {} } },
  );
  await client.connect(new LegacyHttp(new URL(url), { requestInit: headersFor(key) }) as never);
  return client;
}

describe("a 2026-07-28 client over HTTP", () => {
  it("lists and calls the tools its principal may see, and confirms a destructive one with the person", async () => {
    const client = await modernClient(await endpoint(), "admin-key", "accept");

    const { tools } = await client.listTools();
    const order = await client.callTool({ name: "orders_get", arguments: { id: "7" } });
    const cancelled = await client.callTool({ name: "orders_cancel", arguments: { id: "7" } });

    expect(tools.map((tool) => tool.name)).toEqual([
      "orders_get",
      "orders_list",
      "orders_create",
      "orders_cancel",
    ]);
    expect(order.structuredContent).toEqual({ id: "7", status: "open", total: 42 });
    expect(cancelled.isError).toBe(false);
    expect(upstream.received).toEqual(["GET /orders/7", "DELETE /orders/7"]);
    expect(exchanges.filter((line) => line.startsWith("tools/call"))).toEqual([
      "tools/call",
      "tools/call",
      "tools/call +state",
    ]);
    expect(seenByMiddleware.map((ctx) => ctx.agent?.principal)).toEqual(["admin", "admin"]);
  });

  it("hides what its principal may not call, and lets the application's middleware refuse the rest", async () => {
    const client = await modernClient(await endpoint(), "intern-key", "accept");

    const { tools } = await client.listTools();
    const denied = await client.callTool({ name: "orders_create", arguments: { total: 10 } });

    expect(tools.map((tool) => tool.name)).not.toContain("orders_cancel");
    await expect(
      client.callTool({ name: "orders_cancel", arguments: { id: "7" } }),
    ).rejects.toThrow(/Unknown tool/);
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied.content)).toContain("An intern's agent only reads");
    expect(upstream.received).toEqual([]);
  });

  it("does not run a destructive tool the person declined", async () => {
    const client = await modernClient(await endpoint(), "admin-key", "decline");

    const result = await client.callTool({ name: "orders_cancel", arguments: { id: "7" } });

    expect(result.isError).toBe(true);
    expect(upstream.received).toEqual([]);
  });
});

describe("a client on the 2025 handshake over HTTP", () => {
  it("lists and calls tools, with no session kept between its requests", async () => {
    const client = await legacyClient(await endpoint(), "admin-key");

    const { tools } = await client.listTools();
    const order = await client.callTool({ name: "orders_get", arguments: { id: "7" } });

    expect(tools).toHaveLength(4);
    expect(order.structuredContent).toEqual({ id: "7", status: "open", total: 42 });
    expect(exchanges.slice(0, 2)).toEqual(["initialize", "notifications/initialized"]);
  });

  it("cannot be asked a question over HTTP, so a destructive tool does not run unless the operator allows it", async () => {
    const refused = await (await legacyClient(await endpoint(), "admin-key")).callTool({
      name: "orders_cancel",
      arguments: { id: "7" },
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.content)).toContain("allowDestructive");
    expect(upstream.received).toEqual([]);

    const allowed = await (
      await legacyClient(await endpoint({ allowDestructive: true }), "admin-key")
    ).callTool({
      name: "orders_cancel",
      arguments: { id: "7" },
    });
    expect(allowed.isError).toBe(false);
    expect(upstream.received).toEqual(["DELETE /orders/7"]);
  });
});
