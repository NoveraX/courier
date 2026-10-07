/**
 * The credentials a browser sends by itself — the answer to the
 * application's own login prompt, in `Basic`, `Digest`, `Negotiate` or
 * `NTLM` — kept from the APIs the application calls, unless the API or the
 * endpoint names `authorization`. A token a script set, `Bearer` or any
 * scheme of the API's own, goes on as before.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint, stream } = courier();
const BASIC = "Basic YWRhOmxvdmVsYWNl";

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

function api(allowedHeaders?: string[], name = "api") {
  return defineApi({
    name,
    baseURL: upstreamURL,
    allowedHeaders,
    endpoints: {
      ping: endpoint.post("ping"),
      admin: endpoint.post("admin").headers(["authorization"]),
      live: stream.response<number>().get("live"),
    },
  });
}

function proxied(path: string, authorization: string, init: RequestInit = {}): Promise<Response> {
  return createHandler().handle(
    new Request(`http://app.localhost/api/${path}`, {
      method: "POST",
      ...init,
      headers: { "content-type": "application/json", authorization, ...init.headers },
      body: init.method === "GET" ? null : JSON.stringify({}),
    }),
  );
}

describe("a proxied call", () => {
  it.each([
    BASIC,
    'Digest username="ada", realm="app"',
    "Negotiate YIIBnQYGKwYBBQUC",
    "NTLM TlRMTVNTUAABAAAA",
  ])("does not pass on the browser's %s", async (authorization) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSources({ api: api() });

    await proxied("request?_s=api&_m=ping", authorization);

    expect(seen[0]?.authorization).toBeUndefined();
  });

  it("passes on a token a script set", async () => {
    registerSources({ api: api() });

    await proxied("request?_s=api&_m=ping", "Bearer t1");
    await proxied("request?_s=api&_m=ping", "Token k1");

    expect(seen.map((headers) => headers.authorization)).toEqual(["Bearer t1", "Token k1"]);
  });

  it("passes the browser's credentials on to an API that names authorization", async () => {
    registerSources({ api: api(["authorization"]) });

    await proxied("request?_s=api&_m=ping", BASIC);

    expect(seen[0]?.authorization).toBe(BASIC);
  });

  it("passes them on for an endpoint that names authorization, and for no other", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSources({ api: api() });

    await proxied("request?_s=api&_m=admin", BASIC);
    await proxied("request?_s=api&_m=ping", BASIC);

    expect(seen.map((headers) => headers.authorization)).toEqual([BASIC, undefined]);
  });

  it("says once in the log why it kept them back, and how to pass them on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSources({ billing: api(undefined, "billing") });

    await proxied("request?_s=billing&_m=ping", BASIC);
    await proxied("request?_s=billing&_m=ping", BASIC);

    const lines = warn.mock.calls
      .flat()
      .map(String)
      .filter((line) => line.includes("billing"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Name "authorization" in the API\'s allowedHeaders');
  });

  it("opens a relayed stream without the browser's credentials", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    registerSources({ api: api() });
    const controller = new AbortController();

    const response = await proxied("sse?_s=api&_m=live", BASIC, {
      method: "GET",
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    controller.abort();
    await response.body?.cancel().catch(() => undefined);

    expect(seen[0]?.authorization).toBeUndefined();
  });
});

describe("a server-side caller given the request it serves", () => {
  it("does not pass on the browser's credentials, and sends one the caller set itself", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const incoming = new Request("http://app.localhost/page", {
      headers: { authorization: BASIC },
    });
    const forwarding = createCaller(api(), { context: { req: incoming } });
    const own = createCaller(api(), {
      context: { req: incoming },
      headers: { authorization: "Basic c2VydmljZTprZXk=" },
    });

    await forwarding.ping();
    await own.ping();

    expect(seen.map((headers) => headers.authorization)).toEqual([
      undefined,
      "Basic c2VydmljZTprZXk=",
    ]);
  });
});
