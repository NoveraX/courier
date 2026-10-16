/**
 * A proxied stream that keeps to its origin: a redirect on the stream's own
 * origin is followed with the stream's headers, one to another origin is
 * not — the headers never reach it — and the stream ends refused rather
 * than asking again and again for the same redirect.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { createProxySSEFactory } from "../src/transport/proxy/sse";

const servers: Server[] = [];

async function serve(handle: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  const server = createServer(handle);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function collect(
  subscription: AsyncIterable<unknown>,
): Promise<{ events: unknown[]; error?: unknown }> {
  const events: unknown[] = [];
  try {
    for await (const event of subscription) events.push(event);
    return { events };
  } catch (error) {
    return { events, error };
  }
}

describe("a proxied stream that keeps to its origin", () => {
  it("does not follow a redirect to another origin, and ends refused", async () => {
    const elsewhere: string[] = [];
    const other = await serve((req, res) => {
      elsewhere.push(String(req.headers["x-once"]));
      res.writeHead(200, { "content-type": "text/event-stream" }).end('data: {"n":1}\n\n');
    });
    let asked = 0;
    const route = await serve((_req, res) => {
      asked += 1;
      res.writeHead(307, { location: `${other}/api/sse` }).end();
    });
    const subscribe = createProxySSEFactory("api", {
      proxyPath: { sse: `${route}/api/sse` },
      connectHeaders: () => ({ "x-once": "pass" }),
      withinOrigin: true,
    });

    const { events, error } = await collect(subscribe("live", "feed", {}, {}));

    expect(elsewhere).toEqual([]);
    expect(events).toEqual([]);
    expect(error).toBeInstanceOf(Error);
    expect(asked).toBe(1);
  });

  it("follows a redirect on its own origin, its headers with it", async () => {
    const seen: string[] = [];
    let route = "";
    route = await serve((req, res) => {
      if (req.url?.startsWith("/api/sse/")) {
        seen.push(String(req.headers["x-once"]));
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end('data: {"n":1}\n\nevent: courier:end\ndata: {}\n\n');
        return;
      }
      res
        .writeHead(308, { location: `${route}/api/sse/${req.url?.slice("/api/sse".length)}` })
        .end();
    });
    const subscribe = createProxySSEFactory("api", {
      proxyPath: { sse: `${route}/api/sse` },
      connectHeaders: () => ({ "x-once": "pass" }),
      withinOrigin: true,
    });

    const subscription = subscribe("live", "feed", {}, {});
    const first = await subscription[Symbol.asyncIterator]().next();
    subscription.close();

    expect(first.value).toEqual({ data: { n: 1 } });
    expect(seen).toEqual(["pass"]);
  });
});
