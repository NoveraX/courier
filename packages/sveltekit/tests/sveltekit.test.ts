/**
 * The SvelteKit adapter, served the way `adapter-node` serves it.
 *
 * SvelteKit's request signal fires only while the body is still uploading,
 * so a browser that cancelled a call afterwards left the proxy's upstream
 * request running to completion. `adapter-node` hands over the Node request
 * as `platform.req`, and its socket says when the client has gone.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { registerSources } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { sendWebResponse } from "@noverax/courier/node";
import { afterEach, describe, expect, it } from "vitest";

import { courierHandler } from "../src/index";

const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** An upstream that answers after three seconds and notes a caller that left. */
async function slowUpstream(): Promise<{ url: string; abandoned: () => boolean }> {
  let abandoned = false;
  const url = await listen(
    createServer((req, res) => {
      res.once("close", () => {
        if (!res.writableFinished) abandoned = true;
      });
      req.resume();
      setTimeout(() => res.end("{}"), 3000);
    }),
  );
  return { url, abandoned: () => abandoned };
}

/** The request SvelteKit's `getRequest` builds: no signal once the body is in. */
function sveltekitRequest(req: IncomingMessage, base: string): Request {
  return new Request(`${base}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "POST" ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
}

describe("a call the browser cancels", () => {
  it("stops the upstream request", async () => {
    const upstream = await slowUpstream();
    const { endpoint } = courier();
    registerSources({ api: defineApi({ baseURL: upstream.url, endpoints: { slow: endpoint.post("slow") } }) });
    const handler = courierHandler();
    const proxy = await listen(
      createServer(async (req, res) => {
        const request = sveltekitRequest(req, "http://127.0.0.1");
        await sendWebResponse(await handler({ request, platform: { req } }), res);
      }),
    );

    const browser = new AbortController();
    const call = fetch(`${proxy}/api/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "api", method: "slow" }),
      signal: browser.signal,
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 300));
    browser.abort();
    await call;

    await expect.poll(upstream.abandoned, { timeout: 1500 }).toBe(true);
  });
});

describe("a call the browser waits for", () => {
  async function fastProxy(onAnswered: (listeners: { before: number; after: number }) => void) {
    const upstream = await listen(createServer((_req, res) => res.end('{"ok":true}')));
    const { endpoint } = courier();
    registerSources({ api: defineApi({ baseURL: upstream, endpoints: { fast: endpoint.post("fast") } }) });
    const handler = courierHandler();
    return listen(
      createServer(async (req, res) => {
        const before = req.socket.listenerCount("close");
        const response = await handler({ request: sveltekitRequest(req, "http://127.0.0.1"), platform: { req } });
        onAnswered({ before, after: req.socket.listenerCount("close") });
        await sendWebResponse(response, res);
      }),
    );
  }

  it("is answered, and the socket is no longer watched once it is", async () => {
    let counts: { before: number; after: number } | undefined;
    const proxy = await fastProxy((observed) => {
      counts = observed;
    });

    const response = await fetch(`${proxy}/api/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "api", method: "fast" }),
    });

    expect(await response.json()).toEqual({ ok: true });
    expect(counts?.after).toBe(counts?.before);
  });

  it("is answered on a server that exposes no connection", async () => {
    const upstream = await listen(createServer((_req, res) => res.end('{"ok":true}')));
    const { endpoint } = courier();
    registerSources({ api: defineApi({ baseURL: upstream, endpoints: { fast: endpoint.post("fast") } }) });
    const request = new Request("http://127.0.0.1/api/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "api", method: "fast" }),
    });

    const response = await courierHandler()({ request });

    expect(await response.json()).toEqual({ ok: true });
  });
});
