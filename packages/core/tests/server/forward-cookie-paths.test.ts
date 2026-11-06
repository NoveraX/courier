/**
 * A `forward` that would carry the user's cookies past the session is
 * refused on every path a server calls an API with a request on: as its
 * sources are registered, a handler or a socket handler is made with them,
 * the server's caller is made, a double-submit token is asked for, and a
 * call made with any other caller — a page's, on a server — for the
 * request it serves. Nothing reaches the upstream.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createHandler } from "../../src/adapter/create-handler";
import { createWSHandler } from "../../src/adapter/handle-ws";
import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { ConfigurationError } from "../../src/errors/configuration-error";
import { withIncomingRequest } from "../../src/node-request-context";
import { createCaller } from "../../src/server/create-caller";
import { ensureCsrfToken } from "../../src/server/ensure-csrf-token";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

/* Made up: the user's session, and another service's beside it. */
const COOKIES = ["sid=", "made-up-session; billing_sid=", "made-up-other"].join("");
const { endpoint } = courier();
let upstream: Upstream;

/* An API whose forward would carry every cookie of the request served. */
function api() {
  return defineApi({
    name: "accounts",
    baseURL: upstream.url,
    session: {
      cookies: ["sid"],
      csrf: { cookie: "csrftoken", header: "x-csrftoken", from: "/csrf" },
    },
    forward: { headers: ["cookie"] },
    endpoints: { me: endpoint.get("me") },
  });
}

function served(): IncomingRequest {
  return {
    key: {},
    method: "GET",
    origin: "https://app.example.com",
    headers: new Headers({ cookie: COOKIES }),
  };
}

function refusalOf(takeUp: () => unknown): unknown {
  try {
    return takeUp();
  } catch (error) {
    return error;
  }
}

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

afterEach(() => {
  _resetSourcesForTests();
  upstream.seen.length = 0;
});

describe("a forward that would carry the user's cookies", () => {
  it.each([
    ["registering the sources", () => registerSources({ accounts: api() })],
    ["making a handler with them", () => createHandler({ sources: { accounts: api() } })],
    ["making a socket handler with them", () => createWSHandler({ sources: { accounts: api() } })],
    ["making the server's caller", () => createCaller(api())],
  ])("is refused on %s", (_path, takeUp) => {
    expect(refusalOf(takeUp)).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
  });

  it("is refused for a page's caller on a server, whose call names the request it serves", async () => {
    const request = new Request("https://app.example.com/account", {
      headers: { cookie: COOKIES },
    });

    const refused = await createPageCaller(api(), { context: { req: request } })
      .me()
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ConfigurationError);
    expect(refused).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
    expect(upstream.seen).toEqual([]);
  });

  it("is refused for a page's caller on a server, whose call is made while a request is served", async () => {
    const refused = await withIncomingRequest(served(), () => createPageCaller(api()).me()).catch(
      (error: unknown) => error,
    );

    expect(refused).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
    expect(upstream.seen).toEqual([]);
  });

  it("is refused as a double-submit token is asked for", async () => {
    const refused = await withIncomingRequest(served(), () => ensureCsrfToken(api())).catch(
      (error: unknown) => error,
    );

    expect(refused).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
    expect(upstream.seen).toEqual([]);
  });
});
