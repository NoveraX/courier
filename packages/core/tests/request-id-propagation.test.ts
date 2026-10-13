/**
 * The request id a proxy in front of the application writes — nginx's
 * `$request_id` in `X-Request-Id`, a header of the deployment's own beside
 * it — reaches every upstream call made while serving that request, as it
 * came, so the application's logs and the APIs' join up: through the proxy
 * route and its streams, from server code given the request, while a page
 * renders, on every attempt a retry makes; and the API's own id comes back.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { retryMiddleware } from "../src/middleware";
import { webIncomingRequest, withIncomingRequest } from "../src/node";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint, stream } = courier();

/* As nginx writes it, and the deployment's own copy beside it. */
const NGINX = {
  "x-request-id": "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4",
  "x-edge-request-id": "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4",
  "x-edge-env": "production",
};

let upstream: Server;
let upstreamURL: string;
const seen: IncomingHttpHeaders[] = [];
let failures = 0;

beforeEach(async () => {
  upstream = createServer((req, res) => {
    seen.push(req.headers);
    if (req.url?.startsWith("/live")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("data: 1\n\n");
      return;
    }
    if (req.url?.startsWith("/flaky") && failures > 0) {
      failures -= 1;
      res.writeHead(503).end();
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "x-request-id": String(req.headers["x-request-id"] ?? "none"),
    });
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  _resetSourcesForTests();
  seen.length = 0;
  failures = 0;
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

/* An API forwarding the request id and the deployment's own headers, as a site behind nginx does. */
function siteApi() {
  return defineApi({
    name: "site",
    baseURL: upstreamURL,
    forward: { requestId: true, headers: ["x-edge-request-id", "x-edge-env"] },
    endpoints: {
      read: endpoint.get("read"),
      write: endpoint.post("write"),
      flaky: endpoint.get("flaky").use(retryMiddleware({ limit: 2, delay: 1 })),
      live: stream.response<number>().get("live"),
    },
  });
}

function proxied(path: string, init: RequestInit = {}) {
  return createHandler().handle(
    new Request(`http://app.localhost/api/${path}`, {
      method: "POST",
      body: init.method === "GET" ? null : JSON.stringify({}),
      ...init,
      headers: { "content-type": "application/json", ...NGINX, ...init.headers },
    }),
  );
}

function ids(): Array<[unknown, unknown, unknown]> {
  return seen.map((headers) => [
    headers["x-request-id"],
    headers["x-edge-request-id"],
    headers["x-edge-env"],
  ]);
}

const KEPT: [string, string, string] = [
  NGINX["x-request-id"],
  NGINX["x-edge-request-id"],
  NGINX["x-edge-env"],
];

describe("a request id nginx wrote", () => {
  it("reaches the API through the proxy route, on a read and on a write", async () => {
    registerSources({ site: siteApi() });

    await proxied("request?_s=site&_m=read", { method: "GET" });
    await proxied("request?_s=site&_m=write");

    expect(ids()).toEqual([KEPT, KEPT]);
  });

  it("comes back with the API's answer, for the browser to show", async () => {
    registerSources({ site: siteApi() });

    const response = await proxied("request?_s=site&_m=read", { method: "GET" });

    expect(response.headers.get("x-request-id")).toBe(NGINX["x-request-id"]);
  });

  it("opens a relayed stream with it", async () => {
    registerSources({ site: siteApi() });
    const controller = new AbortController();

    const response = await proxied("sse?_s=site&_m=live", {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    await response.body?.cancel().catch(() => undefined);

    expect(ids()).toEqual([KEPT]);
  });

  it("is sent again on every attempt a retry makes", async () => {
    registerSources({ site: siteApi() });
    failures = 2;

    await proxied("request?_s=site&_m=flaky", { method: "GET" });

    expect(ids()).toEqual([KEPT, KEPT, KEPT]);
  });

  it("reaches the API from server code given the request, as middleware is", async () => {
    const request = new Request("https://shop.example/ceny", { headers: NGINX });

    await createCaller(siteApi(), { context: { req: request } }).read();

    expect(ids()).toEqual([KEPT]);
  });

  it("is the same for every call a page makes while it renders, and two like reads share one", async () => {
    const api = createCaller(siteApi());
    const page = new Request("https://shop.example/", { headers: NGINX });

    const answers = await withIncomingRequest(webIncomingRequest(page), async () =>
      Promise.all([api.read(), api.write(), api.read()]),
    );

    expect(answers).toHaveLength(3);
    expect(ids()).toEqual([KEPT, KEPT]);
  });
});
