/**
 * A successful answer whose data is `undefined`.
 *
 * A response parser or an after-middleware may well produce `undefined` for
 * a success, and the call resolves to it — never taken for a failure and
 * thrown as "Unknown error", an HTTPError 500 once wrapped, for a plain call
 * or for `.raw`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { createCaller } from "../src/caller";
import { courier, defineApi } from "../src/define/index";
import { defineMiddleware } from "../src/middleware";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";
import { startUpstream, type Upstream } from "./helpers/upstream";

const { endpoint } = courier();
const realFetch = globalThis.fetch;
let upstream: Upstream;

beforeEach(async () => {
  upstream = await startUpstream((_request, res) => res.end('{"ignored":true}'));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  await upstream.close();
});

function parsedToNothing() {
  return defineApi({
    expose: true,
    name: "nothing",
    baseURL: upstream.url,
    responseParser: async () => undefined,
    endpoints: { ping: endpoint.get("ping") },
  });
}

describe("a success whose data is undefined", () => {
  it("resolves to undefined", async () => {
    await expect(createCaller(parsedToNothing()).ping()).resolves.toBeUndefined();
  });

  it("resolves with .raw to its status and headers", async () => {
    const response = await createCaller(parsedToNothing()).raw.ping();

    expect(response.status).toBe(200);
    expect(response.data).toBeUndefined();
  });

  it("resolves when an after-middleware leaves no data", async () => {
    const client = createCaller(
      defineApi({
        expose: true,
        name: "cleared",
        baseURL: upstream.url,
        middleware: [
          defineMiddleware("clear", "after", (_ctx, response) => ({
            ...response,
            data: undefined,
          })),
        ],
        endpoints: { ping: endpoint.get("ping") },
      }),
    );

    await expect(client.ping()).resolves.toBeUndefined();
  });

  it("resolves through the proxy to null, JSON's nothing", async () => {
    const source = parsedToNothing();
    registerSources({ nothing: source });
    const handler = createHandler();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith(upstream.url)) return realFetch(input, init);
      return handler.handle(new Request(new URL(url, "http://app.local"), init));
    });

    await expect(
      createProxyCaller<typeof source>("nothing", { source }).ping(),
    ).resolves.toBeNull();
  });
});
