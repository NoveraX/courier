/**
 * A Nest application calling an API that keeps a session, the middleware
 * mounted with `app.use()`: each request's calls carry that request's
 * session through every await, and the cookies the API renews reach the
 * browser beside the application's own, however the platform writes the
 * response — Express setting the header again, Fastify handing `writeHead`
 * its reply's headers. The application and the API are real servers.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestContext } from "../src/index";

const servers: Server[] = [];
let api: ReturnType<typeof accounts>;

function accounts(baseURL: string) {
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session: { cookies: ["sid"] },
      forward: { requestId: true },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null; id: string }>(),
        renew: endpoint.get("session/renew"),
      },
    }),
  );
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/* An application whose routes run behind the middleware, as `app.use()` mounts it first. */
function application(route: (req: IncomingMessage, res: ServerResponse) => Promise<void>) {
  const middleware = requestContext();
  return listen(createServer((req, res) => middleware(req, res, () => void route(req, res))));
}

beforeAll(async () => {
  const apiUrl = await listen(
    createServer((req, res) => {
      if (req.url === "/session/renew")
        res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ cookie: req.headers.cookie ?? null, id: req.headers["x-request-id"] }),
        );
      }, Math.random() * 15);
    }),
  );
  api = accounts(apiUrl);
});

afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("requestContext", () => {
  it("serves each of many concurrent requests with its own session and one request id", async () => {
    const appUrl = await application(async (_req, res) => {
      const first = await api.me();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
      const second = await api.me();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ first, second }));
    });
    const users = Array.from({ length: 30 }, (_, at) => `user${at}`);

    const results = await Promise.all(
      users.map(async (sid) => {
        const response = await fetch(appUrl, { headers: { cookie: `sid=${sid}; _ga=1` } });
        type Seen = { cookie: string; id: string };
        return { sid, body: (await response.json()) as { first: Seen; second: Seen } };
      }),
    );

    for (const { sid, body } of results) {
      expect(body.first.cookie).toBe(`sid=${sid}`);
      expect(body.second.cookie).toBe(`sid=${sid}`);
      expect(body.second.id).toBe(body.first.id);
    }
    expect(new Set(results.map(({ body }) => body.first.id)).size).toBe(users.length);
  });

  it("keeps the renewed session beside a cookie Express's platform sets over it", async () => {
    const appUrl = await application(async (_req, res) => {
      await api.renew();
      res.setHeader("Set-Cookie", "signed_in=yes; Path=/");
      res.end("ok");
    });

    const response = await fetch(appUrl, { headers: { cookie: "sid=ada" } });

    expect(response.headers.getSetCookie()).toEqual([
      "sid=renewed; Path=/; Secure; HttpOnly",
      "signed_in=yes; Path=/",
    ]);
  });

  it("keeps it beside the cookies Fastify's platform hands writeHead with its reply", async () => {
    const appUrl = await application(async (_req, res) => {
      await api.renew();
      res.writeHead(303, { location: "/", "set-cookie": ["signed_in=yes; Path=/"] });
      res.end();
    });

    const response = await fetch(appUrl, { headers: { cookie: "sid=ada" }, redirect: "manual" });

    expect(response.status).toBe(303);
    expect(response.headers.getSetCookie()).toEqual([
      "sid=renewed; Path=/; Secure; HttpOnly",
      "signed_in=yes; Path=/",
    ]);
  });
});
