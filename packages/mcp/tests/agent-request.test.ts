/**
 * A tool's call is the MCP server's own, made for an agent: it takes
 * nothing of the request the endpoint is served on, whatever the
 * application lends — no session cookie, no bearer, no forwarded header,
 * no chain of addresses — however the request is served, through a
 * framework's registered request context or `withIncomingRequest`. Nor
 * does it take what a DOM on the server's global object keeps, and two at
 * once cancel neither, as a server's calls never do.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { webIncomingRequest, withIncomingRequest } from "@noverax/courier/node";
import { registerRequestContext } from "@noverax/courier/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createMcpHandler } from "../src";
import { META } from "../src/protocol/versions";

const { endpoint } = courier();
const MCP_URL = "http://127.0.0.1:3000/mcp";
/* What the agent's own request carries, all made up: none of it is the API's to see. */
const AGENTS_HEADERS = {
  cookie: "sid=made-up-browser-session; token=made-up-token",
  "x-tenant": "made-up-tenant",
  "x-forwarded-for": "198.51.100.7",
};
let upstream: Server;
let seen: IncomingHttpHeaders[] = [];

beforeAll(async () => {
  upstream = createServer((request, response) => {
    seen.push(request.headers);
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "7" }));
    }, 30);
  });
  await new Promise<void>((done) => upstream.listen(0, "127.0.0.1", done));
});

afterAll(() => new Promise<void>((done) => upstream.close(() => done())));

afterEach(() => {
  seen = [];
  Reflect.deleteProperty(globalThis, "document");
});

function mcp() {
  const { port } = upstream.address() as AddressInfo;
  const accounts = defineApi({
    name: "accounts",
    baseURL: `http://127.0.0.1:${port}`,
    session: { cookies: ["sid"], bearer: "token" },
    forward: { headers: ["x-tenant"] },
    groups: {
      orders: defineGroup({
        prefix: "orders",
        endpoints: {
          get: endpoint
            .get(":id")
            .variables(z.object({ id: z.string() }))
            .cancelPrevious()
            .agent({ description: "One order by its id", access: "read" }),
        },
      }),
    },
  });
  return createMcpHandler({ sources: { accounts }, authorize: () => ({ id: "agent" }) });
}

/* The agent's call of the tool, as its client sends it over HTTP. */
function toolCall(id = "7"): Request {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/call",
      "mcp-name": "orders_get",
      ...AGENTS_HEADERS,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "orders_get",
        arguments: { id },
        _meta: { [META.protocolVersion]: "2026-07-28", [META.clientCapabilities]: {} },
      },
    }),
  });
}

async function answered(response: Response): Promise<boolean> {
  const body = (await response.json()) as { result?: { isError?: boolean } };
  return body.result !== undefined && body.result.isError !== true;
}

/* Whether the API saw any of what the agent's request carried, or a session made of it. */
function takenOfTheRequest(headers: IncomingHttpHeaders): string[] {
  return ["cookie", "authorization", "x-tenant", "x-forwarded-for"].filter(
    (name) => headers[name] !== undefined,
  );
}

describe("a tool's call, made while the agent's request is served", () => {
  it("takes nothing of the request a framework's registered context finds", async () => {
    const handler = mcp();
    const request = toolCall();
    const remove = registerRequestContext(() => webIncomingRequest(request));
    try {
      expect(await answered(await handler.handle(request))).toBe(true);
    } finally {
      remove();
    }

    expect(seen).toHaveLength(1);
    expect(takenOfTheRequest(seen[0] ?? {})).toEqual([]);
  });

  it("takes nothing of the request withIncomingRequest serves", async () => {
    const handler = mcp();
    const request = toolCall();

    const response = await withIncomingRequest(webIncomingRequest(request), () =>
      handler.handle(request),
    );

    expect(await answered(response)).toBe(true);
    expect(seen).toHaveLength(1);
    expect(takenOfTheRequest(seen[0] ?? {})).toEqual([]);
  });
});

describe("a tool's call on a server with a DOM shim, where no request is being served", () => {
  it("takes no session the DOM keeps, and two of one tool at once cancel neither", async () => {
    Reflect.set(globalThis, "document", {
      cookie: "sid=made-up-shim-session; token=made-up-shim-token",
    });
    const handler = mcp();

    /* Two orders, so that the reads share no request and only a cancellation could end one. */
    const ended = await Promise.all([handler.handle(toolCall("7")), handler.handle(toolCall("8"))]);

    expect(await Promise.all(ended.map(answered))).toEqual([true, true]);
    expect(seen).toHaveLength(2);
    expect(seen.flatMap(takenOfTheRequest)).toEqual([]);
  });
});
