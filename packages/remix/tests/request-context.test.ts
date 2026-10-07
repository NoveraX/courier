/**
 * A React Router application calling an API that keeps a session: its root
 * middleware, or a wrapped request handler, serves each request with that
 * request's session, through every await, and the cookies the API renews
 * reach the browser on the response. The API is a real server.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requestContext, withRequestContext } from "../src/request-context";

let upstream: Server;
let api: ReturnType<typeof accounts>;

function accounts(baseURL: string) {
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session: { cookies: ["sid"] },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null }>(),
        renew: endpoint.get("session/renew"),
      },
    }),
  );
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url === "/session/renew") res.setHeader("set-cookie", "sid=renewed; Path=/; HttpOnly");
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ cookie: req.headers.cookie ?? null }));
    }, Math.random() * 15);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  api = accounts(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
});

afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

const page = (cookie: string) =>
  new Request("http://localhost:5173/account", { headers: { cookie } });

describe("requestContext, as route middleware", () => {
  it("serves each of many concurrent requests with its own session", async () => {
    const middleware = requestContext();
    const users = Array.from({ length: 20 }, (_, at) => `user${at}`);

    const bodies = await Promise.all(
      users.map(async (sid) => {
        const response = await middleware({ request: page(`sid=${sid}; _ga=1`) }, async () => {
          const first = await api.me();
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
          return Response.json({ sid, first, second: await api.me() });
        });
        return (await response.json()) as { sid: string } & Record<
          "first" | "second",
          { cookie: string }
        >;
      }),
    );

    for (const body of bodies) {
      expect(body.first.cookie).toBe(`sid=${body.sid}`);
      expect(body.second.cookie).toBe(`sid=${body.sid}`);
    }
  });

  it("hands the browser the cookie the API renewed, on the response", async () => {
    const response = await requestContext()({ request: page("sid=ada") }, async () => {
      await api.renew();
      return new Response("ok");
    });

    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
  });
});

describe("withRequestContext", () => {
  it("serves a request handler's requests with the session, its other arguments passed on", async () => {
    const handle = withRequestContext(
      async (_request: Request, loadContext: { tenant: string }) => {
        const me = await api.me();
        await api.renew();
        return Response.json({ me, tenant: loadContext.tenant });
      },
    );

    const response = await handle(page("sid=grace"), { tenant: "acme" });

    expect(await response.json()).toEqual({ me: { cookie: "sid=grace" }, tenant: "acme" });
    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
  });
});
