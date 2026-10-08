/**
 * A Next.js middleware handing each API's double-submit token to the
 * browser with the page: asked once with the user's session where the
 * request does not carry it, set on the response, and given to the page
 * that renders the request — which cannot set cookies itself — and nothing
 * asked where the request carries it. The API is a real server.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { courier, defineApi } from "@noverax/courier/define";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { csrfTokenMiddleware, handCsrfTokens } from "../src/middleware";

const { endpoint } = courier();
let upstream: Server;
let api: ReturnType<typeof accounts>;
const seen: Array<{ url: string | undefined; headers: IncomingHttpHeaders }> = [];
let token = "t-fresh";

function accounts(baseURL: string) {
  return defineApi({
    name: "accounts",
    baseURL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "/csrf" },
    },
    endpoints: { visit: endpoint.post("visits") },
  });
}

beforeAll(async () => {
  upstream = createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    if (req.url === "/csrf") res.setHeader("set-cookie", `csrftoken=${token}; Path=/`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  api = accounts(`http://127.0.0.1:${(upstream.address() as AddressInfo).port}`);
});

afterAll(async () => {
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

afterEach(() => {
  seen.length = 0;
  token = "t-fresh";
});

const page = (cookie?: string) =>
  new NextRequest("https://app.example.com/account", {
    headers: { accept: "text/html", ...(cookie && { cookie }) },
  });

describe("csrfTokenMiddleware", () => {
  it("asks for the token with the user's session, and hands it to the browser and to the page", async () => {
    const response = await csrfTokenMiddleware(api)(page("sid=s1; theme=dark"));

    expect(seen.map((each) => each.url)).toEqual(["/csrf"]);
    expect(seen[0]?.headers.cookie).toBe("sid=s1");
    expect(response.headers.getSetCookie()).toEqual(["csrftoken=t-fresh; Path=/; Secure"]);
    /* What Next.js gives the page that renders the request: the request's headers in
       Next.js 14 and 15, the response's cookies in Next.js 16. */
    expect(response.headers.get("x-middleware-request-cookie")).toBe(
      "sid=s1; theme=dark; csrftoken=t-fresh",
    );
    expect(response.headers.get("x-middleware-set-cookie")).toContain("csrftoken=t-fresh");
  });

  it("hands a token Next.js would write changed to the browser byte for byte", async () => {
    token = "a/b";

    const response = await csrfTokenMiddleware(api)(page("sid=s1"));

    expect(response.headers.getSetCookie()).toEqual(["csrftoken=a/b; Path=/; Secure"]);
    expect(response.headers.get("x-middleware-set-cookie")).toBeNull();
  });

  it("asks nothing where the request carries the token, and changes nothing", async () => {
    const response = await csrfTokenMiddleware(api)(page("sid=s1; csrftoken=t-held"));

    expect(seen).toEqual([]);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("x-middleware-request-cookie")).toBe("sid=s1; csrftoken=t-held");
  });
});

describe("handCsrfTokens", () => {
  it("gives a middleware of the application's own the request's headers, and hands the tokens to its response", async () => {
    const tokens = await handCsrfTokens(page(), api);
    const response = tokens.handTo(NextResponse.next({ request: { headers: tokens.headers } }));

    expect(tokens.headers.get("cookie")).toBe("csrftoken=t-fresh");
    expect(tokens.headers.get("accept")).toBe("text/html");
    expect(response.headers.getSetCookie()).toEqual(["csrftoken=t-fresh; Path=/; Secure"]);
  });
});
