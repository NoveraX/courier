/**
 * `stream: true` on an endpoint with a response schema. The schema was run on
 * the unread stream, so every valid answer failed with a 422 that blamed the
 * upstream's payload.
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
    return handler.handle(new Request(new URL(url, "http://app.local"), init));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe("a streamed answer from an endpoint with a response schema", () => {
  it("passes through; the schema describes the value, not the bytes", async () => {
    upstreamAnswer = () => Response.json({ id: 1 });
    const options = encodeURIComponent(JSON.stringify({ stream: true }));

    const response = await createHandler().handleGet(
      new Request(`http://app.local/api/request?_s=api&_g=items&_m=typed&_o=${options}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 1 });
  });
});
