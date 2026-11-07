/**
 * A server is no page, nor a React Native app, for what `Object.prototype`
 * holds. The names a page's or an app's platform defines — `window`,
 * `document`, `location`, `navigator.product` — are read as the platform's
 * own, and a name the server's platform does not define is none, whatever
 * code elsewhere in the process gave `Object.prototype`. A server's call
 * keeps a redirect to its origin and carries its forwarded headers nowhere
 * else; a call `/client` makes on a server stays many users' — no newer call
 * of one user cancels another's, and no page's or app's token goes with it;
 * a proxy caller on a server resolves no address of a page's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../../src/adapter";
import { createCaller as createPageCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define";
import { routesOf } from "../../src/define/routes-of";
import { withIncomingRequest } from "../../src/node-request-context";
import { createProxyCaller } from "../../src/proxy-caller";
import { createCaller } from "../../src/server/create-caller";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";
import { asBrowserPage } from "../helpers/browser-page";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";
const ELSEWHERE = "https://elsewhere.example";
const APP = "https://app.example.com";

function accountsApi() {
  return defineApi({
    name: "accounts",
    baseURL: UPSTREAM,
    session: { cookies: ["sid"], csrf: { cookie: "csrf", header: "x-csrf" } },
    forward: { headers: ["x-tenant"] },
    endpoints: {
      moved: endpoint.get("moved").expose(),
      search: endpoint.get("search").variables<{ q: string }>().cancelPrevious().expose(),
      rename: endpoint.post("me/name").variables<{ name: string }>().expose(),
    },
  });
}

type Client = Record<string, (variables?: unknown) => Promise<unknown>>;

/** A request the upstream, or the origin a redirect names, was sent. */
interface Sent {
  url: string;
  headers: Record<string, string>;
}

/**
 * The network: the upstream moves `moved` to another origin, answers a
 * search after a pause and a search or a write at once, and sets the token
 * a page's session reads. A redirect a request does not follow by hand
 * goes where it points, as the platform's `fetch` takes it.
 */
function network(sent: Sent[]): void {
  const answer = (url: string, init: RequestInit | undefined): Promise<Response> => {
    sent.push({ url, headers: Object.fromEntries(new Headers(init?.headers)) });
    if (url.startsWith(`${UPSTREAM}/moved`)) {
      const moved = new Response(null, {
        status: 302,
        statusText: "",
        headers: { location: `${ELSEWHERE}/landed` },
      });
      return init?.redirect === "manual"
        ? Promise.resolve(moved)
        : answer(`${ELSEWHERE}/landed`, init);
    }
    const headers = new Headers({ "content-type": "application/json" });
    headers.append("set-cookie", "csrf=made-up-token-of-user-a; Path=/; Secure");
    const body = JSON.stringify({ url });
    if (!url.includes("/search?q=a")) {
      return Promise.resolve(new Response(body, { status: 200, statusText: "", headers }));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(new Response(body, { status: 200, statusText: "", headers })),
        50,
      );
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(init.signal?.reason);
      });
    });
  };
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    answer(input instanceof Request ? input.url : String(input), init),
  );
}

/* A browser's request a server serves, with the session it carries and what `forward` takes. */
const served = (): IncomingRequest => ({
  key: {},
  method: "GET",
  origin: APP,
  headers: new Headers({
    cookie: "sid=made-up-session",
    "x-tenant": "made-up-tenant",
    "sec-fetch-site": "same-origin",
  }),
});

/* How a call ended, as a comparison reads it. */
async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    return `answered ${JSON.stringify(await call())}`;
  } catch (error) {
    const named = error as { name?: unknown; code?: unknown; status?: unknown };
    return `failed ${String(named.name)} ${String(named.code)} ${String(named.status)}`;
  }
}

/* `Object.prototype` given each of `keys` for as long as `run` takes, as code elsewhere may. */
async function withPrototypeKeys<T>(
  keys: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  for (const [key, value] of Object.entries(keys)) {
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
  try {
    return await run();
  } finally {
    for (const key of Object.keys(keys)) Reflect.deleteProperty(Object.prototype, key);
  }
}

/* What a call did, made once as it is and once while Object.prototype holds `keys`. */
async function both(
  keys: Record<string, unknown>,
  call: () => Promise<string>,
): Promise<{
  clean: { sent: Sent[]; outcome: string };
  polluted: { sent: Sent[]; outcome: string };
}> {
  const run = async () => {
    const sent: Sent[] = [];
    network(sent);
    return { outcome: await call(), sent };
  };
  const clean = await run();
  const polluted = await withPrototypeKeys(keys, run);
  return { clean, polluted };
}

/* A browser's request of the proxy for `call`, as the proxy caller makes it. */
async function proxyRequestOf(api: ReturnType<typeof accountsApi>, call: string): Promise<Request> {
  let captured: Request | undefined;
  asBrowserPage();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    captured = new Request(new URL(url, APP), init);
    return Response.json({ ok: true });
  });
  await (createProxyCaller(routesOf(api, "accounts")) as unknown as Client)[call]?.();
  vi.unstubAllGlobals();
  if (captured === undefined) throw new Error(`the proxy caller sent nothing for ${call}`);
  const headers = new Headers(captured.headers);
  headers.set("origin", APP);
  headers.set("sec-fetch-site", "same-origin");
  headers.set("x-tenant", "made-up-tenant");
  return new Request(captured, { headers });
}

