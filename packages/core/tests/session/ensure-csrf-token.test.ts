/**
 * A page asking the API for the user's double-submit token up front, while
 * it is served — for the writes it makes later, from the browser or while
 * it renders: asked once with the user's session, through the API's
 * middleware, the token handed to the browser; nothing asked where the
 * request carries it, or where no request is served.
 *
 * The API is a real server, so the assertions read what crossed its wire.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { ConfigurationError } from "../../src/errors/configuration-error";
import { defineMiddleware } from "../../src/middleware/define";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { ensureCsrfToken } from "../../src/utils/ensure-csrf-token";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;
let serving: IncomingRequest | undefined;
let removeProvider: () => void;
let tokenStatus = 200;
const purposes: Array<string | undefined> = [];

function defineAccounts(baseURL: string, from?: string) {
  return defineApi({
    name: "accounts",
    baseURL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", ...(from && { from }) },
    },
    middleware: [
      defineMiddleware("purpose", "before", (ctx) => {
        purposes.push(ctx.purpose);
      }),
    ],
    endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
  });
}

let api: ReturnType<typeof defineAccounts>;

/* The request the application is serving, with the browser's cookies on it. */
function userRequest(headers: Record<string, string>) {
  const handed: RelayedCookie[] = [];
  const incoming: IncomingRequest = {
    key: {},
    method: "GET",
    origin: "https://app.example.com",
    headers: new Headers(headers),
    setCookie: (cookie) => {
      handed.push(cookie);
      return true;
    },
  };
  return { incoming, handed };
}

beforeAll(async () => {
  upstream = await startUpstream((req, res) => {
    if (req.url === "/csrf") {
      if (tokenStatus !== 200) return sendJson(res, tokenStatus, { error: "down" });
      res.setHeader("set-cookie", "csrftoken=t-fresh; Path=/");
    }
    sendJson(res, 200, { ok: true });
  });
  api = defineAccounts(upstream.url, "/csrf");
  removeProvider = registerRequestContext(() => serving);
});

afterAll(async () => {
  removeProvider();
  await upstream.close();
});

afterEach(() => {
  serving = undefined;
  tokenStatus = 200;
  upstream.seen.length = 0;
  purposes.length = 0;
  vi.restoreAllMocks();
});

describe("asking for the double-submit token up front", () => {
  it("asks with the user's session, through the API's middleware, and hands the token to the browser", async () => {
    const { incoming, handed } = userRequest({
      cookie: "sid=s1; theme=dark",
      "sec-fetch-site": "same-origin",
    });
    serving = incoming;

    expect(await ensureCsrfToken(api)).toBe(true);

    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual(["GET /csrf"]);
    expect(upstream.seen[0]?.headers.cookie).toBe("sid=s1");
    expect(purposes).toEqual(["csrf-token"]);
    expect(handed.map((each) => each.header)).toEqual(["csrftoken=t-fresh; Path=/; Secure"]);
  });

  it("asks nothing where the request carries the token, and a later write repeats it", async () => {
    serving = userRequest({
      cookie: "sid=s1; csrftoken=t-held",
      "sec-fetch-site": "same-origin",
    }).incoming;

    expect(await ensureCsrfToken(api)).toBe(true);
    await createCaller(api).rename({ name: "Ada" });

    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual(["POST /me/name"]);
    expect(upstream.seen[0]?.headers["x-csrftoken"]).toBe("t-held");
  });

  it("asks once with a write made beside it, which then repeats the token it got", async () => {
    serving = userRequest({ cookie: "sid=s2", "sec-fetch-site": "same-origin" }).incoming;

    await Promise.all([ensureCsrfToken(api), createCaller(api).rename({ name: "Ada" })]);

    expect(upstream.seen.filter((seen) => seen.url === "/csrf")).toHaveLength(1);
    expect(upstream.seen.find((seen) => seen.url === "/me/name")?.headers["x-csrftoken"]).toBe(
      "t-fresh",
    );
  });

  it("asks for a request another site set off too, whose writes stay refused", async () => {
    serving = userRequest({ cookie: "sid=s3", "sec-fetch-site": "cross-site" }).incoming;

    expect(await ensureCsrfToken(api)).toBe(true);
    await expect(createCaller(api).rename({ name: "Mallory" })).rejects.toMatchObject({
      status: 403,
    });

    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual(["GET /csrf"]);
  });

  it("asks nothing where no request is served", async () => {
    expect(await ensureCsrfToken(api)).toBe(false);
    expect(upstream.seen).toEqual([]);
  });

  it("goes on without the token, saying why, when asking fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    tokenStatus = 503;
    serving = userRequest({ cookie: "sid=s4", "sec-fetch-site": "same-origin" }).incoming;

    expect(await ensureCsrfToken(api)).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain(
      "for the double-submit token failed; the page goes without it",
    );
  });

  it("is a configuration error for an API that names no place it hands the token out", async () => {
    const without = defineAccounts(upstream.url);

    await expect(ensureCsrfToken(without)).rejects.toBeInstanceOf(ConfigurationError);
    await expect(ensureCsrfToken(without)).rejects.toMatchObject({
      code: "SESSION_OPTIONS_INVALID",
    });
  });
});
