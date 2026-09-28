/**
 * What a failed call rejects with.
 *
 * Everything that went wrong around fetch was reported as a network
 * failure. A timeout was an HTTPError of status 0 saying "Network request
 * failed", with the DOMException's legacy code "23"; through the proxy it
 * was a 502 saying the upstream could not be reached. A caller's own
 * cancellation reason was replaced unless it was an AbortError, and the
 * caller's own mistakes — a middleware that threw, a BigInt in the body —
 * came back dressed as HTTP failures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { HTTPError } from "../src/errors";
import { defineMiddleware } from "../src/middleware";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => {
    setTimeout(() => res.end("{}"), 400);
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function api(baseURL = upstream.url) {
  return defineApi({
    name: "calls",
    baseURL,
    endpoints: {
      slow: endpoint.get("slow"),
      brief: endpoint.get("brief").timeout(100),
      send: endpoint.post("send").variables<{ amount: unknown }>(),
    },
  });
}

async function rejection(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => "resolved",
    (error: unknown) => error,
  );
}

describe("a timeout on a direct call", () => {
  it("is an HTTPError that says it timed out", async () => {
    const error = await rejection(createCaller(api()).slow.with({ timeout: 100 })());

    expect(error).toBeInstanceOf(HTTPError);
    expect(error).toMatchObject({ status: 0, message: "Request timed out" });
    expect((error as HTTPError).data).toMatchObject({ code: "TIMEOUT" });
    expect(((error as HTTPError).cause as Error).name).toBe("TimeoutError");
  });
});

describe("a host that cannot be reached", () => {
  it("is still a network failure with the system's code", async () => {
    const closed = await startUpstream(() => undefined);
    await closed.close();

    const error = await rejection(createCaller(api(closed.url)).slow());

    expect(error).toMatchObject({ status: 0, message: "Network request failed" });
    expect((error as HTTPError).data).toMatchObject({ code: "ECONNREFUSED" });
  });
});

describe("a call the caller cancels", () => {
  it.each([
    ["an Error", new Error("user navigated away")],
    ["a string", "cancelled-by-user"],
  ])("rejects with the reason it gave, when that is %s", async (_kind, reason) => {
    const controller = new AbortController();
    const pending = rejection(createCaller(api()).slow.with({ signal: controller.signal })());
    setTimeout(() => controller.abort(reason), 50);

    expect(await pending).toBe(reason);
  });
});

describe("a failure in the caller's own code", () => {
  it("rejects with what a middleware threw", async () => {
    const thrown = new Error("middleware failed");
    const client = createCaller(
      defineApi({
        name: "mw",
        baseURL: upstream.url,
        middleware: [
          defineMiddleware("boom", "before", () => {
            throw thrown;
          }),
        ],
        endpoints: { slow: endpoint.get("slow") },
      }),
    );

    expect(await rejection(client.slow())).toBe(thrown);
  });

  it("rejects with the serializer's TypeError, not as a network failure", async () => {
    const error = await rejection(createCaller(api()).send({ amount: 10n }));

    expect(error).toBeInstanceOf(TypeError);
    expect(upstream.received).toEqual([]);
  });
});

describe("a timeout through the proxy", () => {
  it("answers 504 with a code that says so", async () => {
    const source = api();
    registerSources({ calls: source });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });

    const error = await rejection(createProxyCaller<typeof source>("calls", { source }).brief());

    expect(error).toMatchObject({ status: 504 });
    expect((error as HTTPError).data).toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });
});
