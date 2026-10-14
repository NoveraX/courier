/**
 * An application serving a user who has no double-submit token yet — the
 * first visit, a sign-in — calling an API that names where it hands the
 * token out: the write asks there first with the user's session, the token
 * reaches the write and the user's browser, and a write another site sets
 * off is refused before anything is asked for.
 *
 * The API and the proxy are real servers, so the assertions read what
 * crossed each wire.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter";
import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { sendWebResponse, toWebRequest } from "../../src/node";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/sources";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

let upstream: Upstream;
let proxy: Server;
let proxyUrl: string;
let serving: IncomingRequest | undefined;
let removeProvider: () => void;
let api: ReturnType<typeof defineAccounts>;

const { endpoint } = courier();

function defineAccounts(baseURL: string) {
  return defineApi({
    expose: true,
    name: "accounts",
    baseURL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "/csrf" },
    },
    endpoints: {
      login: endpoint.post("login").variables<{ user: string }>(),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
    },
  });
}

/* The request the application is serving, with the browser's cookies on it. */
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
    if (req.url === "/csrf") res.setHeader("set-cookie", "csrftoken=t-fresh; Path=/");
    sendJson(res, 200, { ok: true });
  });
  api = defineAccounts(upstream.url);
  registerSources({ accounts: api });
  removeProvider = registerRequestContext(() => serving);
  const handler = createHandler();
  proxy = createServer(async (req, res) => {
    const request = toWebRequest(req, res);
    const answer = req.method === "GET" ? handler.handleGet(request) : handler.handlePost(request);
    await sendWebResponse(await answer, res);
  });
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}/api/request`;
});

afterAll(async () => {
  removeProvider();
  _resetSourcesForTests();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await upstream.close();
});

afterEach(() => {
  serving = undefined;
  upstream.seen.length = 0;
});

describe("a server's write that finds no double-submit token", () => {
  it("asks for it with the user's session while a page is served, and hands it to the browser", async () => {
    const { incoming, handed } = userRequest("POST", {
      cookie: "sid=s1; theme=dark",
      "sec-fetch-site": "same-origin",
    });
    serving = incoming;

    await createCaller(api).rename({ name: "Ada" });

    const [asked, write] = upstream.seen;
    expect(asked).toMatchObject({ method: "GET", url: "/csrf" });
    expect(asked?.headers.cookie).toBe("sid=s1");
    expect(write?.headers.cookie).toBe("sid=s1; csrftoken=t-fresh");
    expect(write?.headers["x-csrftoken"]).toBe("t-fresh");
    expect(handed.map((each) => each.header)).toEqual(["csrftoken=t-fresh; Path=/; Secure"]);
  });

  it("asks for it through the proxy, and the proxy's answer hands it to the browser", async () => {
    const response = await fetch(`${proxyUrl}?_s=accounts&_m=rename`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "sid=s2",
        origin: proxyUrl.replace(/\/api\/request$/, ""),
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ variables: { name: "Ada" } }),
    });

    expect(response.status).toBe(200);
    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual([
      "GET /csrf",
      "POST /me/name",
    ]);
    expect(upstream.seen[1]?.headers["x-csrftoken"]).toBe("t-fresh");
    expect(response.headers.getSetCookie()).toEqual(["csrftoken=t-fresh; Path=/"]);
  });

  it("asks once for the writes made together while one request is served", async () => {
    serving = userRequest("POST", { cookie: "sid=s3", "sec-fetch-site": "same-origin" }).incoming;
    const client = createCaller(api);

    await Promise.all([client.rename({ name: "Ada" }), client.rename({ name: "Grace" })]);

    expect(upstream.seen.filter((seen) => seen.url === "/csrf")).toHaveLength(1);
  });
});

describe("a write another site sets off", () => {
  it("is refused before its token is asked for", async () => {
    serving = userRequest("GET", { cookie: "sid=s1", "sec-fetch-site": "cross-site" }).incoming;

    await expect(createCaller(api).rename({ name: "Mallory" })).rejects.toMatchObject({
      status: 403,
    });
    expect(upstream.seen).toEqual([]);
  });

  it("is refused for a sign-in no session vouches for yet, since the token asked for would", async () => {
    serving = userRequest("GET", { "sec-fetch-site": "cross-site" }).incoming;

    await expect(createCaller(api).login({ user: "mallory" })).rejects.toMatchObject({
      status: 403,
    });
    expect(upstream.seen).toEqual([]);
  });
});
