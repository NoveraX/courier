/**
 * The proxy's limit on each caller, end to end through `createHandler`: a
 * caller past its budget is answered 429 with the time to wait and never
 * reaches the API, whoever else keeps calling; a caller is the user's
 * address however the user forges one, an IPv6 /64 network counting as
 * one; writes have a budget of their own; and every answer tells the
 * caller what is left.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import { rememberPeerAddress } from "../../src/adapter/peer-address";
import type { ProxyRateLimit, RateLimitStore } from "../../src/adapter/rate-limit/types";
import { courier, defineApi } from "../../src/define/index";
import { ConfigurationError } from "../../src/errors/configuration-error";

const { endpoint, stream } = courier();

let upstream: Server;
let upstreamURL: string;
let reached = 0;

beforeEach(async () => {
  reached = 0;
  upstream = createServer((req, res) => {
    reached += 1;
    if (req.url?.startsWith("/live")) {
      res.writeHead(200, { "content-type": "text/event-stream" }).end("data: 1\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamURL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function handler(rateLimit: ProxyRateLimit) {
  const api = defineApi({
    baseURL: upstreamURL,
    endpoints: {
      read: endpoint.get("read"),
      write: endpoint.post("write"),
      live: stream.response<number>().get("live"),
    },
  });
  return createHandler({ sources: { api }, rateLimit });
}

type Handler = ReturnType<typeof handler>;

/* A call from `peer`, as the adapter reports the connection, with the headers given. */
function call(
  proxy: Handler,
  method: "read" | "write",
  peer: string | undefined,
  headers: Record<string, string> = {},
) {
  const write = method === "write";
  const request = new Request(`http://app.localhost/api/request?_s=api&_m=${method}`, {
    method: write ? "POST" : "GET",
    headers: { "content-type": "application/json", ...headers },
    body: write ? JSON.stringify({}) : null,
  });
  rememberPeerAddress(request, peer);
  return proxy.handle(request);
}

async function statuses(
  proxy: Handler,
  count: number,
  ...args: Parameters<typeof call> extends [Handler, ...infer R] ? R : never
) {
  const seen: number[] = [];
  for (let index = 0; index < count; index += 1) seen.push((await call(proxy, ...args)).status);
  return seen;
}

describe("a caller past its budget", () => {
  it("is answered 429 with the time to wait, and the API never sees the call", async () => {
    const proxy = handler({ requests: 2, window: 60_000 });

    expect(await statuses(proxy, 2, "read", "198.51.100.23")).toEqual([200, 200]);
    const refused = await call(proxy, "read", "198.51.100.23");

    expect(refused.status).toBe(429);
    expect(await refused.json()).toMatchObject({ success: false, code: "RATE_LIMITED" });
    expect(refused.headers.get("retry-after")).toBe("30");
    expect(refused.headers.get("ratelimit")).toBe('"calls";r=0;t=60');
    expect(refused.headers.get("ratelimit-policy")).toBe('"calls";q=2;w=60');
    expect(reached).toBe(2);
  });

  it("does not hold back another caller", async () => {
    const proxy = handler({ requests: 1, window: 60_000 });

    expect(await statuses(proxy, 2, "read", "198.51.100.23")).toEqual([200, 429]);
    expect((await call(proxy, "read", "198.51.100.24")).status).toBe(200);
  });

  it("is the user's address, whatever the user claims", async () => {
    const proxy = handler({ requests: 1, window: 60_000 });
    const claims = (n: number) => ({
      "x-forwarded-for": `6.6.6.${n}`,
      "x-client-ip": `6.6.6.${n}`,
    });

    expect((await call(proxy, "read", "198.51.100.23", claims(1))).status).toBe(200);
    expect((await call(proxy, "read", "198.51.100.23", claims(2))).status).toBe(429);
  });

  it("is told apart behind a proxy in front, and a chain the user writes does not make a new one", async () => {
    const proxy = handler({ requests: 1, window: 60_000 });

    expect(
      (await call(proxy, "read", "10.0.0.2", { "x-forwarded-for": "198.51.100.23" })).status,
    ).toBe(200);
    expect(
      (await call(proxy, "read", "10.0.0.2", { "x-forwarded-for": "198.51.100.24" })).status,
    ).toBe(200);
    expect(
      (await call(proxy, "read", "10.0.0.2", { "x-forwarded-for": "6.6.6.6, 198.51.100.23" }))
        .status,
    ).toBe(429);
  });

  it("is told apart where the framework reports no connection, behind an edge proxy the deployment names", async () => {
    vi.stubEnv("COURIER_TRUSTED_PROXIES", "203.0.113.50");
    const proxy = handler({ requests: 1, window: 60_000 });
    const from = (user: string) => ({ "x-forwarded-for": `${user}, 203.0.113.50` });

    expect((await call(proxy, "read", undefined, from("198.51.100.23"))).status).toBe(200);
    expect((await call(proxy, "read", undefined, from("198.51.100.24"))).status).toBe(200);
    expect((await call(proxy, "read", undefined, from("198.51.100.23"))).status).toBe(429);
  });

  it("counts an IPv6 /64 network as one caller", async () => {
    const proxy = handler({ requests: 1, window: 60_000 });

    expect((await call(proxy, "read", "2001:db8:0:7::1")).status).toBe(200);
    expect((await call(proxy, "read", "2001:db8:0:7:ffff::2")).status).toBe(429);
    expect((await call(proxy, "read", "2001:db8:0:8::1")).status).toBe(200);
  });
});

