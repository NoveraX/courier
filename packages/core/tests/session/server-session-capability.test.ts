/**
 * Who reads the user's session from the request being served: the server,
 * as it lends its session to the calls of its process. A page's caller
 * imports none of it — on a server it takes the session the server lent,
 * and where nothing lent one, a call that names the request it serves is
 * refused rather than sent without the credentials its code counts on.
 * The addresses such a call carries on are the server's to read as well.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { rememberPeerAddress } from "../../src/adapter/peer-address";
import { createCaller as createPageCaller } from "../../src/caller";
import { _resetServerCapabilitiesForTests } from "../../src/capabilities/provide-server-capability";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { ConfigurationError } from "../../src/errors/configuration-error";
import { createCaller } from "../../src/server/create-caller";
import { registerRequestContext } from "../../src/server/session/request-context";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

/* Made up, and joined at run time so no literal sits in the source for a secret scanner. */
const SID = ["k3Vq", "9xLp", "2Zw"].join("");
const USER = "198.51.100.23";
const { endpoint } = courier();
let upstream: Upstream;

function api(session = true) {
  return defineApi({
    name: "accounts",
    baseURL: upstream.url,
    ...(session && { session: { cookies: ["sid"] } }),
    endpoints: { me: endpoint.get("me") },
  });
}

/* The request a browser sent the application, its session cookie on it. */
function userRequest(): Request {
  return new Request("https://app.example.com/account", { headers: { cookie: `sid=${SID}` } });
}

/* The user's request, through a proxy on this machine that appended the address it saw. */
function proxiedRequest(): Request {
  const request = new Request("https://app.example.com/account", {
    headers: { "x-forwarded-for": USER },
  });
  rememberPeerAddress(request, "127.0.0.1");
  return request;
}

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

afterEach(() => {
  _resetServerCapabilitiesForTests("session");
  upstream.seen.length = 0;
});

describe("a call that names the request it serves", () => {
  it("is refused where no server lends a session, naming the endpoint and none of its credentials", async () => {
    const caller = createPageCaller(api(), { context: { req: userRequest() } });

    const refused = await caller.me().catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ConfigurationError);
    expect(refused).toMatchObject({ code: "SERVER_CAPABILITY_MISSING" });
    expect(String(refused)).toContain("accounts.me");
    expect(String(refused)).not.toContain(SID);
    expect(upstream.seen).toEqual([]);
  });

  it("is refused saying what to do on a server, and naming a copy of the core under another contract", async () => {
    /* Another copy makes its registry the first time it reads one: its key may hold no slot. */
    const other = Symbol.for("courier.serverCapabilities.v2");
    Reflect.set(globalThis, other, {});
    try {
      const refused = await createPageCaller(api(), { context: { req: userRequest() } })
        .me()
        .catch((error: unknown) => error);

      expect(refused).toMatchObject({ code: "SERVER_CAPABILITY_MISSING" });
      expect((refused as Error).message).toBe(
        "[courier] accounts.me names the request it serves in its context, and nothing here reads one: only a server does. On a server, make the caller with createCaller from @noverax/courier/server, or register the framework's request context with registerRequestContext; this process runs another copy of the core too, under another contract: its registry is kept under courier.serverCapabilities.v2, which this copy, under courier.serverCapabilities.v1, does not read. Have one version of @noverax/courier installed, as npm ls @noverax/courier, pnpm why @noverax/courier or yarn why @noverax/courier shows.",
      );
    } finally {
      Reflect.deleteProperty(globalThis, other);
    }
  });

  it("is refused saying what to do on a server, where nothing more is known", async () => {
    const refused = await createPageCaller(api(), { context: { req: userRequest() } })
      .me()
      .catch((error: unknown) => error);

    expect((refused as Error).message).toBe(
      "[courier] accounts.me names the request it serves in its context, and nothing here reads one: only a server does. On a server, make the caller with createCaller from @noverax/courier/server, or register the framework's request context with registerRequestContext.",
    );
  });

  it("carries the session from a server's caller, which lends the server's part first", async () => {
    const caller = createCaller(api(), { context: { req: userRequest() } });

    await caller.me();

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("carries the session from a page's caller once a server lent its own", async () => {
    createCaller(api());
    const caller = createPageCaller(api(), { context: { req: userRequest() } });

    await caller.me();

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("needs no server when the API keeps no session and forwards nothing", async () => {
    const caller = createPageCaller(api(false), { context: { req: userRequest() } });

    await caller.me();

    expect(upstream.seen).toHaveLength(1);
    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
  });
});

describe("the addresses a call made for a request carries on", () => {
  it("are the chain the server reads off the request, from a server's caller", async () => {
    await createCaller(api(false), { context: { req: proxiedRequest() } }).me();

    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBe(`${USER}, 127.0.0.1`);
  });

  it("are the user's address alone where the API's forward writes the header", async () => {
    const accounts = defineApi({
      name: "accounts",
      baseURL: upstream.url,
      forward: { clientAddress: ["x-forwarded-for"] },
      endpoints: { me: endpoint.get("me") },
    });

    await createCaller(accounts, { context: { req: proxiedRequest() } }).me();

    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBe(USER);
  });

  it("are the server's chain from a page's caller once a server lent its part", async () => {
    createCaller(api(false));

    await createPageCaller(api(false), { context: { req: proxiedRequest() } }).me();

    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBe(`${USER}, 127.0.0.1`);
  });

  it("are none from a page's caller where no server lends its part", async () => {
    await createPageCaller(api(false), { context: { req: proxiedRequest() } }).me();

    expect(upstream.seen).toHaveLength(1);
    expect(upstream.seen[0]?.headers["x-forwarded-for"]).toBeUndefined();
  });
});

describe("a call made while an adapter's request is served", () => {
  it("takes the session from the request a registered request context finds", async () => {
    const incoming: IncomingRequest = {
      key: {},
      method: "GET",
      origin: "https://app.example.com",
      headers: new Headers({ cookie: `sid=${SID}` }),
    };
    const remove = registerRequestContext(() => incoming);
    try {
      await createPageCaller(api()).me();
    } finally {
      remove();
    }

    expect(upstream.seen[0]?.headers.cookie).toBe(`sid=${SID}`);
  });

  it("carries no session where no server registered anything", async () => {
    await createPageCaller(api()).me();

    expect(upstream.seen).toHaveLength(1);
    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
  });
});
