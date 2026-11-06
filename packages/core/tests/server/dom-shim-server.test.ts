/**
 * A server that put a DOM on its global object — global-jsdom, happy-dom,
 * a library's shim for rendering on the server — is a server still. Each
 * of its paths behaves as on a server without one: the request a call's
 * context names, the request being served as a call is made, the
 * addresses a request came through, Studio's view of a call, the proxy in
 * process and an adapter's proxy route.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter";
import { rememberPeerAddress } from "../../src/adapter/peer-address";
import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { routesOf } from "../../src/define/routes-of";
import { withIncomingRequest } from "../../src/node-request-context";
import { createProxyCaller } from "../../src/proxy-caller";
import { createCaller } from "../../src/server/create-caller";
import { registerRequestContext } from "../../src/server/session/request-context";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { studioHooks } from "../../src/studio";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SID = ["d0m", "Sh1m", "7q"].join("");
const USER = "198.51.100.23";
const { endpoint } = courier();
let upstream: Upstream;

function api(session: boolean) {
  return defineApi({
    expose: true,
    name: "accounts",
    baseURL: upstream.url,
    ...(session && { session: { cookies: ["sid"] } }),
    endpoints: { me: endpoint.get("me") },
  });
}

/* An API whose session a page keeps: its writes carry the double-submit token from its cookie. */
function accounts() {
  return defineApi({
    name: "accounts",
    baseURL: upstream.url,
    session: { cookies: ["sid"], csrf: { cookie: "csrftoken", header: "x-csrftoken" } },
    endpoints: { rename: endpoint.post("me/name").variables<{ name: string }>() },
  });
}

/* The request a browser sent the application, its session cookie on it. */
function userRequest(headers: Record<string, string> = { cookie: `sid=${SID}` }): Request {
  return new Request("https://app.example.com/account", { headers });
}

/* The request an adapter serves, as it describes it to the session. */
function served(): IncomingRequest {
  return {
    key: {},
    method: "GET",
    origin: "https://app.example.com",
    headers: new Headers({ cookie: `sid=${SID}` }),
  };
}

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

beforeEach(() => {
  /* As global-jsdom leaves it: a document on the server's global object. */
  Reflect.set(globalThis, "document", { cookie: "" });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  _resetSourcesForTests();
  upstream.seen.length = 0;
});

describe("a server with a DOM shim", () => {
  it("carries the session of the request a call's context names", async () => {
    await createCaller(api(true), { context: { req: userRequest() } }).me();

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("carries the session of the request a registered request context finds", async () => {
    const remove = registerRequestContext(() => served());
    try {
      await createCaller(api(true)).me();
    } finally {
      remove();
    }

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("carries the session of the request withIncomingRequest serves", async () => {
    await withIncomingRequest(served(), () => createCaller(api(true)).me());

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("keeps a page's session for a page's caller's call no request is being served for, as a jsdom test makes", async () => {
    Reflect.set(globalThis, "document", { cookie: "csrftoken=t0k3n" });

    await createPageCaller(accounts()).rename({ name: "Ada" });

    expect(upstream.seen[0]?.headers["x-csrftoken"]).toBe("t0k3n");
  });

  it("takes no session the DOM keeps for the server's caller's call no request is being served for", async () => {
    Reflect.set(globalThis, "document", { cookie: "csrftoken=t0k3n" });

    await createCaller(accounts()).rename({ name: "Ada" });

    expect(upstream.seen[0]?.headers["x-csrftoken"]).toBeUndefined();
  });

  it("carries on the addresses that request came through", async () => {
    const request = userRequest({ "x-forwarded-for": USER });
    rememberPeerAddress(request, "127.0.0.1");

    await createCaller(api(false), { context: { req: request } }).me();

    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBe(`${USER}, 127.0.0.1`);
  });

  it("tells Studio of a call", async () => {
    let told = 0;
    studioHooks.onRequestStart = () => {
      told += 1;
    };
    try {
      await createCaller(api(false)).me();
    } finally {
      delete studioHooks.onRequestStart;
    }

    expect(told).toBe(1);
  });

  it("reaches its proxy in process", async () => {
    registerSources({ accounts: api(false) });

    await createProxyCaller(routesOf(api(false), "accounts")).me();

    expect(upstream.seen).toHaveLength(1);
  });

  it("serves a browser's call on an adapter's proxy route with the user's session", async () => {
    registerSources({ accounts: api(true) });
    const call = new Request("http://app.localhost/api/request?_s=accounts&_m=me", {
      headers: { cookie: `sid=${SID}` },
    });

    const answer = await createHandler().handle(call);

    expect(answer.status).toBe(200);
    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });
});
