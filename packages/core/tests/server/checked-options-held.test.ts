/**
 * What a server checked of an API is what it sends: the session, what the
 * API forwards and the header lists of the API and its endpoints are held
 * as the check read them once a server takes the API up — a copy, frozen,
 * in their place — so a change made through the API fails where it is
 * made rather than sending what no check read. The objects the API was
 * given stay their owner's, and a change to them changes nothing the API
 * sends. An option the API does not name is held as unset, so none is set
 * later; and the check takes data alone — objects of plain data and lists
 * of strings — so the copy holds all of it. Each option is read once, into
 * the copy the checks read: what each option is comes before what they
 * mean together, and a getter or a Proxy that answers a second read
 * otherwise is never read again. Options their user froze keep an option
 * no copy can take the place of only where it is frozen to its depths.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCaller as createPageCaller } from "../../src/caller";
import { defineApi } from "../../src/define/api";
import { courier } from "../../src/define/courier";
import { withIncomingRequest } from "../../src/node-request-context";
import { createCaller } from "../../src/server/create-caller";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { sendJson, startUpstream, type Upstream } from "../helpers/middleware-upstream";

const { endpoint } = courier();
let upstream: Upstream;

beforeAll(async () => {
  upstream = await startUpstream((_req, res) => sendJson(res, 200, { ok: true }));
});

afterAll(async () => {
  await upstream.close();
});

/* An API whose options are given as a test writes them, whatever their type says. */
function apiWith(options: Record<string, unknown>) {
  const config = { name: "accounts", baseURL: upstream.url, endpoints: { me: endpoint.get("me") } };
  return defineApi(Object.assign(config, options));
}

const served: IncomingRequest = {
  key: {},
  method: "GET",
  origin: "https://app.example.com",
  headers: new Headers({ cookie: "sid=made-up-session", "x-request-id": "made-up-id-1" }),
};

/* A request whose author chose the client's address it claims, beside a tenant the API may be told. */
const addressed: IncomingRequest = {
  ...served,
  headers: new Headers({ "x-real-ip": "203.0.113.9", "x-tenant": "made-up-tenant" }),
};