describe("writes", () => {
  it("take from a budget of their own as well, and reads go on when it is spent", async () => {
    const proxy = handler({
      requests: 10,
      window: 60_000,
      writes: { requests: 1, window: 60_000 },
    });

    expect(await statuses(proxy, 2, "write", "198.51.100.23")).toEqual([200, 429]);
    expect((await call(proxy, "read", "198.51.100.23")).status).toBe(200);
  });

  it("tell the caller what is left of both budgets", async () => {
    const proxy = handler({
      requests: 10,
      window: 60_000,
      writes: { requests: 5, window: 60_000 },
    });

    const response = await call(proxy, "write", "198.51.100.23");

    expect(response.headers.get("ratelimit-policy")).toBe('"writes";q=5;w=60, "calls";q=10;w=60');
    expect(response.headers.get("ratelimit")).toBe('"writes";r=4;t=12, "calls";r=9;t=6');
  });
});

describe("a stream", () => {
  it("takes from its caller's budget as it opens", async () => {
    const proxy = handler({ requests: 1, window: 60_000 });
    const open = () => {
      const request = new Request("http://app.localhost/api/sse?_s=api&_m=live", {
        headers: { accept: "text/event-stream" },
      });
      rememberPeerAddress(request, "198.51.100.23");
      return proxy.handle(request);
    };

    const first = await open();
    await first.body?.cancel().catch(() => undefined);

    expect(first.status).toBe(200);
    expect((await open()).status).toBe(429);
  });
});

describe("the key", () => {
  it("counts the callers it names, and leaves out the requests it names none for", async () => {
    const proxy = handler({
      requests: 1,
      window: 60_000,
      key: (request) => request.headers.get("cookie")?.match(/sid=(\w+)/)?.[1],
    });

    expect((await call(proxy, "read", "198.51.100.23", { cookie: "sid=ada" })).status).toBe(200);
    expect((await call(proxy, "read", "198.51.100.23", { cookie: "sid=bob" })).status).toBe(200);
    expect((await call(proxy, "read", "198.51.100.23", { cookie: "sid=ada" })).status).toBe(429);
    expect(await statuses(proxy, 3, "read", "198.51.100.23")).toEqual([200, 200, 200]);
  });
});

describe("the store", () => {
  it("is asked for each budget a call takes, under the caller's key", async () => {
    const take = vi.fn<RateLimitStore["take"]>(async () => ({
      allowed: true,
      remaining: 1,
      resetMs: 1000,
      retryAfterMs: 0,
    }));
    const proxy = handler({
      requests: 5,
      window: 60_000,
      writes: { requests: 2, window: 1000 },
      store: { take },
    });

    await call(proxy, "write", "198.51.100.23");

    expect(take.mock.calls).toEqual([
      ["writes:198.51.100.23", { requests: 2, window: 1000 }],
      ["calls:198.51.100.23", expect.objectContaining({ requests: 5, window: 60_000 })],
    ]);
  });
});

describe("a rateLimit that cannot work", () => {
  it.each([
    [{ requests: 0, window: 1000 }, "requests is a whole number of calls"],
    [{ requests: 1.5, window: 1000 }, "requests is a whole number of calls"],
    [{ requests: 10, window: 0 }, "window is a number of milliseconds"],
    [{ requests: 10, window: 1000, writes: { requests: 1 } }, "writes window"],
    [{ requests: 10, window: 1000, key: "ip" }, "key is a function"],
    [{ requests: 10, window: 1000, store: {} }, "store is a RateLimitStore"],
  ])("is refused where the handler is made: %j", (rateLimit, problem) => {
    const make = () => createHandler({ rateLimit: rateLimit as never });

    expect(make).toThrow(ConfigurationError);
    expect(make).toThrow(problem);
  });
});

describe("browsersOnly", () => {
  it("refuses what no browser sent, and serves what one did", async () => {
    const api = defineApi({ baseURL: upstreamURL, endpoints: { read: endpoint.get("read") } });
    const proxy = createHandler({ sources: { api }, browsersOnly: true });
    const read = (headers: Record<string, string>) =>
      proxy.handle(new Request("http://app.localhost/api/request?_s=api&_m=read", { headers }));

    const script = await read({});

    expect(script.status).toBe(403);
    expect(await script.json()).toMatchObject({ code: "BROWSERS_ONLY" });
    expect((await read({ "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect((await read({ origin: "http://app.localhost" })).status).toBe(200);
    expect(reached).toBe(2);
  });
});
