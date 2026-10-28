/**
 * Which say on `cancelPrevious` a call takes: its own `.with()`, then its
 * endpoint's `.cancelPrevious()`, then the nearest of its groups, then its
 * client's option, then its API's — for a direct call and for a proxy
 * client, which reads the endpoint's and its groups' from the routes.
 *
 * A call takes part only when its say is on: a newer such call cancels the
 * older one still in flight to the same endpoint, and a call made with the
 * say off neither cancels nor is cancelled. A write is never cancelled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError } from "../src/errors";
import { createProxyCaller, type ProxyCallerOptions } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { isUpstream } from "./helpers/is-upstream";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const read = () => endpoint.get("read").variables<{ q: string }>().response<unknown>();
const write = () => endpoint.post("write").variables<{ q: string }>().response<unknown>();

const api = defineApi({
  expose: true,
  name: "api",
  baseURL: UPSTREAM,
  groups: {
    users: defineGroup({
      prefix: "users",
      cancelPrevious: true,
      endpoints: {
        search: read(),
        page: read().cancelPrevious(false),
        create: write(),
      },
      groups: {
        tags: defineGroup({
          prefix: "tags",
          cancelPrevious: false,
          endpoints: { suggest: read() },
        }),
      },
    }),
    geo: defineGroup({
      prefix: "geo",
      endpoints: { suggest: read().cancelPrevious(), countries: read() },
    }),
  },
});

/** An API that turns it on for every read it holds, but for one endpoint that says otherwise. */
const allReads = defineApi({
  expose: true,
  name: "all",
  baseURL: UPSTREAM,
  cancelPrevious: true,
  endpoints: { search: read(), page: read().cancelPrevious(false), create: write() },
});

/** An upstream that answers after a pause, or rejects when its request is cancelled. */
function slowUpstream(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = input instanceof Request ? input.signal : init?.signal;
  const url = input instanceof Request ? input.url : String(input);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(Response.json({ url })), 50);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

/** How each of two overlapping calls ended: answered, or the status it was cancelled with. */
function outcomes(first: Promise<unknown>, second: Promise<unknown>): Promise<unknown[]> {
  const ended = (call: Promise<unknown>) =>
    call.then(
      () => "answered",
      (error: unknown) => (error instanceof HTTPError ? error.status : error),
    );
  return Promise.all([ended(first), ended(second)]);
}

const CANCELLED = [499, "answered"];
const KEPT = ["answered", "answered"];

beforeEach(() => {
  registerSources({ api, all: allReads });
  /* A browser: where one user is, a newer call may cancel an older one. */
  vi.stubGlobal("document", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a direct call", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", slowUpstream);
  });

  it("takes its endpoint's .cancelPrevious()", async () => {
    const client = createCaller(api);

    const ended = await outcomes(client.geo.suggest({ q: "a" }), client.geo.suggest({ q: "ab" }));

    expect(ended).toEqual(CANCELLED);
  });

  it("takes its group's own where the endpoint says nothing", async () => {
    const client = createCaller(api);

    const ended = await outcomes(client.users.search({ q: "a" }), client.users.search({ q: "b" }));

    expect(ended).toEqual(CANCELLED);
  });

  it("takes its endpoint's false over its group's true", async () => {
    const client = createCaller(api);

    const ended = await outcomes(client.users.page({ q: "1" }), client.users.page({ q: "2" }));

    expect(ended).toEqual(KEPT);
  });

  it("takes the nearest group's own over the one above it", async () => {
    const client = createCaller(api);

    const ended = await outcomes(
      client.users.tags.suggest({ q: "a" }),
      client.users.tags.suggest({ q: "ab" }),
    );

    expect(ended).toEqual(KEPT);
  });

  it("lets every call complete where nothing says", async () => {
    const client = createCaller(api);

    const ended = await outcomes(
      client.geo.countries({ q: "a" }),
      client.geo.countries({ q: "b" }),
    );

    expect(ended).toEqual(KEPT);
  });

  it("takes its API's own where nothing nearer says", async () => {
    const client = createCaller(allReads);

    const searched = await outcomes(client.search({ q: "a" }), client.search({ q: "ab" }));
    const paged = await outcomes(client.page({ q: "1" }), client.page({ q: "2" }));

    expect(searched).toEqual(CANCELLED);
    expect(paged).toEqual(KEPT);
  });

  it("never cancels a write, whatever its group or API says", async () => {
    const grouped = createCaller(api);
    const flat = createCaller(allReads);

    const inGroup = await outcomes(
      grouped.users.create({ q: "a" }),
      grouped.users.create({ q: "b" }),
    );
    const inApi = await outcomes(flat.create({ q: "a" }), flat.create({ q: "b" }));

    expect(inGroup).toEqual(KEPT);
    expect(inApi).toEqual(KEPT);
  });

  it("takes its caller's own where the endpoint and its groups say nothing", async () => {
    const client = createCaller(api, { cancelPrevious: true });

    const countries = await outcomes(
      client.geo.countries({ q: "a" }),
      client.geo.countries({ q: "b" }),
    );
    const pages = await outcomes(client.users.page({ q: "1" }), client.users.page({ q: "2" }));

    expect(countries).toEqual(CANCELLED);
    expect(pages).toEqual(KEPT);
  });

  it("takes its caller's own over its API's", async () => {
    const client = createCaller(allReads, { cancelPrevious: false });

    const ended = await outcomes(client.search({ q: "a" }), client.search({ q: "ab" }));

    expect(ended).toEqual(KEPT);
  });

  it("takes its own .with() over everything else", async () => {
    const client = createCaller(api, { cancelPrevious: false });
    const on = client.geo.with({ cancelPrevious: true });
    const off = client.users.with({ cancelPrevious: false });

    const turnedOn = await outcomes(on.countries({ q: "a" }), on.countries({ q: "b" }));
    const turnedOff = await outcomes(off.search({ q: "a" }), off.search({ q: "b" }));

    expect(turnedOn).toEqual(CANCELLED);
    expect(turnedOff).toEqual(KEPT);
  });

  it("neither cancels nor is cancelled when made with its say off", async () => {
    const client = createCaller(api);
    const off = client.users.with({ cancelPrevious: false });

    const offFirst = await outcomes(off.search({ q: "a" }), client.users.search({ q: "b" }));
    const offSecond = await outcomes(client.users.search({ q: "a" }), off.search({ q: "b" }));

    expect(offFirst).toEqual(KEPT);
    expect(offSecond).toEqual(KEPT);
  });

  it("is cancelled by a newer call through another client of the same API", async () => {
    const one = createCaller(api);
    const another = createCaller(api);

    const ended = await outcomes(one.geo.suggest({ q: "a" }), another.geo.suggest({ q: "ab" }));

    expect(ended).toEqual(CANCELLED);
  });
});

