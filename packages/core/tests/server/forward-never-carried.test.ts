/**
 * Should the check of what an API forwards be got round, the headers no
 * option carries — the user's cookies, their token — are left out all the
 * same, and a header an API may forward still goes. No such header is
 * read either: the request's id is never taken off one, and every call
 * made for the request shares the id.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { withIncomingRequest } from "../../src/node-request-context";
import { createCaller } from "../../src/server/create-caller";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

/* The check got round where a server takes an API up, and where a call takes its options. */
vi.mock("../../src/server/assert-server-options", () => ({
  assertServerOptions: () => undefined,
  heldForCall: () => undefined,
}));

const { endpoint } = courier();
let upstream: Upstream;

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

describe("headers no option carries, with the check got round", () => {
  it("never leave with a call made while a request is served, whatever forward names", async () => {
    const api = defineApi({
      name: "accounts",
      baseURL: upstream.url,
      forward: { headers: ["cookie", "authorization", "x-tenant"] },
      endpoints: { me: endpoint.get("me") },
    });
    createCaller(api);
    const served: IncomingRequest = {
      key: {},
      method: "GET",
      origin: "https://app.example.com",
      headers: new Headers({
        cookie: "sid=made-up",
        authorization: "Bearer made-up",
        "x-tenant": "acme",
      }),
    };

    await withIncomingRequest(served, () => createPageCaller(api).me());

    expect(upstream.seen[0]?.headers.cookie).toBeUndefined();
    expect(upstream.seen[0]?.headers.authorization).toBeUndefined();
    expect(upstream.seen[0]?.headers["x-tenant"]).toBe("acme");
  });

  it("never read the request's id off a header no option carries, for this API or the next", async () => {
    const forwarding = (name: string, requestId: true | string[]) =>
      defineApi({
        name,
        baseURL: upstream.url,
        forward: { requestId },
        endpoints: { me: endpoint.get("me") },
      });
    const accounts = forwarding("accounts", ["cookie", "authorization", "x-request-id"]);
    const billing = forwarding("billing", true);
    const served: IncomingRequest = {
      key: {},
      method: "GET",
      origin: "https://app.example.com",
      headers: new Headers({ cookie: "sid=made-up-session", authorization: "made-up-raw-token" }),
    };
    upstream.seen.length = 0;

    await withIncomingRequest(served, async () => {
      await createPageCaller(accounts).me();
      await createPageCaller(billing).me();
    });

    const ids = upstream.seen.map((seen) => seen.headers["x-request-id"]);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(JSON.stringify(upstream.seen.map((seen) => seen.headers))).not.toMatch(
      /made-up-session|made-up-raw-token/,
    );
  });
});
