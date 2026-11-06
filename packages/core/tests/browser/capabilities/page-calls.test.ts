/**
 * A page's calls, built as a page's bundle builds them — the registry's
 * stand-in in the place of the module that reads a server's slots — on a
 * page whose global object holds a document and a registry a script put
 * there. The page's calls read none of it: a call keeps the page's own
 * cookies, and one whose context names a request is refused, saying the
 * code was built for a page.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as Browser from "../../../src/browser/capabilities/registry";
import { createCaller } from "../../../src/caller";
import type { SessionCapability } from "../../../src/capabilities/session";
import { defineApi } from "../../../src/define/api";
import { courier } from "../../../src/define/courier";
import { ConfigurationError } from "../../../src/errors/configuration-error";
import { sendJson, startUpstream, type Upstream } from "../../helpers/middleware-upstream";

vi.mock(
  "../../../src/capabilities/registry",
  () => import("../../../src/browser/capabilities/registry"),
);

const REGISTRY = Symbol.for("courier.serverCapabilities.v1");
const { endpoint } = courier();
let upstream: Upstream;

/* What a script on the page offers as a server's session, recording what it is asked. */
const planted = {
  contextSession: vi.fn(),
  ambientSession: vi.fn(),
  relayCookies: vi.fn(),
  forwardedFor: vi.fn(),
  servesRequest: vi.fn(),
};

function api() {
  return defineApi({
    name: "accounts",
    baseURL: upstream.url,
    session: { cookies: ["sid"] },
    endpoints: { me: endpoint.get("me") },
  });
}

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, REGISTRY);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  upstream.seen.length = 0;
});

describe("a page's calls, beside a registry a script planted", () => {
  it("carry the page's own session and ask the planted one nothing", async () => {
    vi.stubGlobal("document", { cookie: "" });
    Reflect.set(globalThis, REGISTRY, { session: planted as unknown as SessionCapability });

    await createCaller(api()).me();

    expect(upstream.seen).toHaveLength(1);
    expect(Object.values(planted).every((asked) => asked.mock.calls.length === 0)).toBe(true);
  });

  it("refuse a call that names a request, saying what to do on a server and that the code was built for a page", async () => {
    vi.stubGlobal("document", { cookie: "" });
    Reflect.set(globalThis, REGISTRY, { session: planted as unknown as SessionCapability });
    const request = new Request("https://app.example.com/account");

    const refused = await createCaller(api(), { context: { req: request } })
      .me()
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ConfigurationError);
    expect(refused).toMatchObject({ code: "SERVER_CAPABILITY_MISSING" });
    expect((refused as Error).message).toBe(
      `[courier] accounts.me names the request it serves in its context, and nothing here reads one: only a server does. On a server, make the caller with createCaller from @noverax/courier/server, or register the framework's request context with registerRequestContext; ${Browser.missingCapabilityCause()}.`,
    );
    expect(planted.contextSession).not.toHaveBeenCalled();
    expect(upstream.seen).toEqual([]);
  });
});
