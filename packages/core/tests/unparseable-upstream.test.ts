/**
 * An upstream answer the proxy cannot parse fails the call, as it does in
 * direct mode: the browser does not see the 200 it came with, a success
 * carrying `{ success: false }` where the endpoint's data should be.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";
let upstreamAnswer: () => Response;

const api = defineApi({
  expose: true,
  baseURL: UPSTREAM,
  groups: {
    items: defineGroup({
      endpoints: {
        list: endpoint.get("list").response<unknown>(),
        typed: endpoint.get("typed").response(z.object({ id: z.number() })),
      },
    }),
  },
});

beforeEach(() => {
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(UPSTREAM)) return upstreamAnswer();
    return handler.handle(new Request(new URL(url, "http://app.localhost"), init));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("an upstream body that will not parse", () => {
  it("reaches the browser as a failure, not as a 200 carrying { success: false }", async () => {
    upstreamAnswer = () =>
      new Response("<html>hi</html>", { headers: { "content-type": "text/html" } });

    const response = await createHandler().handleGet(
      new Request("http://app.localhost/api/request?_s=api&_g=items&_m=list"),
    );

    expect(response.status).toBe(502);
  });
});
