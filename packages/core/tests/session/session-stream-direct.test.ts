/**
 * A stream of an API that keeps a session, opened by a direct caller, end
 * to end on a real upstream: each connection carries the user's session as
 * a read over HTTP does — read anew when the stream reconnects — and the
 * cookies its answer sets are kept as a call's are.
 */
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define";
import { createProxyCaller } from "../../src/proxy-caller";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";

const { stream } = courier();
const closers: Array<() => Promise<void>> = [];
const seen: IncomingHttpHeaders[] = [];
let answer: (res: ServerResponse) => void = () => {};

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const close of closers.splice(0).reverse()) await close();
  seen.length = 0;
});

/* An upstream that answers each connection with one event, then drops it. */
async function upstream(): Promise<string> {
  const server = createServer((req, res) => {
    seen.push(req.headers);
    answer(res);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`retry: 10\ndata: ${seen.length}\n\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function feedApi(baseURL: string, options: { credentials?: RequestCredentials } = {}) {
  return defineApi({
    name: "feed",
    baseURL,
    ...options,
    session: { cookies: ["sid"], bearer: "access_token" },
    forward: { userAgent: true },
    endpoints: { live: stream.response<number>().get("live") },
  });
}

/* Read `count` events of a stream, then close it. */
async function take(sub: AsyncIterable<{ data: unknown }> & { close(): void }, count: number) {
  const got: unknown[] = [];
  for await (const event of sub) {
    got.push(event.data);
    if (got.length === count) break;
  }
  sub.close();
  return got;
}

function spyOnFetch() {
  const real = globalThis.fetch;
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => real(input, init));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("a stream a server opens while serving a user", () => {
  it("carries the session's cookies, bearer and forwarded headers on every connection", async () => {
    const api = feedApi(await upstream());
    const handed: RelayedCookie[] = [];
    const serving: IncomingRequest = {
      key: {},
      method: "GET",
      headers: new Headers({
        cookie: "sid=a1; access_token=t1; theme=dark",
        "user-agent": "Browser/1",
      }),
      setCookie: (cookie) => {
        handed.push(cookie);
        return true;
      },
    };
    const remove = registerRequestContext(() => serving);
    let renewed = false;
    answer = (res) => {
      if (renewed) return;
      renewed = true;
      res.setHeader("set-cookie", "sid=a2; Path=/; HttpOnly");
    };

    const sub = createCaller(api).live();
    remove();
    expect(await take(sub, 2)).toEqual([1, 2]);

    expect(seen[0]).toMatchObject({
      cookie: "sid=a1",
      authorization: "Bearer t1",
      "user-agent": "Browser/1",
    });
    expect(seen[1]?.cookie).toBe("sid=a2");
    expect(handed.map((relayed) => relayed.cookie.name)).toEqual(["sid"]);
  });
});

describe("a stream a browser opens", () => {
  it("asks the browser for its cookies, and repeats the bearer the page reads now", async () => {
    const api = feedApi(await upstream());
    const fetchSpy = spyOnFetch();
    const page = { cookie: "access_token=t1" };
    vi.stubGlobal("document", page);
    answer = () => {
      page.cookie = "access_token=t2";
    };

    expect(await take(createCaller(api).live(), 2)).toEqual([1, 2]);

    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe("include");
    expect(seen.map((headers) => headers.authorization)).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("is fetched with the API's own credentials, where it sets them", async () => {
    const api = feedApi(await upstream(), { credentials: "same-origin" });
    const fetchSpy = spyOnFetch();
    vi.stubGlobal("document", { cookie: "" });

    await take(createCaller(api).live(), 1);

    expect(fetchSpy.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
  });
});

describe("a stream a React Native app opens", () => {
  it("repeats the bearer an answer set, as the app's calls learn it", async () => {
    const api = feedApi(await upstream());
    vi.stubGlobal("navigator", { product: "ReactNative" });
    answer = (res) => {
      if (seen.length === 1) res.setHeader("set-cookie", "access_token=t3; Path=/");
    };

    expect(await take(createCaller(api).live(), 2)).toEqual([1, 2]);

    expect(seen.map((headers) => headers.authorization)).toEqual([undefined, "Bearer t3"]);
  });
});

describe("a stream a proxy caller opens", () => {
  it("sends the browser's cookies to the proxy route, as the caller's calls do", async () => {
    const base = await upstream();
    const fetchSpy = spyOnFetch();
    const api = feedApi(base);
    const included = createProxyCaller<typeof api>("feed", {
      source: api,
      proxyPath: { sse: `${base}/sse` },
    });
    const omitted = createProxyCaller<typeof api>("feed", {
      source: api,
      proxyPath: { sse: `${base}/sse` },
      credentials: "omit",
    });

    await take(included.live(), 1);
    await take(omitted.live(), 1);

    expect(fetchSpy.mock.calls.map((call) => call[1]?.credentials)).toEqual(["include", "omit"]);
  });
});
