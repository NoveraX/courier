/**
 * A newer call of a read cancels the older one still in flight only where
 * one user is: a browser or an app. A server that put a DOM on its global
 * object for a library serves many. Two users' calls of the same read —
 * each made while that user's request is served, or naming it in its
 * context, or through the proxy in process — both reach the API, and so do
 * two calls of the server's caller where no request is being served: a
 * job's, a warm-up's — and two proxy calls the proxy in process answers.
 * Beside a document with no request being served, a page's caller's newer
 * call still cancels the older, as in a page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCaller as createPageCaller } from "../../src/caller";
import { courier, defineApi } from "../../src/define/index";
import { routesOf } from "../../src/define/routes-of";
import { AbortError } from "../../src/errors";
import { withIncomingRequest } from "../../src/node-request-context";
import { createProxyCaller } from "../../src/proxy-caller";
import { createCaller } from "../../src/server/create-caller";
import { _resetSourcesForTests, registerSources } from "../../src/server/sources";
import type { IncomingRequest } from "../../src/session/incoming-request";

const { endpoint } = courier();
const api = defineApi({
  expose: true,
  name: "api",
  baseURL: "https://upstream.example",
  endpoints: {
    search: endpoint.get("search").variables<{ q: string }>().response<unknown>().cancelPrevious(),
  },
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

/* One user's request, as an adapter describes it to the session. */
function served(user: string): IncomingRequest {
  return {
    key: {},
    method: "GET",
    origin: "https://app.example.com",
    headers: new Headers({ "x-user": user }),
  };
}

/* How a call ended: answered, or the code of its cancellation. */
function outcome(call: Promise<unknown>): Promise<string> {
  return call.then(
    () => "answered",
    (error: unknown) => (error instanceof AbortError ? (error.code ?? "aborted") : String(error)),
  );
}

beforeEach(() => {
  Reflect.set(globalThis, "document", { cookie: "" });
  vi.stubGlobal("fetch", slowUpstream);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a read that cancels the previous one, on a server with a DOM shim", () => {
  it("cancels no call of another user's request being served", async () => {
    const caller = createCaller(api);

    const ended = await Promise.all([
      outcome(withIncomingRequest(served("ada"), () => caller.search({ q: "a" }))),
      outcome(withIncomingRequest(served("grace"), () => caller.search({ q: "b" }))),
    ]);

    expect(ended).toEqual(["answered", "answered"]);
  });

  it("cancels no call whose context names the request it serves", async () => {
    const request = () => new Request("https://app.example.com/search");

    const ended = await Promise.all([
      outcome(createCaller(api, { context: { req: request() } }).search({ q: "a" })),
      outcome(createCaller(api, { context: { req: request() } }).search({ q: "b" })),
    ]);

    expect(ended).toEqual(["answered", "answered"]);
  });

  it("cancels no proxy call server code makes while a request is served", async () => {
    registerSources({ api });
    const proxy = createProxyCaller(routesOf(api, "api"));

    const ended = await Promise.all([
      outcome(withIncomingRequest(served("ada"), () => proxy.search({ q: "a" }))),
      outcome(withIncomingRequest(served("grace"), () => proxy.search({ q: "b" }))),
    ]);

    expect(ended).toEqual(["answered", "answered"]);
  });

  it("cancels no call of the server's caller where no request is being served", async () => {
    const caller = createCaller(api);

    const ended = await Promise.all([
      outcome(caller.search({ q: "a" })),
      outcome(caller.search.with({ cancelPrevious: true })({ q: "ab" })),
    ]);

    expect(ended).toEqual(["answered", "answered"]);
  });

  it("cancels no proxy call the proxy in process answers, where no request is being served", async () => {
    registerSources({ api });
    const proxy = createProxyCaller(routesOf(api, "api"));

    const ended = await Promise.all([
      outcome(proxy.search({ q: "a" })),
      outcome(proxy.search({ q: "ab" })),
    ]);

    expect(ended).toEqual(["answered", "answered"]);
  });

  it("still cancels a page's caller's older call where no request is being served, as in a page", async () => {
    const caller = createPageCaller(api);

    const ended = await Promise.all([
      outcome(caller.search({ q: "a" })),
      outcome(caller.search({ q: "ab" })),
    ]);

    expect(ended).toEqual(["SUPERSEDED", "answered"]);
  });
});
