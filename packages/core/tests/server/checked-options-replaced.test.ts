/**
 * What a server sends of an API is what it checked, whatever is put in
 * the API later. A server knows what it holds by the objects it took up —
 * the API's options, each endpoint's — so options put in the place of
 * those, and an endpoint the API is given after, are checked and held
 * before a call takes anything of them, and refused as the first check
 * refuses them. Options it took up are not checked again, however many
 * calls take them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { withIncomingRequest } from "../../src/node-request-context";
import { createCaller } from "../../src/server/create-caller";
import { assertSessionApi } from "../../src/server/session/assert-session-api";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

/* Each check of what an API's options mean together, counted: one runs wherever a server takes
   options up. */
vi.mock("../../src/server/session/assert-session-api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/server/session/assert-session-api")>();
  return { ...actual, assertSessionApi: vi.fn(actual.assertSessionApi) };
});

const { endpoint } = courier();
let upstream: Upstream;

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

beforeEach(() => {
  upstream.seen.length = 0;
  vi.mocked(assertSessionApi).mockClear();
});

/* An API whose options are given as a test writes them, whatever their type says. */
function apiWith(options: Record<string, unknown>) {
  const config = { name: "accounts", baseURL: upstream.url, endpoints: { me: endpoint.get("me") } };
  return defineApi(Object.assign(config, options));
}

/* A request whose author chose the client's address it claims, beside a tenant the API may be told. */
const addressed: IncomingRequest = {
  key: {},
  method: "GET",
  origin: "https://app.example.com",
  headers: new Headers({ "x-real-ip": "203.0.113.9", "x-tenant": "made-up-tenant" }),
};

/* What the API was sent of the addressed request's headers, on the one call the test makes. */
async function sentBy(
  api: ReturnType<typeof apiWith>,
  call: () => Promise<unknown> = () => createPageCaller(api).me(),
) {
  upstream.seen.length = 0;
  await withIncomingRequest(addressed, call);
  const headers = upstream.seen[0]?.headers ?? {};
  return { tenant: headers["x-tenant"], address: headers["x-real-ip"] };
}

/* Options put in the place of an API's or an endpoint's, as code that changes them later does. */
function replace(owner: object, options: object): void {
  Object.assign(owner, { options });
}

/* An object whose every read is counted, under its name. */
function counted<T extends object>(reads: string[], name: string, target: T): T {
  return new Proxy(target, {
    get(inner, key, receiver) {
      reads.push(`${name}.${String(key)}`);
      return Reflect.get(inner, key, receiver);
    },
  });
}

describe("options put in the place of an API's a server took up", () => {
  it("are checked before a call takes them, and each call sends what passed", async () => {
    const api = apiWith({});
    createCaller(api);
    let reads = 0;
    replace(api, {
      ...api.options,
      forward: {
        get headers() {
          reads += 1;
          return reads === 1 ? ["x-tenant"] : ["x-real-ip"];
        },
      },
    });

    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(reads).toBe(1);
    expect(api.options.forward).toEqual({ headers: ["x-tenant"] });
  });

  it("are refused as the first check refuses them, and the call sends nothing", async () => {
    const api = apiWith({ forward: { headers: ["x-tenant"] } });
    createCaller(api);
    replace(api, { ...api.options, forward: { headers: ["x-real-ip"] } });
    const first = (() => {
      try {
        return createCaller(apiWith({ forward: { headers: ["x-real-ip"] } }));
      } catch (error) {
        return error;
      }
    })();

    const refused = await sentBy(api).catch((error: unknown) => error);

    expect(refused).toMatchObject({
      code: "FORWARD_OPTIONS_INVALID",
      message: (first as Error).message,
    });
    expect(first).toMatchObject({ code: "FORWARD_OPTIONS_INVALID" });
    expect(upstream.seen).toEqual([]);
  });
});

describe("an endpoint's options put in the place of those a server took up", () => {
  it("are checked beside the API's session before a call takes them", async () => {
    const api = apiWith({ session: { cookies: ["sid"] } });
    createCaller(api);
    replace(api.me, { ...api.me.options, allowedHeaders: ["cookie"] });

    expect(await sentBy(api).catch((error: unknown) => error)).toMatchObject({
      code: "SESSION_HEADER_CONFLICT",
      message: expect.stringMatching(/^accounts\.me: "cookie" in its headers/),
    });
    expect(upstream.seen).toEqual([]);
  });

  it("are held as checked once a call took them", async () => {
    const api = apiWith({ session: { cookies: ["sid"] } });
    createCaller(api);
    replace(api.me, { ...api.me.options, allowedHeaders: ["x-total-count"] });

    await sentBy(api);

    expect(Object.isFrozen(api.me.options.allowedHeaders)).toBe(true);
    expect(() => {
      (api.me.options.allowedHeaders as string[]).push("cookie");
    }).toThrow(TypeError);
  });
});

describe("an endpoint an API is given after a server took it up", () => {
  it("is checked before its first call", async () => {
    const api = apiWith({ session: { cookies: ["sid"] } });
    createCaller(api);
    Object.assign(api, { extra: endpoint.get("extra").headers(["cookie"]) });
    const extra = () => (createPageCaller(api) as unknown as { extra(): Promise<unknown> }).extra();

    expect(await sentBy(api, extra).catch((error: unknown) => error)).toMatchObject({
      code: "SESSION_HEADER_CONFLICT",
      message: expect.stringMatching(/^accounts\.extra: "cookie" in its headers/),
    });
    expect(upstream.seen).toEqual([]);
  });
});

describe("options a server took up", () => {
  it("are checked once, however many calls take them", async () => {
    const reads: string[] = [];
    const api = apiWith({
      forward: counted(reads, "forward", { headers: counted(reads, "headers", ["x-tenant"]) }),
    });
    reads.length = 0;
    createCaller(api);
    for (let call = 0; call < 3; call++) await sentBy(api);

    expect(assertSessionApi).toHaveBeenCalledTimes(1);
    expect(reads.sort()).toEqual(["forward.headers", "headers.0", "headers.length"]);
  });

  it("are checked again only where something the server did not hold is put in their place", async () => {
    const api = apiWith({ forward: { headers: ["x-tenant"] } });
    createCaller(api);
    await sentBy(api);
    replace(api, { ...api.options, forward: { headers: ["x-tenant"] } });
    await sentBy(api);
    await sentBy(api);
    Object.assign(api, { extra: endpoint.get("extra") });
    const extra = () => (createPageCaller(api) as unknown as { extra(): Promise<unknown> }).extra();
    await sentBy(api, extra);
    await sentBy(api, extra);
    await sentBy(api);

    expect(assertSessionApi).toHaveBeenCalledTimes(3);
  });
});
