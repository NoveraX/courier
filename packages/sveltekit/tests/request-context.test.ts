/**
 * A SvelteKit request event, as the session reads it — found with
 * `getRequestEvent` on SvelteKit 2.20 and later, or entered by the `handle`
 * hook on any SvelteKit 2 — and the cookies the API sets, handed to
 * `cookies.set()` exactly as the API wrote them.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createCaller, registerRequestContext } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { requestContextHandle } from "../src/handle";
import {
  type SvelteKitServerEvent,
  svelteKitIncomingRequest,
  svelteKitRequestContext,
} from "../src/request-context";

/* The options SvelteKit's `cookies.set()` takes: a path, and whatever else the call names. */
type CookieOptions = { path: string } & Partial<
  Parameters<SvelteKitServerEvent["cookies"]["set"]>[2]
>;

/* `cookies` as SvelteKit makes it: `getAll` reads the request's `Cookie` through `decode`, the
   first of a name winning, and gives each cookie set since as it was set; `delete` sets one empty. */
function svelteKitCookies(header: string) {
  const set = new Map<string, string>();
  return {
    getAll({ decode }: { decode(value: string): string }) {
      const read = new Map<string, string>();
      for (const pair of header.split(";")) {
        const at = pair.indexOf("=");
        const name = pair.slice(0, at).trim();
        if (at > 0 && !read.has(name)) read.set(name, decode(pair.slice(at + 1).trim()));
      }
      for (const [name, value] of set) read.set(name, value);
      return [...read].map(([name, value]) => ({ name, value }));
    },
    set: vi.fn((name: string, value: string, _options: CookieOptions) => {
      set.set(name, value);
    }),
    delete(name: string) {
      set.set(name, "");
    },
  };
}

function eventFor(headers: Record<string, string>, method = "GET") {
  const cookies = svelteKitCookies(headers.cookie ?? "");
  const event: SvelteKitServerEvent = {
    request: new Request("https://app.example.com/account", { method, headers }),
    url: new URL("https://app.example.com/account"),
    cookies,
    getClientAddress: () => "203.0.113.9",
  };
  return Object.assign(event, { cookies });
}

let api: Server;
let apiUrl: string;
const seen: Array<string | undefined> = [];

beforeAll(async () => {
  api = createServer((req, res) => {
    seen.push(req.headers.cookie);
    res.setHeader("set-cookie", "sid=s%3Arenewed; Path=/v1; HttpOnly; SameSite=Lax");
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
});

afterAll(async () => {
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

function client() {
  const { endpoint } = courier();
  return createCaller(
    defineApi({
      name: "accounts",
      baseURL: apiUrl,
      session: { cookies: ["sid"] },
      endpoints: { me: endpoint.get("me") },
    }),
  );
}

describe("svelteKitIncomingRequest", () => {
  it("reads the event's method, origin, headers and the address the adapter vouches for", () => {
    const incoming = svelteKitIncomingRequest(eventFor({ cookie: "sid=a1" }, "POST"));

    expect(incoming).toMatchObject({ method: "POST", origin: "https://app.example.com" });
    expect(incoming.headers.get("cookie")).toBe("sid=a1");
    expect(incoming.clientAddress).toBe("203.0.113.9");
  });

  it("holds the cookies as the request's code leaves them each time it is asked", () => {
    const event = eventFor({ cookie: "sid=OLD; pref=a%7Eb; b64=YWJj+ZGVm/==; theme=dark" });
    const incoming = svelteKitIncomingRequest(event);

    event.cookies.set("sid", "NEW one", { path: "/" });
    event.cookies.delete("theme");

    expect(incoming.cookieHeader?.()).toBe("pref=a%7Eb; b64=YWJj+ZGVm/==; sid=NEW%20one");
  });

  it("gives no address for a page being prerendered", () => {
    const event = eventFor({});
    event.getClientAddress = () => {
      throw new Error("Cannot call getClientAddress() when prerendering");
    };

    expect(svelteKitIncomingRequest(event).clientAddress).toBeUndefined();
  });

  it("says why a cookie cannot be set once the response was generated", () => {
    const event = eventFor({});
    event.cookies.set.mockImplementation(() => {
      throw new Error("Cannot use `cookies.set(...)` after the response has been generated");
    });
    const incoming = svelteKitIncomingRequest(event);

    const result = incoming.setCookie?.({
      cookie: { name: "sid", value: "a1", path: "/" },
      header: "sid=a1; Path=/",
    });

    expect(result).toBe("the response had already been generated");
  });
});

describe("svelteKitRequestContext", () => {
  it("registers once however often a hook module runs", () => {
    const getRequestEvent = () => eventFor({});

    expect(svelteKitRequestContext(getRequestEvent)).toBe(svelteKitRequestContext(getRequestEvent));
  });

  it("finds no request outside one", () => {
    const provider = svelteKitRequestContext(() => {
      throw new Error(
        "Can only read the current request event inside functions invoked during `handle`",
      );
    });

    expect(provider()).toBeUndefined();
  });

  it("serves a call with the event's session and hands the API's cookie to cookies.set as written", async () => {
    const event = eventFor({ cookie: "sid=a1; theme=dark" });
    const remove = registerRequestContext(svelteKitRequestContext(() => event));

    await client().me();
    remove();

    expect(seen.at(-1)).toBe("sid=a1");
    expect(event.cookies.set).toHaveBeenCalledWith(
      "sid",
      "s%3Arenewed",
      expect.objectContaining({ path: "/", secure: true, httpOnly: true, sameSite: "lax" }),
    );
    const options = event.cookies.set.mock.calls[0]?.[2];
    expect(options?.encode?.("s%3Arenewed")).toBe("s%3Arenewed");
  });
});

describe("the cookies of a request SvelteKit serves", () => {
  it("reach each call as the request's code leaves them, and the API's as the API wrote it", async () => {
    const event = eventFor({ cookie: "sid=a1; theme=dark" });
    const remove = registerRequestContext(svelteKitRequestContext(() => event));
    const from = seen.length;

    await client().me();
    await client().me();
    event.cookies.set("sid", "mine", { path: "/" });
    await client().me();
    remove();

    expect(seen.slice(from)).toEqual(["sid=a1", "sid=s%3Arenewed", "sid=mine"]);
  });
});

describe("requestContextHandle", () => {
  it("serves everything resolve does with the event's session, through every await", async () => {
    const handle = requestContextHandle();
    const event = eventFor({ cookie: "sid=b2" });

    await handle({
      event,
      resolve: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await client().me();
        return new Response("ok");
      },
    });

    expect(seen.at(-1)).toBe("sid=b2");
  });
});
