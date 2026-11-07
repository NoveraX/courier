/**
 * The proxy route on the servers TanStack Start runs on — its dev server,
 * `vite preview` and Nitro — which build each request with srvx from
 * Node's own, as here: a call the browser gives up on stops upstream, the
 * user's address is the socket's peer after the chain a local proxy
 * recorded, and Studio learns where the server listens, whatever Host the
 * request names.
 */
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi, type Sources } from "@noverax/courier/define";
import { getAppOrigin, setAppOrigin } from "@noverax/courier/server";
import { NodeRequest, sendNodeResponse } from "srvx/node";
import { afterEach, describe, expect, it } from "vitest";

import { _resetSourcesForTests } from "../../core/src/server/sources";
import { startUpstream, type Upstream } from "../../core/tests/helpers/upstream";
import { apiRoute, type ServerRouteHandler } from "../src/index";

const { endpoint } = courier();

let upstream: Upstream | undefined;
let app: Server | undefined;

afterEach(async () => {
  app?.closeAllConnections();
  await new Promise<void>((resolve) => (app ? app.close(() => resolve()) : resolve()));
  app = undefined;
  await upstream?.close();
  upstream = undefined;
  _resetSourcesForTests();
  setAppOrigin(undefined);
});

/* A server that hands each request to the route as TanStack Start's own servers do. */
async function serve(handler: ServerRouteHandler): Promise<string> {
  app = createServer(async (req, res) => {
    await sendNodeResponse(res, await handler({ request: new NodeRequest({ req, res }) }));
  });
  await new Promise<void>((resolve) => app?.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
}

function sourcesFor(upstreamUrl: string): Sources {
  return {
    api: defineApi({
      expose: true,
      baseURL: upstreamUrl,
      endpoints: { slow: endpoint.get("slow"), whoami: endpoint.get("whoami") },
    }),
  };
}

describe("the proxy route on srvx", () => {
  it("stops the upstream call when the browser gives up on it", async () => {
    let arrived: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    let closed: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => {
      closed = resolve;
    });
    upstream = await startUpstream((_request, res: ServerResponse) => {
      res.once("close", closed);
      arrived();
    });
    const url = await serve(apiRoute({ sources: sourcesFor(upstream.url) }).GET);
    const browser = new AbortController();

    const call = fetch(`${url}/api/request?_s=api&_m=slow`, { signal: browser.signal });
    await reached;
    browser.abort();

    await expect(call).rejects.toThrow();
    await stopped;
  });

  it("names the user by the socket's peer, after the chain a local proxy recorded", async () => {
    upstream = await startUpstream((request, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ forwardedFor: request.headers["x-forwarded-for"] ?? null }));
    });
    const url = await serve(apiRoute({ sources: sourcesFor(upstream.url) }).GET);

    const response = await fetch(`${url}/api/request?_s=api&_m=whoami`, {
      headers: { "x-forwarded-for": "203.0.113.7" },
    });

    expect(await response.json()).toEqual({ forwardedFor: "203.0.113.7, 127.0.0.1" });
  });

  it("tells Studio where the server listens, whatever Host the request names", async () => {
    upstream = await startUpstream((_request, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
    const url = await serve(apiRoute({ sources: sourcesFor(upstream.url) }).GET);

    await fetch(`${url}/api/request?_s=api&_m=whoami`, { headers: { host: "evil.example:4444" } });

    expect(getAppOrigin()).toBe(url.replace("127.0.0.1", "localhost"));
  });
});
