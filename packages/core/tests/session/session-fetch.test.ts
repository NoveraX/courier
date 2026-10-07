/**
 * How a call that carries the user's session is sent: where its redirects
 * may take it, what the framework asks `fetch` for, and what it keeps of the
 * cookies the API sets when they are not passed on.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let serving: IncomingRequest | undefined;
let removeProvider: () => void;

function userRequest(cookie: string, extra: Partial<IncomingRequest> = {}): IncomingRequest {
  return {
    key: {},
    method: "GET",
    origin: "https://app.example.com",
    headers: new Headers({ cookie, "sec-fetch-site": "same-origin" }),
    ...extra,
  };
}

beforeAll(() => {
  removeProvider = registerRequestContext(() => serving);
});

afterAll(() => {
  removeProvider();
});

afterEach(() => {
  serving = undefined;
  vi.unstubAllGlobals();
});

describe("a redirect", () => {
  let api: Upstream;
  let elsewhere: Upstream;

  beforeAll(async () => {
    elsewhere = await startUpstream((_req, res) => sendJson(res, 200, { reached: "elsewhere" }));
    api = await startUpstream((req, res) => {
      if (req.url === "/away") {
        res.writeHead(302, { location: `${elsewhere.url}/landing` });
        res.end();
      } else if (req.url === "/moved") {
        res.writeHead(307, { location: "/me" });
        res.end();
      } else sendJson(res, 200, { reached: "api" });
    });
  });

  afterAll(async () => {
    await api.close();
    await elsewhere.close();
  });

  it("never takes the session to another origin", async () => {
    const client = createCaller(
      defineApi({
        name: "accounts",
        baseURL: api.url,
        session: { cookies: ["sid"] },
        endpoints: { away: endpoint.get("away") },
      }),
    );
    serving = userRequest("sid=a1");

    await expect(client.away()).rejects.toMatchObject({ status: 302 });
    expect(elsewhere.seen).toHaveLength(0);
  });

  it("is followed on the API's own origin", async () => {
    const client = createCaller(
      defineApi({
        name: "accounts",
        baseURL: api.url,
        session: { cookies: ["sid"] },
        endpoints: { moved: endpoint.get("moved") },
      }),
    );
    serving = userRequest("sid=a1");

    await expect(client.moved()).resolves.toEqual({ reached: "api" });
    expect(api.seen.at(-1)?.headers.cookie).toBe("sid=a1");
  });
});

describe("what the framework asks of fetch", () => {
  it("reaches fetch under the API's own options", async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
    vi.stubGlobal("fetch", fetchSpy);
    const fresh = createCaller(
      defineApi({
        name: "fresh",
        baseURL: "https://api.example.com",
        session: { cookies: ["sid"] },
        endpoints: { me: endpoint.get("me") },
      }),
    );
    const cached = createCaller(
      defineApi({
        name: "cached",
        baseURL: "https://api.example.com",
        session: { cookies: ["sid"] },
        cache: "force-cache",
        endpoints: { me: endpoint.get("me") },
      }),
    );
    serving = userRequest("sid=a1", { fetchInit: { cache: "no-store" } });

    await fresh.me();
    await cached.me();

    const inits = fetchSpy.mock.calls.map((call) => (call as unknown[])[1] as RequestInit);
    expect(inits[0]?.cache).toBe("no-store");
    expect(inits[1]?.cache).toBe("force-cache");
  });
});

describe("a session that does not relay", () => {
  it("keeps the API's cookie for the request's later calls, and hands the browser nothing", async () => {
    const handed: RelayedCookie[] = [];
    const upstream = await startUpstream((req, res) => {
      if (upstream.seen.length === 1) res.setHeader("set-cookie", "sid=renewed; Path=/");
      sendJson(res, 200, { url: req.url });
    });
    const client = createCaller(
      defineApi({
        name: "quiet",
        baseURL: upstream.url,
        session: { cookies: ["sid"], relay: false },
        endpoints: { me: endpoint.get("me") },
      }),
    );
    serving = userRequest("sid=old", {
      setCookie: (cookie) => {
        handed.push(cookie);
        return true;
      },
    });

    await client.me();
    await client.me();
    await upstream.close();

    expect(handed).toEqual([]);
    expect(upstream.seen[1]?.headers.cookie).toBe("sid=renewed");
  });
});
