/**
 * Universal code a page renders with, calling its own application's proxy
 * in process with a proxy caller, for a user who has no double-submit
 * token yet: the write asks where the API hands the token out first, with
 * that user's session, through the proxy's own checks; the token reaches
 * the write and the user's browser; one ask serves the writes made
 * together; and a write another site sets off is refused before anything
 * is asked for. No request leaves the server for the proxy.
 *
 * The API is a real server, so the assertions read what crossed its wire.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { courier, defineApi } from "../../src/define";
import { createProxyCaller } from "../../src/proxy-caller";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/sources";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;
let serving: IncomingRequest | undefined;
let removeProvider: () => void;

function defineAccounts(baseURL: string) {
  return defineApi({
    name: "accounts",
    baseURL,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "/csrf" },
    },
    endpoints: {
      login: endpoint.post("login").variables<{ user: string }>(),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
    },
  });
}

type Accounts = ReturnType<typeof defineAccounts>;

/* The request the application is serving, with the browser's cookies on it. */
function userRequest(method: string, headers: Record<string, string>) {
  const handed: RelayedCookie[] = [];
  const incoming: IncomingRequest = {
    key: {},
    method,
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
    if (req.url === "/csrf") res.setHeader("set-cookie", "csrftoken=t-fresh; Path=/");
    const cookie = req.headers.cookie ?? "";
    const token = /csrftoken=([^;]+)/.exec(cookie)?.[1];
    if (req.method === "POST" && (token === undefined || req.headers["x-csrftoken"] !== token)) {
      return sendJson(res, 403, { error: "CSRF token missing or incorrect" });
    }
    if (req.url === "/login") res.setHeader("set-cookie", "sid=s%3Aada.sig; Path=/; HttpOnly");
    sendJson(res, 200, { ok: true });
  });
  registerSources({ accounts: defineAccounts(upstream.url) });
  removeProvider = registerRequestContext(() => serving);
});

afterAll(async () => {
  removeProvider();
  _resetSourcesForTests();
  await upstream.close();
});

afterEach(() => {
  serving = undefined;
  upstream.seen.length = 0;
  vi.restoreAllMocks();
});

describe("a proxy caller's write on the server that finds no double-submit token", () => {
  it("asks for it with the user's session, in process, and hands the token and the session to the browser", async () => {
    const { incoming, handed } = userRequest("POST", {
      cookie: "theme=dark",
      "sec-fetch-site": "same-origin",
    });
    serving = incoming;
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await createProxyCaller<Accounts>("accounts").login({ user: "ada" });

    expect(upstream.seen.map((seen) => `${seen.method} ${seen.url}`)).toEqual([
      "GET /csrf",
      "POST /login",
    ]);
    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
    expect(upstream.seen[1]?.headers.cookie).toBe("csrftoken=t-fresh");
    expect(upstream.seen[1]?.headers["x-csrftoken"]).toBe("t-fresh");
    expect(handed.map((each) => each.header)).toEqual([
      "csrftoken=t-fresh; Path=/; Secure",
      "sid=s%3Aada.sig; Path=/; Secure; HttpOnly",
    ]);
    /* The proxy is called in process: the only requests are the API's. */
    expect(fetchSpy.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
      "/csrf",
      "/login",
    ]);
  });

  it("asks once for the writes made together, and the next write repeats the token it got", async () => {
    serving = userRequest("POST", { cookie: "sid=s3", "sec-fetch-site": "same-origin" }).incoming;
    const accounts = createProxyCaller<Accounts>("accounts");

    await Promise.all([accounts.rename({ name: "Ada" }), accounts.rename({ name: "Grace" })]);
    await accounts.rename({ name: "Hedy" });

    expect(upstream.seen.filter((seen) => seen.url === "/csrf")).toHaveLength(1);
    const writes = upstream.seen.filter((seen) => seen.url === "/me/name");
    expect(writes.map((seen) => seen.headers["x-csrftoken"])).toEqual([
      "t-fresh",
      "t-fresh",
      "t-fresh",
    ]);
  });

  it("is refused for a request another site set off, before the token is asked for", async () => {
    serving = userRequest("GET", { "sec-fetch-site": "cross-site" }).incoming;

    await expect(
      createProxyCaller<Accounts>("accounts").login({ user: "mallory" }),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(upstream.seen).toEqual([]);
  });
});
