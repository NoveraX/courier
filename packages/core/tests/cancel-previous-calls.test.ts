/**
 * `cancelPrevious`, as a caller meets it: a newer call of a read it is on
 * for cancels the one still in flight, whatever its variables — a search
 * as the user types — while every other endpoint's calls all complete, page
 * one and page two of a list together among them.
 *
 * The calls of a client share one in-flight table; a fresh one per call
 * would cancel nothing. Where the option runs: a browser, for a direct call
 * and for a proxy client. Where it must not: a server, where requests from
 * different users reach one endpoint and would cancel each other — whether
 * they come to its proxy or a proxy client there makes them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError } from "../src/errors";
import { defineMiddleware } from "../src/middleware/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { isUpstream } from "./helpers/is-upstream";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  endpoints: {
    search: endpoint.get("search").variables<{ q: string }>().response<unknown>().cancelPrevious(),
    page: endpoint.get("items").variables<{ page: number }>().response<unknown>(),
  },
});

interface Client {
  search: (variables: { q: string }) => Promise<unknown>;
  page: (variables: { page: number }) => Promise<unknown>;
}

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

function status(error: unknown): number | undefined {
  return error instanceof HTTPError ? error.status : undefined;
}

beforeEach(() => {
  registerSources({ api });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a direct call in a browser", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {});
    vi.stubGlobal("fetch", slowUpstream);
  });

  it("cancels the call still in flight with a 499", async () => {
    const client = createCaller(api) as unknown as Client;
    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
  });

  it("answers an identical newer call from the request the cancelled one made", async () => {
    const sent = vi.fn(slowUpstream);
    vi.stubGlobal("fetch", sent);
    const client = createCaller(api) as unknown as Client;
    const first = client.search({ q: "ab" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("lets every call to an endpoint it does not name complete, page one and page two together", async () => {
    const client = createCaller(api) as unknown as Client;

    const pages = await Promise.all([client.page({ page: 1 }), client.page({ page: 2 })]);

    expect(pages).toEqual([
      { url: `${UPSTREAM}/items?page=1` },
      { url: `${UPSTREAM}/items?page=2` },
    ]);
  });

  it("keeps cancelling after a cancelled call settles", async () => {
    const client = createCaller(api) as unknown as Client;
    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" }).catch(status);
    await first;
    const third = client.search({ q: "abc" });

    expect(await second).toBe(499);
    await expect(third).resolves.toEqual({ url: `${UPSTREAM}/search?q=abc` });
  });
});

/**
 * A call holds its endpoint from the moment it starts, not from the moment
 * it sends: an older call still getting ready to send when a newer one
 * starts is cancelled then, and never sends, so it cannot cancel the newer
 * call by sending after it.
 */
describe("a direct call slow to send", () => {
  /** A client whose first calls wait at a gate before they send, until the test opens each. */
  function gatedClient(gated: number) {
    const gates: Array<() => void> = [];
    const opened = Array.from(
      { length: gated },
      () => new Promise<void>((open) => gates.push(open)),
    );
    let calls = 0;
    const gate = defineMiddleware("gate", "wrap", async (_ctx, next) => {
      const waits = opened[calls++];
      if (waits) await waits;
      return next();
    });
    const client = createCaller(
      defineApi({
        baseURL: UPSTREAM,
        middleware: [gate],
        endpoints: {
          search: endpoint
            .get("search")
            .variables<{ q: string }>()
            .response<unknown>()
            .cancelPrevious(),
        },
      }),
    ) as unknown as Client;
    return { client, open: (index: number) => gates[index]?.() };
  }

  beforeEach(() => {
    vi.stubGlobal("document", {});
  });

  it("is cancelled by a newer call that sends first, and never sends", async () => {
    let sentNewer: () => void = () => {};
    const newerSent = new Promise<void>((resolve) => {
      sentNewer = resolve;
    });
    const sent = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("q=ab")) sentNewer();
      return slowUpstream(input, init);
    });
    vi.stubGlobal("fetch", sent);
    const { client, open } = gatedClient(1);

    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });
    await newerSent;
    open(0);

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it("is cancelled with every call between it and the newest, once the newest sends", async () => {
    vi.stubGlobal("fetch", slowUpstream);
    const { client, open } = gatedClient(2);

    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" }).catch(status);
    const third = client.search({ q: "abc" });
    open(0);
    open(1);

    expect([await first, await second]).toEqual([499, 499]);
    await expect(third).resolves.toEqual({ url: `${UPSTREAM}/search?q=abc` });
  });
});

describe("a call on a server", () => {
  it("never cancels another caller's request when made directly", async () => {
    vi.stubGlobal("fetch", slowUpstream);
    const client = createCaller(api) as unknown as Client;

    const answers = await Promise.all([client.search({ q: "a" }), client.search({ q: "b" })]);

    expect(answers).toHaveLength(2);
  });

  it("never cancels another caller's request when a proxy client makes it", async () => {
    const handler = createHandler();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (isUpstream(url, UPSTREAM)) return slowUpstream(input, init);
      return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
    });
    const client = createProxyCaller(routesOf(api, "api"), {
      cancelPrevious: true,
    }) as unknown as Client;

    const answers = await Promise.all([client.search({ q: "a" }), client.search({ q: "b" })]);

    expect(answers).toEqual([{ url: `${UPSTREAM}/search?q=a` }, { url: `${UPSTREAM}/search?q=b` }]);
  });
});

describe("the proxy", () => {
  beforeEach(() => {
    /* The proxy client as a browser runs it; a server's own reaches its proxy in process. */
    vi.stubGlobal("document", {});
    const handler = createHandler();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (isUpstream(url, UPSTREAM)) return slowUpstream(input, init);
        /* As real fetch does, a cancelled request rejects with its reason. */
        const signal = init?.signal;
        const answer = handler.handle(new Request(new URL(url, "http://app.localhost"), init));
        return new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason));
          answer.then(resolve, reject);
        });
      }),
    );
  });

  it("does not let one browser's request cancel another's on the server", async () => {
    const handler = createHandler();
    const call = (q: string) =>
      handler.handleGet(
        new Request(
          `http://app.localhost/api/request?_s=api&_m=search&_v=${encodeURIComponent(JSON.stringify({ q }))}`,
        ),
      );

    const [a, b] = await Promise.all([call("a"), call("b")]);

    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it("answers the browser client's identical newer call from the request already made", async () => {
    const proxied = vi.mocked(fetch);
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;
    const first = client.search({ q: "ab" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
    expect(proxied.mock.calls.filter(([input]) => !isUpstream(input, UPSTREAM))).toHaveLength(1);
  });

  it("cancels in the browser client, which takes the endpoint's say from its routes", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;
    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
  });
});
