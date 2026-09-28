/**
 * Which cookies cross the proxy, over real HTTP.
 *
 * The proxy used to hand every upstream the browser's whole Cookie header
 * and every page the upstream's Set-Cookie. A source that points at a third
 * party then received the application's own session, and could set cookies
 * on the application's origin. Now neither crosses unless the source, a
 * base its endpoints extend, or the endpoint itself names it: `cookie` for
 * the browser's cookies going up, `set-cookie` for the upstream's coming
 * back.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { courier, defineApi } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { type ProxyServer, startProxyServer } from "./helpers/proxy-server";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
let upstream: Upstream;
let proxy: ProxyServer;

beforeEach(async () => {
  upstream = await startUpstream((request, res) => {
    res.writeHead(200, {
      "content-type": "application/json",
      "set-cookie": ["session=upstream; Path=/; HttpOnly", "theme=dark; Path=/"],
    });
    res.end(JSON.stringify({ cookie: request.headers.cookie ?? null }));
  });
  proxy = await startProxyServer();
});

afterEach(async () => {
  _resetSourcesForTests();
  await proxy.close();
  await upstream.close();
});

/** A browser call, carrying the browser's own cookies. */
async function call(method: string, options?: Record<string, unknown>) {
  const query = new URLSearchParams({ _s: "api", _m: method });
  if (options) query.set("_o", JSON.stringify(options));
  const response = await fetch(`${proxy.url}?${query}`, {
    headers: { cookie: "app_session=browser-secret" },
  });
  const body = options?.stream ? await response.text() : await response.json();
  return { setCookie: response.headers.getSetCookie(), body, received: upstream.received.at(-1) };
}

describe("a source that names neither", () => {
  beforeEach(() => {
    registerSources({
      api: defineApi({ baseURL: upstream.url, endpoints: { me: endpoint.get("me") } }),
    });
  });

  it("keeps the browser's cookies from the upstream", async () => {
    const { received } = await call("me");

    expect(received?.headers.cookie).toBeUndefined();
  });

  it("keeps the upstream's cookies from the browser", async () => {
    const { setCookie } = await call("me");

    expect(setCookie).toEqual([]);
  });

  it("keeps them from a streamed answer too", async () => {
    const { setCookie } = await call("me", { stream: true });

    expect(setCookie).toEqual([]);
  });
});

describe("a source that names both", () => {
  beforeEach(() => {
    registerSources({
      api: defineApi({
        baseURL: upstream.url,
        allowedHeaders: ["cookie", "set-cookie"],
        endpoints: { me: endpoint.get("me") },
      }),
    });
  });

  it("carries the browser's cookies up and every upstream cookie back", async () => {
    const { received, setCookie } = await call("me");

    expect(received?.headers.cookie).toBe("app_session=browser-secret");
    expect(setCookie).toEqual(["session=upstream; Path=/; HttpOnly", "theme=dark; Path=/"]);
  });

  it("carries the upstream's cookies back on a streamed answer", async () => {
    const { setCookie } = await call("me", { stream: true });

    expect(setCookie).toEqual(["session=upstream; Path=/; HttpOnly", "theme=dark; Path=/"]);
  });
});

describe("endpoints that name one direction each", () => {
  beforeEach(() => {
    registerSources({
      api: defineApi({
        baseURL: upstream.url,
        endpoints: {
          login: endpoint.get("login").headers(["set-cookie"]),
          me: endpoint.get("me").headers(["Cookie"]),
        },
      }),
    });
  });

  it("lets a sign-in set its session without receiving the browser's cookies", async () => {
    const { received, setCookie } = await call("login");

    expect(received?.headers.cookie).toBeUndefined();
    expect(setCookie).toContain("session=upstream; Path=/; HttpOnly");
  });

  it("lets a call read the session without setting cookies", async () => {
    const { received, setCookie } = await call("me");

    expect(received?.headers.cookie).toBe("app_session=browser-secret");
    expect(setCookie).toEqual([]);
  });
});

describe("a base the endpoints extend", () => {
  it("names them for every endpoint built from it", async () => {
    const session = courier().extend({ allowedHeaders: ["cookie", "set-cookie"] });
    registerSources({
      api: defineApi({ baseURL: upstream.url, endpoints: { me: session.endpoint.get("me") } }),
    });

    const { received, setCookie } = await call("me");

    expect(received?.headers.cookie).toBe("app_session=browser-secret");
    expect(setCookie).toHaveLength(2);
  });
});

describe("an error answer", () => {
  it("clears the session only where Set-Cookie is named", async () => {
    await upstream.close();
    upstream = await startUpstream((_request, res) => {
      res.writeHead(401, {
        "content-type": "application/json",
        "set-cookie": "session=; Max-Age=0; Path=/",
      });
      res.end(JSON.stringify({ message: "signed out" }));
    });
    registerSources({
      api: defineApi({
        baseURL: upstream.url,
        endpoints: {
          named: endpoint.get("named").headers(["set-cookie"]),
          unnamed: endpoint.get("unnamed"),
        },
      }),
    });

    const named = await fetch(`${proxy.url}?_s=api&_m=named`);
    const unnamed = await fetch(`${proxy.url}?_s=api&_m=unnamed`);

    expect(named.status).toBe(401);
    expect(named.headers.getSetCookie()).toEqual(["session=; Max-Age=0; Path=/"]);
    expect(unnamed.headers.getSetCookie()).toEqual([]);
  });
});
