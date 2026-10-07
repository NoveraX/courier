/**
 * A Hono application calling an API that keeps a session: each request's
 * routes call it with that request's session, through every await, and the
 * cookies the API renews reach the browser beside the route's own — on a
 * response the route made, and on one a `fetch` returned.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestContext } from "../src/request-context";

let upstream: Server;
let upstreamUrl: string;
const app = new Hono();

beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url?.startsWith("/session/renew")) {
      res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
    }
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ cookie: req.headers.cookie ?? null, id: req.headers["x-request-id"] }),
      );
    }, Math.random() * 15);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const { endpoint } = courier();
  const api = createCaller(
    defineApi({
      name: "accounts",
      baseURL: upstreamUrl,
      session: { cookies: ["sid"] },
      forward: { requestId: true },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null; id: string }>(),
        renew: endpoint.get("session/renew"),
      },
    }),
  );
  app.use(requestContext());
  app.get("/account", async (c) => {
    const first = await api.me();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
    const second = await api.me();
    return c.json({ first, second });
  });
  app.get("/renew", async (c) => {
    c.header("set-cookie", "theme=dark; Path=/", { append: true });
    await api.renew();
    return c.json({ ok: true });
  });
  app.get("/renew-fetched", async () => {
    await api.renew();
    return fetch(`${upstreamUrl}/plain`);
  });
});

afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

const get = (path: string, cookie: string) =>
  app.request(`http://localhost:3000${path}`, { headers: { cookie } });

describe("requestContext", () => {
  it("serves each of many concurrent requests with its own session and one request id", async () => {
    const users = Array.from({ length: 30 }, (_, at) => `user${at}`);

    const results = await Promise.all(
      users.map(async (sid) => ({
        sid,
        body: (await (await get("/account", `sid=${sid}; _ga=1`)).json()) as Record<
          "first" | "second",
          { cookie: string; id: string }
        >,
      })),
    );

    for (const { sid, body } of results) {
      expect(body.first.cookie).toBe(`sid=${sid}`);
      expect(body.second.cookie).toBe(`sid=${sid}`);
      expect(body.second.id).toBe(body.first.id);
    }
    expect(new Set(results.map(({ body }) => body.first.id)).size).toBe(users.length);
  });

  it("hands the browser the cookie the API renewed, beside the one the route set", async () => {
    const response = await get("/renew", "sid=ada");

    expect(response.headers.getSetCookie()).toEqual([
      "theme=dark; Path=/",
      "sid=renewed; Path=/; Secure; HttpOnly",
    ]);
  });

  it("hands it on a response a fetch returned, whose headers cannot change", async () => {
    const response = await get("/renew-fetched", "sid=ada");

    expect(response.headers.getSetCookie()).toContain("sid=renewed; Path=/; Secure; HttpOnly");
  });

  it("carries nothing for a request without the session's cookies", async () => {
    const response = await get("/account", "theme=dark");

    expect(((await response.json()) as { first: { cookie: unknown } }).first.cookie).toBeNull();
  });
});
