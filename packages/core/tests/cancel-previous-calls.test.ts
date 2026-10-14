/**
 * `cancelPrevious`, as a caller meets it: a newer call to an endpoint it
 * names cancels the one still in flight, whatever its variables — a search
 * as the user types — while every other endpoint's calls all complete, page
 * one and page two of a list together among them.
 *
 * The calls of a client share one in-flight table; a fresh one per call
 * would cancel nothing. Where the option runs: a browser, for a direct call
 * and for a proxy client. Where it must not: a server, where requests from
 * different users reach one endpoint and would cancel each other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { routesOf } from "../src/define/routes-of";
import { HTTPError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  cancelPrevious: ["search"],
  endpoints: {
    search: endpoint.get("search").variables<{ q: string }>().response<unknown>(),
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

describe("a direct call on a server", () => {
  it("never cancels another caller's request", async () => {
    vi.stubGlobal("fetch", slowUpstream);
    const client = createCaller(api) as unknown as Client;

    const answers = await Promise.all([client.search({ q: "a" }), client.search({ q: "b" })]);

    expect(answers).toHaveLength(2);
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
        if (url.startsWith(UPSTREAM)) return slowUpstream(input, init);
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
    expect(
      proxied.mock.calls.filter(([input]) => !String(input).startsWith(UPSTREAM)),
    ).toHaveLength(1);
  });

  it("cancels in the browser client, which takes the source's list", async () => {
    const client = createProxyCaller(routesOf(api, "api")) as unknown as Client;
    const first = client.search({ q: "a" }).catch(status);
    const second = client.search({ q: "ab" });

    expect(await first).toBe(499);
    await expect(second).resolves.toEqual({ url: `${UPSTREAM}/search?q=ab` });
  });
});