describe("a proxy client", () => {
  beforeEach(() => {
    const handler = createHandler();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (isUpstream(url, UPSTREAM)) return slowUpstream(input, init);
      /* As real fetch does, a cancelled request rejects with its reason. */
      const signal = init?.signal;
      const answer = handler.handle(new Request(new URL(url, "http://app.localhost"), init));
      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
        answer.then(resolve, reject);
      });
    });
  });

  const clientOf = (options?: ProxyCallerOptions) =>
    createProxyCaller(routesOf(api, "api"), options);
  const flatClientOf = (options?: ProxyCallerOptions) =>
    createProxyCaller(routesOf(allReads, "all"), options);

  it("takes its endpoint's and its groups' say from the routes", async () => {
    const client = clientOf();

    const suggested = await outcomes(
      client.geo.suggest({ q: "a" }),
      client.geo.suggest({ q: "ab" }),
    );
    const searched = await outcomes(
      client.users.search({ q: "a" }),
      client.users.search({ q: "b" }),
    );
    const paged = await outcomes(client.users.page({ q: "1" }), client.users.page({ q: "2" }));
    const tagged = await outcomes(
      client.users.tags.suggest({ q: "a" }),
      client.users.tags.suggest({ q: "ab" }),
    );

    expect([suggested, searched, paged, tagged]).toEqual([CANCELLED, CANCELLED, KEPT, KEPT]);
  });

  it("takes its own option where the endpoint and its groups say nothing", async () => {
    const client = clientOf({ cancelPrevious: true });

    const countries = await outcomes(
      client.geo.countries({ q: "a" }),
      client.geo.countries({ q: "b" }),
    );
    const pages = await outcomes(client.users.page({ q: "1" }), client.users.page({ q: "2" }));
    const creates = await outcomes(
      client.users.create({ q: "a" }),
      client.users.create({ q: "b" }),
    );

    expect([countries, pages, creates]).toEqual([CANCELLED, KEPT, KEPT]);
  });

  it("takes the API's own from the routes, and its own option over it", async () => {
    const following = flatClientOf();
    const declining = flatClientOf({ cancelPrevious: false });

    const followed = await outcomes(following.search({ q: "a" }), following.search({ q: "ab" }));
    const declined = await outcomes(declining.search({ q: "a" }), declining.search({ q: "ab" }));

    expect([followed, declined]).toEqual([CANCELLED, KEPT]);
  });

  it("takes a call's own .with() over everything else", async () => {
    const client = clientOf({ cancelPrevious: false });
    const on = client.geo.with({ cancelPrevious: true });
    const off = client.users.with({ cancelPrevious: false });

    const turnedOn = await outcomes(on.countries({ q: "a" }), on.countries({ q: "b" }));
    const turnedOff = await outcomes(off.search({ q: "a" }), off.search({ q: "b" }));
    const offFirst = await outcomes(off.search({ q: "a" }), client.users.search({ q: "b" }));

    expect([turnedOn, turnedOff, offFirst]).toEqual([CANCELLED, KEPT, KEPT]);
  });

  it("is cancelled by a newer call through another client given the same routes", async () => {
    const routes = routesOf(api, "api");
    const one = createProxyCaller(routes);
    const another = createProxyCaller(routes);

    const ended = await outcomes(one.geo.suggest({ q: "a" }), another.geo.suggest({ q: "ab" }));

    expect(ended).toEqual(CANCELLED);
  });
});
