/**
 * The SolidStart adapter, served the way its dev server serves it.
 *
 * The dev server builds the Web request with no signal that fires when the
 * browser leaves, so a call it cancelled left the proxy's upstream request
 * running to completion. The event's `nativeEvent` carries the Node response,
 * whose early close says the client has gone.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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

/** The event SolidStart hands a route: a signal-less request, and h3's event. */
function solidEvent(req: IncomingMessage, res: ServerResponse) {
  const request = new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: req.method === "POST" ? (Readable.toWeb(req) as ReadableStream) : undefined,
    // @ts-expect-error -- required by the platform for a streaming body
    duplex: "half",
  });
  return { request, nativeEvent: { node: { req, res } } };
}

describe("a call the browser cancels", () => {
  it("stops the upstream request", async () => {
    const upstream = await slowUpstream();
    const { endpoint } = courier();
    registerSources({ api: defineApi({ baseURL: upstream.url, endpoints: { slow: endpoint.post("slow") } }) });
    const handler = courierHandler();
    const proxy = await listen(
      createServer(async (req, res) => {
        await sendWebResponse(await handler(solidEvent(req, res)), res);
      }),
    );

    const browser = new AbortController();
    const call = fetch(`${proxy}/api/request?_s=api&_m=slow`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      signal: browser.signal,
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 300));
    browser.abort();
    await call;

    await expect.poll(upstream.abandoned, { timeout: 1500 }).toBe(true);
  });
});

describe("a call the browser waits for", () => {
  it("is answered", async () => {
    const upstream = await listen(createServer((_req, res) => res.end('{"ok":true}')));
    const { endpoint } = courier();
    registerSources({ api: defineApi({ baseURL: upstream, endpoints: { fast: endpoint.post("fast") } }) });
    const handler = courierHandler();
    const proxy = await listen(
      createServer(async (req, res) => {
        await sendWebResponse(await handler(solidEvent(req, res)), res);
      }),
    );

    const response = await fetch(`${proxy}/api/request?_s=api&_m=fast`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(await response.json()).toEqual({ ok: true });
  });
});
