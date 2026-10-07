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

function eventFor(headers: Record<string, string>, method = "GET"): SvelteKitServerEvent {
  return {
    request: new Request("https://app.example.com/account", { method, headers }),
    url: new URL("https://app.example.com/account"),
    cookies: { set: vi.fn() },
    getClientAddress: () => "203.0.113.9",
  };
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

  it("gives no address for a page being prerendered", () => {
    const event = eventFor({});
    event.getClientAddress = () => {
      throw new Error("Cannot call getClientAddress() when prerendering");
    };

    expect(svelteKitIncomingRequest(event).clientAddress).toBeUndefined();
  });

  it("says why a cookie cannot be set once the response was generated", () => {
    const event = eventFor({});
    event.cookies.set = () => {
      throw new Error("Cannot use `cookies.set(...)` after the response has been generated");
    };
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
    const options = vi.mocked(event.cookies.set).mock.calls[0]?.[2];
    expect(options?.encode("s%3Arenewed")).toBe("s%3Arenewed");
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
