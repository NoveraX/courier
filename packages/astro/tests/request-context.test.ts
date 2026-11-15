/**
 * An Astro application calling an API that keeps a session: its middleware
 * serves each request with that request's session, through every await,
 * and the cookies the API renews reach the browser through Astro's
 * `cookies`, as a page's own do. The API is a real server.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  type AstroRequestContext,
  astroIncomingRequest,
  requestContext,
} from "../src/request-context";

let upstream: Server;
let api: ReturnType<typeof accounts>;

function accounts(baseURL: string) {
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL,
      session: { cookies: ["sid"] },
      forward: { requestId: true, clientAddress: true },
      endpoints: {
        me: endpoint.get("me").response<{ cookie: string | null; address: string | null }>(),
        renew: endpoint.get("session/renew"),
      },
    }),
  );
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    if (req.url === "/session/renew")
      res.setHeader("set-cookie", "sid=re%20newed; Path=/; HttpOnly; SameSite=Lax");
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
});

afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

/* `cookies` as Astro makes it: each cookie set or deleted is held as the `Set-Cookie` it writes,
   its value URL-encoded unless the call encodes it, a deletion as `deleted`, long expired. */
function astroCookies(set: (name: string, value: string, options?: object) => void) {
  const written = new Map<string, string>();
  return {
    set(name: string, value: string, options?: { encode?: (value: string) => string }) {
      set(name, value, options);
      written.set(name, `${name}=${(options?.encode ?? encodeURIComponent)(value)}; Path=/`);
    },
    delete(name: string) {
      written.set(name, `${name}=deleted; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    },
    headers: () => written.values(),
  };
}

/* What Astro hands a middleware, as far as the session reads it. */
function contextFor(cookie: string, set = vi.fn()) {
  const request = new Request("http://localhost:4321/account", { headers: { cookie } });
  const cookies = astroCookies(set);
  const context: AstroRequestContext = {
    request,
    url: new URL(request.url),
    cookies,
    get clientAddress() {
      return "127.0.0.1";
    },
  };
  return Object.assign(context, { cookies });
}

describe("astroIncomingRequest", () => {
  it("holds the cookies as the request's code leaves them each time it is asked", () => {
    const context = contextFor("sid=OLD; pref=a%7Eb; b64=YWJj+ZGVm/==; theme=dark");
    const incoming = astroIncomingRequest(context);

    context.cookies.set("sid", "NEW one");
    context.cookies.delete("theme");

    expect(incoming.cookieHeader?.()).toBe("pref=a%7Eb; b64=YWJj+ZGVm/==; sid=NEW%20one");
  });
});

describe("requestContext", () => {
  it("sends each call the cookies as the request's code leaves them, and the API's as it wrote it", async () => {
    const context = contextFor("sid=ada");

    const seen = await requestContext()(context, async () => {
      const first = await api.me();
      await api.renew();
      const renewed = await api.me();
      context.cookies.set("sid", "mine");
      const mine = await api.me();
      context.cookies.delete("sid");
      const none = await api.me();
      return Response.json([first, renewed, mine, none].map((answer) => answer.cookie));
    }).then((response) => response.json());

    expect(seen).toEqual(["sid=ada", "sid=re%20newed", "sid=mine", null]);
  });

  it("serves each of many concurrent requests with its own session", async () => {
    const middleware = requestContext();
    const users = Array.from({ length: 20 }, (_, at) => `user${at}`);

    const seen = await Promise.all(
      users.map((sid) =>
        middleware(contextFor(`sid=${sid}; _ga=1`), async () => {
          const first = await api.me();
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 15));
          const second = await api.me();
          return Response.json({ sid, first, second });
        }).then(
          (response) =>
            response.json() as Promise<
              Record<string, { cookie: string; address: string }> & { sid: string }
            >,
        ),
      ),
    );

    for (const body of seen) {
      expect(body.first?.cookie).toBe(`sid=${body.sid}`);
      expect(body.second?.cookie).toBe(`sid=${body.sid}`);
      expect(body.first?.address).toBe("127.0.0.1");
    }
  });

  it("hands the browser the cookie the API renewed through Astro's cookies, as the API wrote it", async () => {
    const set = vi.fn();

    await requestContext()(contextFor("sid=ada", set), async () => {
      await api.renew();
      return new Response("ok");
    });

    expect(set).toHaveBeenCalledOnce();
    const [name, value, options] = set.mock.calls[0] ?? [];
    expect([name, value]).toEqual(["sid", "re%20newed"]);
    expect(options).toMatchObject({ path: "/", httpOnly: true, secure: false, sameSite: "lax" });
    expect(options.encode("re%20newed")).toBe("re%20newed");
  });

  it("says why a cookie Astro can no longer send stays behind", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sent = Object.assign(
      new Error("Unable to set response. The response has already been sent"),
      {
        name: "ResponseSentError",
      },
    );

    await requestContext()(
      contextFor(
        "sid=ada",
        vi.fn(() => {
          throw sent;
        }),
      ),
      async () => {
        await api.renew();
        return new Response("ok");
      },
    );

    expect(warn.mock.calls.flat().join(" ")).toContain("the response had already been sent");
    warn.mockRestore();
  });
});
