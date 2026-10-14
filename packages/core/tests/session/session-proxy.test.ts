/**
 * A browser calling an API that keeps a session through the application's
 * proxy: the proxy sends the API the session's cookies alone, and hands the
 * browser the cookies the API sets made for the application's origin.
 *
 * Both the proxy and the API are real servers, so the assertions read what
 * crossed each wire.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { sendWebResponse, toWebRequest } from "../../src/node";
import { _resetSourcesForTests, registerSources } from "../../src/sources";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

let upstream: Upstream;
let proxy: Server;
let proxyUrl: string;

beforeAll(async () => {
  upstream = await startUpstream((req, res) => {
    if (req.url === "/login") {
      res.setHeader("set-cookie", [
        "sid=s3cr3t; Path=/auth; Domain=127.0.0.1; HttpOnly; SameSite=Strict",
        "vendor_tracking=1; Path=/",
      ]);
    }
    sendJson(res, 200, { ok: true });
  });
  const { endpoint } = courier();
  registerSources({
    accounts: defineApi({
      expose: true,
      name: "accounts",
      baseURL: upstream.url,
      session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
      endpoints: {
        me: endpoint.get("me"),
        login: endpoint.post("login"),
      },
    }),
  });
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
  _resetSourcesForTests();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await upstream.close();
});

afterEach(() => {
  upstream.seen.length = 0;
});

describe("the proxy, for an API that keeps a session", () => {
  it("sends a read the session's cookies alone", async () => {
    const response = await fetch(`${proxyUrl}?_s=accounts&_m=me`, {
      headers: { cookie: "sid=a1; theme=dark; _ga=GA1", "sec-fetch-site": "same-origin" },
    });

    expect(response.status).toBe(200);
    expect(upstream.seen[0]?.headers.cookie).toBe("sid=a1");
  });

  it("sends a write its double-submit token, and hands back the API's session cookie made for the application", async () => {
    const response = await fetch(`${proxyUrl}?_s=accounts&_m=login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "csrftoken=c1; theme=dark",
        origin: proxyUrl.replace(/\/api\/request$/, ""),
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({ variables: { user: "ada" } }),
    });

    expect(response.status).toBe(200);
    expect(upstream.seen[0]?.headers["x-csrftoken"]).toBe("c1");
    expect(upstream.seen[0]?.headers.cookie).toBe("csrftoken=c1");
    expect(response.headers.getSetCookie()).toEqual([
      "sid=s3cr3t; Path=/; HttpOnly; SameSite=Strict",
    ]);
  });
});
