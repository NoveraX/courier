/**
 * The proxy route served by each h3 a Nuxt application can run.
 *
 * Nuxt 3 and 4 run Nitro 2, whose events come from h3 1.x and wrap Node's
 * request and response. h3 2.x hands the route a Web `Request` instead. The
 * adapter used to pass every event to the `fromWebHandler` of whichever h3
 * *it* resolved, and a package manager is free to resolve a different major
 * than Nitro's: in a fresh Nuxt 4 app npm picked h3 2.x for the adapter, and
 * every call answered 500 with "request.headers.get is not a function".
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createProxyCaller, registerSources } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { sendWebResponse } from "@noverax/courier/node";
import { H3, toNodeHandler } from "h3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

const { endpoint, stream } = courier();
const servers: Server[] = [];

/**
 * The public surface of an h3 1.x event, which is what Nitro 2 passes a
 * route. Its deprecated `req` and `res` are the Node objects, not a Web
 * `Request` — the difference that broke the adapter.
 */
class NodeEvent {
  readonly __is_event__ = true;
  readonly context = {};
  constructor(readonly node: { req: IncomingMessage; res: ServerResponse }) {}
  get req(): IncomingMessage {
    return this.node.req;
  }
  get res(): ServerResponse {
    return this.node.res;
  }
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An upstream that answers each call with what it received. */
async function echoUpstream(): Promise<string> {
  return listen(
    createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ method: req.method, body: Buffer.concat(chunks).toString() }));
      });
    }),
  );
}

/**
 * Serve one h3 1.x event per request, the way Nitro 2 does, answering 500
 * when the route throws.
 */
async function serveEvent(
  handler: (event: NodeEvent) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await sendWebResponse(await handler(new NodeEvent({ req, res })), res);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(error));
  }
}

function nodeEventHost(handler: (event: NodeEvent) => Promise<Response>): Server {
  return createServer((req, res) => serveEvent(handler, req, res));
}

function callerAt(origin: string) {
  return createProxyCaller("api", { proxyPath: { http: `${origin}/api/request` } }) as unknown as {
    echo: { create(variables: { name: string }): Promise<{ method: string; body: string }> };
  };
}

beforeEach(async () => {
  const baseURL = await echoUpstream();
  const echo = defineGroup({
    prefix: "echo",
    endpoints: { create: endpoint.post("").variables<{ name: string }>() },
  });
  registerSources({ api: defineApi({ baseURL, groups: { echo } }) });
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("the proxy route on h3 1.x, as Nuxt 3 and 4 run it", () => {
  it("serves a JSON call from an event that wraps Node's request", async () => {
    const origin = await listen(nodeEventHost(courierHandler()));

    const answer = await callerAt(origin).echo.create({ name: "ada" });

    expect(answer).toEqual({ method: "POST", body: '{"name":"ada"}' });
  });

  it("serves a call Nitro made in-process, whose body it handed over already read", async () => {
    const handler = courierHandler();
    const origin = await listen(
      createServer(async (req, res) => {
        /* Nitro's in-process fetch and its edge presets build a mock request
           that never streams: the body rides on the request as a value. */
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        Object.assign(req, { body: Buffer.concat(chunks).toString(), __unenv__: {} });
        await serveEvent(handler, req, res);
      }),
    );

    const answer = await callerAt(origin).echo.create({ name: "grace" });

    expect(answer).toEqual({ method: "POST", body: '{"name":"grace"}' });
  });

  it("streams SSE, and ends the stream when its client leaves", async () => {
    let finished = false;
    const ticks = stream.response<number>().implement(async function* (ctx) {
      try {
        for (let n = 0; !ctx.signal.aborted; n += 1) {
          yield { data: n };
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } finally {
        finished = true;
      }
    });
    registerSources({ live: defineApi({ baseURL: "https://upstream.test", endpoints: { ticks } }) });
    const origin = await listen(nodeEventHost(courierHandler()));

    const client = new AbortController();
    const response = await fetch(`${origin}/api/request?_s=live&_m=ticks`, {
      headers: { accept: "text/event-stream" },
      signal: client.signal,
    });
    const first = await response.body?.getReader().read();
    client.abort();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(new TextDecoder().decode(first?.value)).toContain("data: 0");
    await expect.poll(() => finished, { timeout: 2000 }).toBe(true);
  });
});

describe("the proxy route on h3 2.x", () => {
  it("serves a JSON call from an event that carries a Web request", async () => {
    const app = new H3();
    app.all("/api/request", courierHandler());
    const origin = await listen(createServer(toNodeHandler(app)));

    const answer = await callerAt(origin).echo.create({ name: "linus" });

    expect(answer).toEqual({ method: "POST", body: '{"name":"linus"}' });
  });
});
