/**
 * A Fastify application calling an API that keeps a session: each request's
 * routes call it with that request's session, through every await, and the
 * cookies the API renews reach the browser beside the route's own. Both are
 * real servers.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestContext } from "../src/index";

let upstream: Server;
let app: FastifyInstance;
let appUrl: string;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url === "/session/renew") res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ cookie: req.headers.cookie ?? null, id: req.headers["x-request-id"] }),
      );
    }, Math.random() * 15);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const { endpoint } = courier();
  const api = createCaller(
    defineApi({
      name: "accounts",
      baseURL: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
      session: { cookies: ["sid"] },
      forward: { requestId: true },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null; id: string }>(),
        renew: endpoint.get("session/renew"),
      },
    }),
  );
  app = Fastify();
  app.addHook("onRequest", requestContext());
  app.get("/account", async () => {
    const first = await api.me();
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
    const second = await api.me();
    return { first, second };
  });
  app.get("/renew", async (_request, reply) => {
    reply.header("set-cookie", "theme=dark; Path=/");
    await api.renew();
    return { ok: true };
  });
  appUrl = await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

describe("requestContext", () => {
  it("serves each of many concurrent requests with its own session and one request id", async () => {
    const users = Array.from({ length: 30 }, (_, at) => `user${at}`);

    const results = await Promise.all(
      users.map(async (sid) => {
        const response = await fetch(`${appUrl}/account`, {
          headers: { cookie: `sid=${sid}; _ga=1` },
        });
        return {
          sid,
          body: (await response.json()) as Record<
            "first" | "second",
            { cookie: string; id: string }
          >,
        };
      }),
    );

    for (const { sid, body } of results) {
      expect(body.first.cookie).toBe(`sid=${sid}`);
      expect(body.second.cookie).toBe(`sid=${sid}`);
      expect(body.second.id).toBe(body.first.id);
    }
    expect(new Set(results.map(({ body }) => body.first.id)).size).toBe(users.length);
  });

  it("hands the browser the cookie the API renewed, beside the one the route set", async () => {
    const response = await fetch(`${appUrl}/renew`, { headers: { cookie: "sid=ada" } });

    expect(response.headers.getSetCookie()).toEqual([
      "theme=dark; Path=/",
      "sid=renewed; Path=/; HttpOnly",
    ]);
  });

  it("carries nothing for a request without the session's cookies", async () => {
    const response = await fetch(`${appUrl}/account`, { headers: { cookie: "theme=dark" } });

    expect(((await response.json()) as { first: { cookie: unknown } }).first.cookie).toBeNull();
  });
});
