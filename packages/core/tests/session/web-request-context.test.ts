/**
 * A request of a framework built on Web-standard requests — Hono, Astro,
 * React Router — served with the user's session at hand: the calls made
 * while serving it carry the session, and the cookies the API sets reach
 * the browser on the response it is answered with.
 */
import type { ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define";
import { withWebRequestContext } from "../../src/web-request-context";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;
let answer: (res: ServerResponse, url: string) => void = (res) => sendJson(res, 200, {});

beforeAll(async () => {
  upstream = await startUpstream((req, res) => answer(res, req.url ?? ""));
});

afterAll(async () => {
  await upstream.close();
});

afterEach(() => {
  vi.restoreAllMocks();
  upstream.seen.length = 0;
  answer = (res) => sendJson(res, 200, {});
});

function accounts() {
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: upstream.url,
      session: { cookies: ["sid"] },
      forward: { clientAddress: true },
      endpoints: {
        me: endpoint.get("me"),
        logout: endpoint.post("logout", { session: "unguarded" }),
      },
    }),
  );
}

const page = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/account", { headers });

describe("a request served with withWebRequestContext", () => {
  it("gives the calls made while serving it the user's session", async () => {
    const api = accounts();

    await withWebRequestContext(page({ cookie: "sid=a1; theme=dark" }), async () => {
      await api.me();
      return new Response("ok");
    });

    expect(upstream.seen[0]?.headers.cookie).toBe("sid=a1");
  });

  it("answers with the cookies the API set, on a response that can take them or a copy", async () => {
    const api = accounts();
    answer = (res) => {
      res.setHeader("set-cookie", "sid=a2; Path=/; HttpOnly");
      sendJson(res, 200, {});
    };

    const own = await withWebRequestContext(page({ cookie: "sid=a1" }), async () => {
      await api.me();
      return new Response("ok");
    });
    const fetched = await withWebRequestContext(page({ cookie: "sid=a1" }), async () => {
      await api.me();
      return fetch(`${upstream.url}/plain`);
    });

    /* Made for the application's origin: secure on the local machine, as over HTTPS. */
    expect(own.headers.getSetCookie()).toEqual(["sid=a2; Path=/; HttpOnly"]);
    expect(fetched.headers.getSetCookie()).toContain("sid=a2; Path=/; HttpOnly");
  });

  it("says why a cookie set after the response was handed back cannot reach the browser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = accounts();
    answer = (res) => {
      res.setHeader("set-cookie", "sid=; Path=/; Max-Age=0");
      setTimeout(() => sendJson(res, 200, {}), 30);
    };
    let late: Promise<unknown> = Promise.resolve();

    const response = await withWebRequestContext(page({ cookie: "sid=a1" }), async () => {
      late = api.logout();
      return new Response("streaming");
    });
    await late;

    expect(response.headers.getSetCookie()).toEqual([]);
    expect(warn.mock.calls.flat().join(" ")).toContain("the response had already been handed back");
  });

  it("names the user by the connection's address, after the chain a private proxy recorded", async () => {
    const api = accounts();

    await withWebRequestContext(
      page({ "x-forwarded-for": "203.0.113.7" }),
      async () => {
        await api.me();
        return new Response("ok");
      },
      { peerAddress: "10.0.0.2" },
    );

    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBe("203.0.113.7, 10.0.0.2");
  });
});
