/**
 * The headers an API sets itself against the copies a browser forwards.
 *
 * A browser's `Authorization`, `Referer`, `Origin`, `User-Agent` and
 * `X-Request-Id` go on to the upstream, through the proxy route or from the
 * request a server-side caller is given. They fill in what the server side
 * leaves unset; they never replace what it set — the API's `headers`, its
 * session, a middleware, an endpoint's closure, a caller's own. A service
 * token the API sends reaches its upstream whatever the page writes.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import type { Middleware } from "../src/middleware/types";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint, stream } = courier();

const OWN = {
  authorization: "Bearer server-token",
  referer: "https://shop.example/",
  "x-request-id": "server-request",
} as const;

const FORGED = {
  authorization: "Bearer page-token",
  referer: "https://attacker.example/",
  "x-request-id": "page-request",
} as const;

let upstream: Server;
let upstreamURL: string;
const seen: IncomingHttpHeaders[] = [];

beforeEach(async () => {
  upstream = createServer((req, res) => {
    seen.push(req.headers);
    if (req.url?.startsWith("/live")) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end("data: 1\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  _resetSourcesForTests();
  seen.length = 0;
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function api(options: { headers?: HeadersInit; middleware?: Middleware[] } = {}) {
  return defineApi({
    name: "api",
    baseURL: upstreamURL,
    ...options,
    endpoints: {
      read: endpoint.get("read"),
      write: endpoint.post("write"),
      closure: endpoint.via((http) =>
        http.get("closure", undefined, { headers: { authorization: "Bearer closure-token" } }),
      ),
      live: stream.response<number>().get("live"),
    },
  });
}

function proxied(path: string, headers: Record<string, string>, init: RequestInit = {}) {
  return createHandler().handle(
    new Request(`http://app.localhost/api/${path}`, {
      method: "POST",
      body: init.method === "GET" ? null : JSON.stringify({}),
      ...init,
      headers: { "content-type": "application/json", ...headers, ...init.headers },
    }),
  );
}

function sent(names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, seen[0]?.[name]]));
}

describe("a header the API sets in its headers", () => {
  it("reaches the upstream over a browser's copy, on a write through the proxy", async () => {
    registerSources({ api: api({ headers: OWN }) });

    await proxied("request?_s=api&_m=write", FORGED);

    expect(sent(Object.keys(OWN))).toEqual(OWN);
  });

  it("reaches the upstream over a browser's copy, on a read through the proxy", async () => {
    registerSources({ api: api({ headers: OWN }) });

    await proxied("request?_s=api&_m=read", FORGED, { method: "GET" });

    expect(sent(Object.keys(OWN))).toEqual(OWN);
  });

  it("opens a relayed stream with the API's own", async () => {
    registerSources({ api: api({ headers: OWN }) });
    const controller = new AbortController();

    const response = await proxied("sse?_s=api&_m=live", FORGED, {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    await response.body?.cancel().catch(() => undefined);

    expect(sent(Object.keys(OWN))).toEqual(OWN);
  });

  it("reaches the upstream over the copy a server-side caller's request carries", async () => {
    const incoming = new Request("http://app.localhost/page", { headers: FORGED });

    await createCaller(api({ headers: OWN }), { context: { req: incoming } }).read();

    expect(sent(Object.keys(OWN))).toEqual(OWN);
  });

  it("wins whichever way the API writes it: as Headers, as pairs, in any case", async () => {
    registerSources({
      api: api({ headers: new Headers({ Authorization: OWN.authorization }) }),
      pairs: defineApi({
        name: "pairs",
        baseURL: upstreamURL,
        headers: [["Referer", OWN.referer]],
        endpoints: { read: endpoint.get("read") },
      }),
    });

    await proxied("request?_s=api&_m=write", FORGED);
    await proxied("request?_s=pairs&_m=read", FORGED, { method: "GET" });

    expect(seen.map((headers) => [headers.authorization, headers.referer])).toEqual([
      [OWN.authorization, FORGED.referer],
      [FORGED.authorization, OWN.referer],
    ]);
  });
});

describe("a header the server side sets on the call", () => {
  it("is the one sent when a middleware sets it", async () => {
    const stamp: Middleware = {
      name: "stamp",
      phase: "before",
      handler: (ctx) => {
        ctx.headers.set("authorization", "Bearer middleware-token");
      },
    };
    registerSources({ api: api({ headers: OWN, middleware: [stamp] }) });

    await proxied("request?_s=api&_m=write", FORGED);

    expect(seen[0]?.authorization).toBe("Bearer middleware-token");
  });

  it("is the one sent when the endpoint's closure sets it", async () => {
    registerSources({ api: api({ headers: OWN }) });

    await proxied("request?_s=api&_m=closure", FORGED);

    expect(seen[0]?.authorization).toBe("Bearer closure-token");
  });

  it("is the one sent when the session sends the user's token from its cookie", async () => {
    registerSources({
      session: defineApi({
        name: "session",
        baseURL: upstreamURL,
        session: { bearer: "access_token" },
        endpoints: { read: endpoint.get("read") },
      }),
    });

    await proxied(
      "request?_s=session&_m=read",
      { ...FORGED, cookie: "access_token=user-token" },
      {
        method: "GET",
      },
    );

    expect(seen[0]?.authorization).toBe("Bearer user-token");
  });
});

describe("a header the server side leaves unset", () => {
  it("goes on as the browser sent it", async () => {
    registerSources({ api: api() });

    await proxied("request?_s=api&_m=write", FORGED);

    expect(sent(Object.keys(FORGED))).toEqual(FORGED);
  });

  it("goes on as a request id only when it is one", async () => {
    registerSources({ api: api() });

    await proxied("request?_s=api&_m=write", { "x-request-id": "a b\tc" });
    await proxied("request?_s=api&_m=write", { "x-request-id": "x".repeat(129) });
    await proxied("request?_s=api&_m=write", { "x-request-id": "req_01H8Z:7f/+=" });

    expect(seen.map((headers) => headers["x-request-id"])).toEqual([
      undefined,
      undefined,
      "req_01H8Z:7f/+=",
    ]);
  });
});