/* What the API was sent of the addressed request's headers, on the one call the test makes. */
async function sentBy(api: ReturnType<typeof apiWith>, call = () => createPageCaller(api).me()) {
  upstream.seen.length = 0;
  await withIncomingRequest(addressed, call);
  const headers = upstream.seen[0]?.headers ?? {};
  return { tenant: headers["x-tenant"], address: headers["x-real-ip"] };
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

describe("an API a server took up", () => {
  it("holds what the check read: a change through the API fails, and the next call sends the same", async () => {
    const session = { cookies: ["sid"] };
    const api = defineApi({
      name: "accounts",
      baseURL: upstream.url,
      session,
      forward: { requestId: ["x-request-id"] },
      allowedHeaders: ["x-api-version"],
      endpoints: { me: endpoint.get("me").headers(["x-total-count"]) },
    });
    createCaller(api);
    upstream.seen.length = 0;
    await withIncomingRequest(served, () => createPageCaller(api).me());
    const options = api.options as unknown as Record<string, unknown>;
    const forward = options.forward as { requestId: string[] };

    expect(() => {
      forward.requestId = ["cookie", "x-request-id"];
    }).toThrow(TypeError);
    expect(() => {
      options.forward = { headers: ["cookie"] };
    }).toThrow(TypeError);
    expect(() => {
      (options.allowedHeaders as string[]).push("cookie");
    }).toThrow(TypeError);
    expect(() => {
      (options.session as { cookies: string[] }).cookies.push("other");
    }).toThrow(TypeError);
    expect(() => {
      (api.me.options.allowedHeaders as string[]).push("cookie");
    }).toThrow(TypeError);
    session.cookies.push("other");

    await withIncomingRequest(served, () => createPageCaller(api).me());
    const [first, second] = upstream.seen.map((seen) => seen.headers);
    expect(second?.["x-request-id"]).toBe(first?.["x-request-id"]);
    expect(second?.cookie).toBe(first?.cookie);
  });

  it("leaves the objects it was given their owner's, a settings module's among them", () => {
    const settings = { cookies: ["sid"], forwarded: ["x-tenant"] };
    const api = defineApi({
      name: "accounts",
      baseURL: upstream.url,
      session: { cookies: settings.cookies },
      forward: { headers: settings.forwarded },
      endpoints: { me: endpoint.get("me") },
    });
    createCaller(api);

    settings.cookies.push("theme");
    settings.forwarded[0] = "x-region";

    expect(settings).toEqual({ cookies: ["sid", "theme"], forwarded: ["x-region"] });
    expect(api.options.session?.cookies).toEqual(["sid"]);
    expect(api.options.forward?.headers).toEqual(["x-tenant"]);
  });

  it("holds a copy of its own where two APIs share an object, and leaves the other's as given", () => {
    const forward = { headers: ["x-tenant"] };
    const define = (name: string) =>
      defineApi({ name, baseURL: upstream.url, forward, endpoints: { me: endpoint.get("me") } });
    const accounts = define("accounts");
    const billing = define("billing");
    createCaller(accounts);

    forward.headers.push("x-region");

    expect(accounts.options.forward?.headers).toEqual(["x-tenant"]);
    expect(billing.options.forward?.headers).toEqual(["x-tenant", "x-region"]);
  });

  it("holds an option the API did not name as unset, so one set later fails and sends nothing", async () => {
    const api = apiWith({});
    createCaller(api);
    const options = api.options as unknown as Record<string, unknown>;

    expect(() => {
      options.forward = { headers: ["x-real-ip", "x-tenant"] };
    }).toThrow(TypeError);

    expect(await sentBy(api)).toEqual({ tenant: undefined, address: undefined });
  });

  it("names an unset option to `in` alone: its keys and its JSON are as they were", () => {
    const api = apiWith({});
    const keys = Object.keys(api.options);
    const json = JSON.stringify(api.options);

    createCaller(api);

    expect(["session", "forward", "allowedHeaders"].map((key) => key in api.options)).toEqual([
      true,
      true,
      true,
    ]);
    expect(Object.keys(api.options)).toEqual(keys);
    expect(JSON.stringify(api.options)).toBe(json);
  });
});

describe("the options a server checks", () => {
  class Forward {
    headers = ["x-tenant"];
  }
  class Session {
    cookies = ["sid"];
  }

  it.each([
    ["a forward a class made", { forward: new Forward() }, "FORWARD_OPTIONS_INVALID"],
    [
      "a forward that is a Map",
      { forward: new Map([["headers", ["x-tenant"]]]) },
      "FORWARD_OPTIONS_INVALID",
    ],
    ["a session a class made", { session: new Session() }, "SESSION_OPTIONS_INVALID"],
    [
      "a header list that is a Set",
      { allowedHeaders: new Set(["x-api-version"]) },
      "HEADER_LIST_INVALID",
    ],
  ])("refuse %s, as they are data", (_case, options, code) => {
    expect(() => createCaller(apiWith(options))).toThrow(expect.objectContaining({ code }));
  });

  it("take a Proxy over an object of data as the data it holds", () => {
    const api = apiWith({ forward: new Proxy({ headers: ["x-tenant"] }, {}) });

    createCaller(api);

    expect(api.options.forward).toEqual({ headers: ["x-tenant"] });
    expect(Object.isFrozen(api.options.forward)).toBe(true);
  });
});

describe("what each option is, which a server checks before what they mean together", () => {
  it.each([
    ["a Set", new Set(["x-api-version"]), "an instance of Set"],
    ["a string", "x-api-version", "a string"],
  ])("refuses the API's header list that is %s beside a session", (_case, list, given) => {
    const api = apiWith({ session: { cookies: ["sid"] }, allowedHeaders: list });

    expect(() => createCaller(api)).toThrow(
      expect.objectContaining({
        code: "HEADER_LIST_INVALID",
        message: `accounts: allowedHeaders is a list of header names, such as ["x-api-version"], not ${given}`,
      }),
    );
  });

  it.each([
    ["a Set", new Set(["x-total-count"]), "an instance of Set"],
    ["a string", "x-total-count", "a string"],
  ])("refuses an endpoint's header list that is %s beside a session", (_case, list, given) => {
    const api = apiWith({ session: { cookies: ["sid"] } });
    Object.assign(api.me.options, { allowedHeaders: list });

    expect(() => createCaller(api)).toThrow(
      expect.objectContaining({
        code: "HEADER_LIST_INVALID",
        message: `accounts.me: .headers() is a list of header names, such as ["x-api-version"], not ${given}`,
      }),
    );
  });
});

describe("an option a server checks", () => {
  it("is read once, so a getter that answers anew sends what the check passed", async () => {
    let reads = 0;
    const api = apiWith({
      forward: {
        get headers() {
          reads += 1;
          return reads === 1 ? ["x-tenant"] : ["x-real-ip"];
        },
      },
    });
    createCaller(api);

    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(reads).toBe(1);
    expect(api.options.forward).toEqual({ headers: ["x-tenant"] });
  });

  it("is read once, so a Proxy whose get answers anew sends what the check passed", async () => {
    let reads = 0;
    const forward = new Proxy(
      { headers: ["x-tenant"] },
      {
        get(target, key, receiver) {
          if (key !== "headers") return Reflect.get(target, key, receiver);
          reads += 1;
          return reads === 1 ? target.headers : ["x-real-ip"];
        },
      },
    );
    const api = apiWith({ forward });
    createCaller(api);

    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(reads).toBe(1);
  });

  it("has each of its properties read once, by the check and the call together", async () => {
    const reads: string[] = [];
    const api = apiWith({
      session: counted(reads, "session", { cookies: counted(reads, "cookies", ["sid"]) }),
      forward: counted(reads, "forward", { headers: counted(reads, "headers", ["x-tenant"]) }),
      allowedHeaders: counted(reads, "allowedHeaders", ["x-api-version"]),
    });
    reads.length = 0;
    createCaller(api);
    await sentBy(api);

    expect(reads.sort()).toEqual([
      "allowedHeaders.0",
      "allowedHeaders.length",
      "cookies.0",
      "cookies.length",
      "forward.headers",
      "headers.0",
      "headers.length",
      "session.cookies",
    ]);
  });

  it("sends what the check passed where a page's caller on a server makes the first call", async () => {
    let reads = 0;
    const api = apiWith({
      forward: {
        get headers() {
          reads += 1;
          return reads === 1 ? ["x-tenant"] : ["x-real-ip"];
        },
      },
    });

    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(reads).toBe(1);
  });
});

describe("options their user froze", () => {
  it.each([
    ["forward", { forward: { headers: ["x-tenant"] } }, "FORWARD_OPTIONS_INVALID"],
    ["session", { session: { cookies: ["sid"] } }, "SESSION_OPTIONS_INVALID"],
    ["allowedHeaders", { allowedHeaders: ["x-api-version"] }, "HEADER_LIST_INVALID"],
  ])("refuse %s left open to change in them, with the code of its check", (key, options, code) => {
    const api = apiWith(options);
    Object.freeze(api.options);

    expect(() => createCaller(api)).toThrow(
      expect.objectContaining({
        code,
        message: `accounts: ${key} can change in options its user froze or sealed, where a server cannot put a copy in its place: freeze ${key} to its depths too, as data, or leave the options unfrozen`,
      }),
    );
  });

  it("refuse an endpoint's header list left open to change in its frozen options", () => {
    const api = apiWith({});
    Object.freeze(api.me.options);

    expect(() => createCaller(api)).toThrow(
      expect.objectContaining({
        code: "HEADER_LIST_INVALID",
        message: expect.stringMatching(/^accounts\.me: allowedHeaders can change/),
      }),
    );
  });

  it("take an option frozen to its depths, and the call sends what was checked", async () => {
    const forward = Object.freeze({ headers: Object.freeze(["x-tenant"]) });
    const api = apiWith({ forward });
    Object.freeze(api.options);
    createCaller(api);

    expect(api.options.forward).toBe(forward);
    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
  });

  it("take a Proxy over an option frozen to its depths, which can answer nothing else", async () => {
    const frozen = Object.freeze({ headers: Object.freeze(["x-tenant"]) });
    const lying = new Proxy(frozen, {
      get: (target, key, receiver) =>
        key === "headers" ? ["x-real-ip"] : Reflect.get(target, key, receiver),
    });
    const honest = apiWith({ forward: new Proxy(frozen, {}) });
    const liar = apiWith({ forward: lying });
    Object.freeze(honest.options);
    Object.freeze(liar.options);
    createCaller(honest);

    expect(await sentBy(honest)).toEqual({ tenant: "made-up-tenant", address: undefined });
    expect(() => createCaller(liar)).toThrow(TypeError);
    expect(await sentBy(liar).catch((error: unknown) => error)).toBeInstanceOf(TypeError);
    expect(upstream.seen).toEqual([]);
  });

  it("hold options their user sealed: the copy takes each option's place", async () => {
    const forward = { headers: ["x-tenant"] };
    const api = apiWith({ forward });
    Object.seal(api.options);
    createCaller(api);
    forward.headers.push("x-real-ip");

    expect(api.options.forward).toEqual({ headers: ["x-tenant"] });
    expect(() => {
      (api.options as Record<string, unknown>).forward = { headers: ["x-real-ip"] };
    }).toThrow(TypeError);
    expect(await sentBy(api)).toEqual({ tenant: "made-up-tenant", address: undefined });
  });

  it("leave an endpoint two APIs share held as the first took it up, and taken by both", () => {
    const me = endpoint.get("me").headers(["x-total-count"]);
    const accounts = defineApi({ name: "accounts", baseURL: upstream.url, endpoints: { me } });
    const billing = defineApi({ name: "billing", baseURL: upstream.url, endpoints: { me } });
    createCaller(accounts);

    expect(() => createCaller(billing)).not.toThrow();
    expect(Object.isFrozen(billing.me.options.allowedHeaders)).toBe(true);
  });

  it("check an endpoint two APIs share beside the session of each", () => {
    const me = endpoint.get("me").headers(["cookie"]);
    const accounts = defineApi({ name: "accounts", baseURL: upstream.url, endpoints: { me } });
    const billing = defineApi({
      name: "billing",
      baseURL: upstream.url,
      session: { cookies: ["sid"] },
      endpoints: { me },
    });
    createCaller(accounts);

    expect(() => createCaller(billing)).toThrow(
      expect.objectContaining({ code: "SESSION_HEADER_CONFLICT" }),
    );
  });
});