const PAGE = { window: {}, document: {} };
const elsewhere = (sent: Sent[]) => sent.filter(({ url }) => url.startsWith(ELSEWHERE));

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  expect(["window", "document", "location", "product"].filter((key) => key in {})).toEqual([]);
});

describe("a server, while Object.prototype holds the names a page's platform defines", () => {
  it("keeps its caller's redirect to the upstream's origin", async () => {
    const caller = createCaller(accountsApi()) as unknown as Client;
    const { clean, polluted } = await both(PAGE, () =>
      outcome(() => withIncomingRequest(served(), () => caller.moved?.() ?? Promise.resolve())),
    );

    expect(elsewhere(clean.sent)).toEqual([]);
    expect(elsewhere(polluted.sent)).toEqual([]);
    expect(polluted.outcome).toBe(clean.outcome);
  });

  it("keeps the proxy's redirect to the upstream's origin", async () => {
    const api = accountsApi();
    const request = await proxyRequestOf(api, "moved");
    registerSources({ accounts: api });
    const handler = createHandler();
    const { clean, polluted } = await both(PAGE, async () => {
      const answer = await handler.handle(request.clone());
      return `${answer.status} ${await answer.text()}`;
    });

    expect(elsewhere(clean.sent)).toEqual([]);
    expect(elsewhere(polluted.sent)).toEqual([]);
    expect(polluted.outcome).toBe(clean.outcome);
  });

  it("lets one user's call through /client cancel no other user's", async () => {
    const api = accountsApi();
    createCaller(api);
    const client = createPageCaller(api) as unknown as Client;
    const { clean, polluted } = await both({ document: {} }, async () => {
      const first = outcome(() => client.search?.({ q: "a" }) ?? Promise.resolve());
      await new Promise((resolve) => setTimeout(resolve, 10));
      const second = outcome(() => client.search?.({ q: "b" }) ?? Promise.resolve());
      return `${await first} then ${await second}`;
    });

    expect(clean.outcome).toMatch(/^answered .* then answered /);
    expect(polluted.outcome).toBe(clean.outcome);
  });

  it("sends a write through /client with no page's token", async () => {
    const api = accountsApi();
    createCaller(api);
    const client = createPageCaller(api) as unknown as Client;
    const { clean, polluted } = await both({ document: { cookie: "csrf=made-up-token" } }, () =>
      outcome(() => client.rename?.({ name: "b" }) ?? Promise.resolve()),
    );

    expect(clean.sent.map(({ headers }) => headers["x-csrf"])).toEqual([undefined]);
    expect(polluted.sent).toEqual(clean.sent);
    expect(polluted.outcome).toBe(clean.outcome);
  });

  it("sends a write through /client with no token another user's read was answered with", async () => {
    const api = accountsApi();
    createCaller(api);
    const client = createPageCaller(api) as unknown as Client;
    const { clean, polluted } = await both({ product: "ReactNative" }, async () => {
      const read = await outcome(() => client.search?.({ q: "c" }) ?? Promise.resolve());
      return `${read} then ${await outcome(() => client.rename?.({ name: "b" }) ?? Promise.resolve())}`;
    });

    expect(clean.sent.map(({ headers }) => headers["x-csrf"])).toEqual([undefined, undefined]);
    expect(polluted.sent).toEqual(clean.sent);
    expect(polluted.outcome).toBe(clean.outcome);
  });
});

describe("a server with no address of a page's, while Object.prototype holds one", () => {
  /* A page's address, as a page's platform gives it. */
  const location = {
    href: "https://evil.example/page",
    origin: "https://evil.example",
    protocol: "https:",
    host: "evil.example",
  };
  /* The suite's setup gives every test an address; a server has none of its own. */
  const kept: unknown = Reflect.get(globalThis, "location");
  beforeEach(() => {
    Reflect.deleteProperty(globalThis, "location");
  });
  afterEach(() => {
    Reflect.set(globalThis, "location", kept);
  });

  it("resolves a proxy caller's path against no page's address", async () => {
    const client = createProxyCaller(routesOf(accountsApi(), "accounts"), {
      proxyPath: { http: "/api/request" },
    }) as unknown as Client;
    const { clean, polluted } = await both({ location }, () =>
      outcome(() => client.search?.({ q: "d" }) ?? Promise.resolve()),
    );

    expect(polluted.sent.filter(({ url }) => url.startsWith(location.origin))).toEqual([]);
    expect(polluted.sent).toEqual(clean.sent);
    expect(polluted.outcome).toBe(clean.outcome);
  });

  it("refuses a path for an API's address, as there is no page's to resolve it against", async () => {
    const api = defineApi({
      name: "relative",
      baseURL: "/api",
      endpoints: { me: endpoint.get("me") },
    });
    const caller = createCaller(api) as unknown as Client;
    const { clean, polluted } = await both({ location }, () =>
      outcome(() => withIncomingRequest(served(), () => caller.me?.() ?? Promise.resolve())),
    );

    expect(clean.outcome).toMatch(/URL_NOT_ABSOLUTE/);
    expect(polluted.sent).toEqual([]);
    expect(polluted.outcome).toBe(clean.outcome);
  });
});
