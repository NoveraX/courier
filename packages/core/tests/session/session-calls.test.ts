/**
 * What a real upstream receives when the application calls it while serving
 * a user, and what the user's browser is handed back.
 *
 * The upstream is a real HTTP server recording every request, so the
 * assertions read the headers as they crossed the wire, not as the client
 * meant to send them.
 */
import type { ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { HTTPError } from "../../src/errors/http-error";
import type { IncomingRequest, RelayedCookie } from "../../src/session/incoming-request";
import { registerRequestContext } from "../../src/session/request-context";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

let upstream: Upstream;
let answer: (res: ServerResponse, url: string) => void = (res) => sendJson(res, 200, { ok: true });
let serving: IncomingRequest | undefined;
let removeProvider: () => void;

/* The request the application is serving, with the browser's cookies on it. */
function userRequest(
  method: string,
  headers: Record<string, string>,
): { incoming: IncomingRequest; handed: RelayedCookie[] } {
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

const { endpoint } = courier();
let client: ReturnType<typeof makeClient>;

function makeClient() {
  const api = defineApi({
    name: "accounts",
    baseURL: upstream.url,
    session: {
      cookies: ["sid", "logto_*"],
      bearer: "access_token",
      csrf: { cookie: "csrftoken", header: "x-csrftoken" },
    },
    forward: { requestId: true, userAgent: true },
    endpoints: {
      me: endpoint.get("me"),
      rename: endpoint.post("me/name").variables<{ name: string }>(),
      logout: endpoint.post("logout", { session: "unguarded" }),
      catalog: endpoint.get("catalog", { session: false, forward: false }),
    },
  });
  return createCaller(api);
}

beforeAll(async () => {
  upstream = await startUpstream((req, res) => answer(res, req.url ?? ""));
  client = makeClient();
  removeProvider = registerRequestContext(() => serving);
});

afterAll(async () => {
  removeProvider();
  await upstream.close();
});

afterEach(() => {
  serving = undefined;
  upstream.seen.length = 0;
  answer = (res) => sendJson(res, 200, { ok: true });
});

describe("a read made while serving a user", () => {
  it("carries the session's cookies and token, and leaves the application's own behind", async () => {
    serving = userRequest("GET", {
      cookie: "sid=a1; logto_app=x; theme=dark; _ga=GA1; access_token=tok.en; csrftoken=c1",
      "sec-fetch-site": "same-origin",
    }).incoming;

    await client.me();

    const seen = upstream.seen[0]?.headers;
    expect(seen?.cookie).toBe("sid=a1; logto_app=x; csrftoken=c1");
    expect(seen?.authorization).toBe("Bearer tok.en");
    expect(seen?.["x-csrftoken"]).toBeUndefined();
    expect(seen?.referer).toBe("https://app.example.com/");
  });

  it("carries nothing when no request is being served", async () => {
    await client.me();

    const seen = upstream.seen[0]?.headers;
    expect(seen?.cookie).toBeUndefined();
    expect(seen?.authorization).toBeUndefined();
  });

  it("does not read the request at all for an endpoint that takes no session", async () => {
    let asked = 0;
    const remove = registerRequestContext(() => {
      asked += 1;
      return undefined;
    });
    serving = userRequest("GET", { cookie: "sid=a1", "user-agent": "UA" }).incoming;

    await client.catalog();
    remove();

    expect(asked).toBe(0);
    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
    expect(upstream.seen[0]?.headers["user-agent"]).not.toBe("UA");
  });

  it("lets a header the call sets itself win over the session's", async () => {
    serving = userRequest("GET", { cookie: "sid=a1" }).incoming;

    await client.with({ headers: { cookie: "sid=chosen" } }).me();

    expect(upstream.seen[0]?.headers.cookie).toBe("sid=chosen");
  });

  it("gives every call of one request the same id, and another request another", async () => {
    serving = userRequest("GET", { cookie: "sid=a1" }).incoming;
    await client.me();
    await client.me();
    serving = userRequest("GET", { cookie: "sid=b2" }).incoming;
    await client.me();

    const ids = upstream.seen.map((seen) => seen.headers["x-request-id"]);
    expect(ids[0]).toMatch(/^[\da-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });
});

describe("a write made while serving a user", () => {
  it("repeats the double-submit token for a form of the application", async () => {
    serving = userRequest("POST", {
      cookie: "sid=a1; csrftoken=c1",
      "sec-fetch-site": "same-origin",
      origin: "https://app.example.com",
    }).incoming;

    await client.rename({ name: "Ada" });

    const seen = upstream.seen[0]?.headers;
    expect(seen?.cookie).toBe("sid=a1; csrftoken=c1");
    expect(seen?.["x-csrftoken"]).toBe("c1");
    expect(seen?.referer).toBe("https://app.example.com/");
  });

  it("is refused for a page another site linked to, and never reaches the API", async () => {
    serving = userRequest("GET", {
      cookie: "sid=a1; csrftoken=c1",
      "sec-fetch-site": "cross-site",
    }).incoming;

    const failure = await client.rename({ name: "Mallory" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HTTPError);
    expect((failure as HTTPError).status).toBe(403);
    expect(JSON.stringify((failure as HTTPError).data)).toContain(
      "accounts.rename would write on the user's behalf",
    );
    expect(upstream.seen).toHaveLength(0);
  });

  it("is refused for another site's form even before anyone has signed in", async () => {
    serving = userRequest("POST", {
      cookie: "csrftoken=c1",
      "sec-fetch-site": "cross-site",
      origin: "https://evil.example",
    }).incoming;

    await expect(client.rename({ name: "x" })).rejects.toMatchObject({ status: 403 });
    expect(upstream.seen).toHaveLength(0);
  });

  it("goes through for an endpoint left unguarded", async () => {
    serving = userRequest("GET", {
      cookie: "sid=a1; csrftoken=c1",
      "sec-fetch-site": "cross-site",
    }).incoming;

    await client.logout();

    expect(upstream.seen[0]?.headers["x-csrftoken"]).toBe("c1");
  });
});

describe("the cookies the API sets", () => {
  it("are handed to the browser made for the application, and sent by the calls that follow", async () => {
    const user = userRequest("GET", { cookie: "sid=old; theme=dark" });
    serving = user.incoming;
    answer = (res, url) => {
      if (url === "/me" && upstream.seen.length === 1) {
        res.setHeader("set-cookie", [
          "sid=new; Path=/v1; Domain=127.0.0.1; HttpOnly; SameSite=Lax",
          "tracking=1; Path=/",
        ]);
      }
      sendJson(res, 200, { ok: true });
    };

    await client.me();
    await client.me();

    expect(user.handed.map((cookie) => cookie.header)).toEqual([
      "sid=new; Path=/; Secure; HttpOnly; SameSite=Lax",
    ]);
    expect(upstream.seen[1]?.headers.cookie).toBe("sid=new");
  });

  it("are carried on from an error answer, a sign-out that ends the session", async () => {
    const user = userRequest("POST", { cookie: "sid=a1", "sec-fetch-site": "same-origin" });
    serving = user.incoming;
    answer = (res) => {
      res.setHeader("set-cookie", "sid=; Max-Age=0; Path=/");
      sendJson(res, 401, { message: "signed out" });
    };

    await expect(client.rename({ name: "x" })).rejects.toMatchObject({ status: 401 });
    answer = (res) => sendJson(res, 200, { ok: true });
    await client.me();

    expect(user.handed[0]?.header).toBe("sid=; Path=/; Max-Age=0; Secure");
    expect(upstream.seen[1]?.headers.cookie).toBeUndefined();
  });
});

describe("a session that cannot travel safely", () => {
  it("is refused where the API is defined over plain HTTP across the internet", () => {
    const define = () =>
      defineApi({
        name: "remote",
        baseURL: "http://api.example.com",
        session: { cookies: ["sid"] },
        endpoints: {},
      });

    expect(define).toThrow(/SESSION_INSECURE_TRANSPORT|plain HTTP across the public internet/);
  });

  it("is refused when a call is sent somewhere insecure, before anything is sent", async () => {
    serving = userRequest("GET", { cookie: "sid=a1" }).incoming;

    const sent = client.with({ prefixUrl: "http://api.example.com" }).me();

    await expect(sent).rejects.toThrow(/plain HTTP across the public internet/);
    expect(upstream.seen).toHaveLength(0);
  });
});
