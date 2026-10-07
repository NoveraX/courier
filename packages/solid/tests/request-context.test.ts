/**
 * A SolidStart application calling an API that keeps a session: the
 * provider finds the request SolidStart is serving through its
 * `getRequestEvent`, so each request's calls carry that request's session,
 * and the cookies the API renews reach the browser on the response
 * SolidStart prepares. The API is a real server, and the response is
 * prepared by h3 2 — what SolidStart 2 serves with — from the event exactly
 * as SolidStart builds it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller, registerRequestContext } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { H3, type H3Event, HTTPError } from "h3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type SolidStartServerEvent,
  solidStartIncomingRequest,
  solidStartRequestContext,
} from "../src/request-context";

/* SolidStart keeps the request event as this does, and answers getRequestEvent from it. */
const events = new AsyncLocalStorage<SolidStartServerEvent>();
const getRequestEvent = (): SolidStartServerEvent | undefined => events.getStore();

let upstream: Server;
let api: ReturnType<typeof accounts>;
let unregister: () => void;

function accounts(baseURL: string) {
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session: { cookies: ["sid"] },
      forward: { clientAddress: true },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null; address: string | null }>(),
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
      res.end(
        JSON.stringify({
          cookie: req.headers.cookie ?? null,
          address: req.headers["x-forwarded-for"] ?? null,
        }),
      );
    }, Math.random() * 15);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  api = accounts(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
  unregister = registerRequestContext(solidStartRequestContext(getRequestEvent));
});

afterAll(async () => {
  unregister();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

/* An application on h3 2 that serves each request inside its event, as SolidStart 2 does. */
function solidStart(serve: (event: SolidStartServerEvent) => unknown): H3 {
  return new H3().use((h3Event: H3Event) => {
    const event: SolidStartServerEvent = {
      request: h3Event.req,
      response: h3Event.res,
      clientAddress: "127.0.0.1",
      nativeEvent: h3Event,
    };
    return events.run(event, () => serve(event));
  });
}

const visit = (app: H3, cookie: string): Promise<Response> =>
  Promise.resolve(app.fetch(new Request("http://localhost:3000/account", { headers: { cookie } })));

describe("solidStartRequestContext", () => {
  it("serves each of many concurrent requests with its own session", async () => {
    const users = Array.from({ length: 20 }, (_, at) => `user${at}`);
    const app = solidStart(async () => {
      const first = await api.me();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
      return { first, second: await api.me() };
    });

    const seen = await Promise.all(
      users.map(async (sid) => ({
        sid,
        ...((await (await visit(app, `sid=${sid}; _ga=1`)).json()) as {
          first: { cookie: string; address: string };
          second: { cookie: string };
        }),
      })),
    );

    for (const { sid, first, second } of seen) {
      expect(first.cookie).toBe(`sid=${sid}`);
      expect(second.cookie).toBe(`sid=${sid}`);
      expect(first.address).toBe("127.0.0.1");
    }
  });

  it("hands the browser the cookie the API renewed, on the page SolidStart answers with", async () => {
    const app = solidStart(async () => {
      await api.renew();
      return "<html></html>";
    });

    const response = await visit(app, "sid=ada");

    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
  });

  it("hands it over on a response the route returns", async () => {
    const app = solidStart(async () => {
      await api.renew();
      return Response.redirect("http://localhost:3000/", 303);
    });

    const response = await visit(app, "sid=ada");

    expect(response.status).toBe(303);
    expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
  });

  it("hands it over on an error response too, as h3 does its own session", async () => {
    const thrown = solidStart(async () => {
      await api.renew();
      throw new HTTPError({ status: 502, message: "The upstream failed" });
    });
    const returned = solidStart(async () => {
      await api.renew();
      return new Response("missing", { status: 404 });
    });

    for (const app of [thrown, returned]) {
      const response = await visit(app, "sid=ada");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.getSetCookie()).toEqual(["sid=renewed; Path=/; Secure; HttpOnly"]);
    }
  });

  it("says a cookie set after the page began to stream cannot reach the browser", async () => {
    let served: SolidStartServerEvent | undefined;
    const app = solidStart((event) => {
      served = event;
      return new Response(new ReadableStream({ start: (controller) => controller.close() }));
    });

    const response = await visit(app, "sid=ada");
    const handed = solidStartIncomingRequest(served as SolidStartServerEvent).setCookie?.({
      cookie: { name: "sid", value: "late" },
      header: "sid=late; Path=/",
    });

    expect(response.headers.getSetCookie()).toEqual([]);
    expect(handed).toMatch(/^the response had already been handed back/);
  });

  it("says so where Node's response refuses a header once it is out, as on SolidStart 1", () => {
    const refusing = (code: string): SolidStartServerEvent => ({
      request: new Request("http://localhost:3000/"),
      response: {
        headers: {
          append() {
            throw Object.assign(new Error("refused"), { code });
          },
        } as unknown as Headers,
      },
    });
    const late = { cookie: { name: "sid", value: "late" }, header: "sid=late; Path=/" };

    expect(solidStartIncomingRequest(refusing("ERR_HTTP_HEADERS_SENT")).setCookie?.(late)).toMatch(
      /^the response had already been handed back/,
    );
    expect(() => solidStartIncomingRequest(refusing("ERR_INVALID_CHAR")).setCookie?.(late)).toThrow(
      "refused",
    );
  });

  it("is the same provider for the same getRequestEvent", () => {
    expect(solidStartRequestContext(getRequestEvent)).toBe(
      solidStartRequestContext(getRequestEvent),
    );
  });
});
