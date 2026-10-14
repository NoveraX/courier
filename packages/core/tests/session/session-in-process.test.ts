/**
 * A proxy caller called on a server — universal code a page renders with —
 * reaches its own application's proxy in process: with the session of the
 * user the page is for, through the checks a browser's call goes through,
 * and with the cookies the API sets handed to that user's response.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../../src/define";
import { routesOf } from "../../src/define/routes-of";
import { createProxyCaller } from "../../src/proxy-caller";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/sources";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;
let serving: (() => IncomingRequest | Promise<IncomingRequest | undefined> | undefined) | undefined;
let removeProvider: () => void;

function api() {
  return defineApi({
    expose: true,
    name: "accounts",
    baseURL: upstream.url,
    session: { cookies: ["sid"] },
    endpoints: {
      me: endpoint.get("me").response<{ cookie: string | null }>(),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
    },
  });
}

function userRequest(method: string, headers: Record<string, string>) {
  const handed: RelayedCookie[] = [];
  const incoming: IncomingRequest = {
    key: {},
    method,
    origin: "https://app.example.com",
    headers: new Headers(headers),
    setCookie: (cookie) => {
      handed.push(cookie);
      return true;
    },
  };
  return { incoming, handed };
}

beforeAll(async () => {
  upstream = await startUpstream((req, res) => {
    if (req.url === "/me") res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
    sendJson(res, 200, { cookie: req.headers.cookie ?? null });
  });
  registerSources({ accounts: api() });
  removeProvider = registerRequestContext(() => serving?.());
});

afterAll(async () => {
  removeProvider();
  _resetSourcesForTests();
  await upstream.close();
});

afterEach(() => {
  serving = undefined;
  upstream.seen.length = 0;
  vi.restoreAllMocks();
});

describe("a proxy caller on the server", () => {
  it("calls with the session of the user the page is for, and hands that user the API's cookies", async () => {
    const user = userRequest("GET", {
      cookie: "sid=a1; theme=dark",
      "sec-fetch-site": "same-origin",
    });
    serving = () => user.incoming;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const me = await createProxyCaller(routesOf(api(), "accounts")).me();

    expect(me).toEqual({ cookie: "sid=a1" });
    expect(user.handed.map((cookie) => cookie.header)).toEqual([
      "sid=renewed; Path=/; Secure; HttpOnly",
    ]);
    expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([`${upstream.url}/me`]);
  });

  it("guards a write by the user's request, as a browser's call is guarded", async () => {
    serving = () =>
      userRequest("GET", { cookie: "sid=a1", "sec-fetch-site": "cross-site" }).incoming;

    const sent = createProxyCaller(routesOf(api(), "accounts")).rename({ name: "Mallory" });

    await expect(sent).rejects.toMatchObject({ status: 403 });
    expect(upstream.seen).toHaveLength(0);
  });

  it("works outside any request, without the server knowing its own address", async () => {
    const me = await createProxyCaller(routesOf(api(), "accounts")).me();

    expect(me).toEqual({ cookie: null });
  });

  it("fails as finding the request fails, the way a framework stops a render", async () => {
    const stop = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE",
    });
    serving = () => Promise.reject(stop);

    await expect(createProxyCaller(routesOf(api(), "accounts")).me()).rejects.toBe(stop);
  });

  it("goes over HTTP to a proxy at another address", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ cookie: "elsewhere" }));

    await createProxyCaller(routesOf(api(), "accounts"), {
      proxyPath: { http: "https://edge.example.com/api/request" },
    }).me();

    expect(String(fetchSpy.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/edge\.example\.com\/api\/request\?/,
    );
  });
});
