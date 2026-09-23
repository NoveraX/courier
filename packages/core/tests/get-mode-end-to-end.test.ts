/**
 * A GET-mode proxy call, end to end: the browser client, the handler, and the
 * request it makes upstream.
 *
 * Every variable used to arrive at the handler as a string, so a numeric
 * variable failed the endpoint's own schema — the same call over POST
 * succeeded — and a list reached the upstream as `a,b`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { createHandler } from "../src/adapter";
import { courier, defineApi, defineGroup } from "../src/define/index";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  baseURL: UPSTREAM,
  groups: {
    items: defineGroup({
      endpoints: {
        search: endpoint
          .get("search")
          .variables(z.object({ page: z.number(), tags: z.array(z.string()) }))
          .response<unknown>(),
      },
    }),
  },
});

interface Client {
  items: {
    with: (options: { method: "GET" | "POST" }) => {
      search: (variables: { page: number; tags: string[] }) => Promise<unknown>;
    };
  };
}

const upstreamUrls: string[] = [];

beforeEach(() => {
  upstreamUrls.length = 0;
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(UPSTREAM)) {
      upstreamUrls.push(url);
      return Response.json({ ok: true });
    }
    return handler.handle(new Request(new URL(url, "http://app.local"), init));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
});

describe.each(["GET", "POST"] as const)("a proxied call over %s", (method) => {
  it("passes the endpoint's schema with a number and a list", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    await expect(
      client.items.with({ method }).search({ page: 2, tags: ["a", "b"] }),
    ).resolves.toEqual({ ok: true });
  });

  it("writes the list upstream as one key per item", async () => {
    const client = createProxyCaller("api") as unknown as Client;
    await client.items.with({ method }).search({ page: 2, tags: ["a", "b"] });

    const query = new URL(upstreamUrls[0] ?? "").searchParams;
    expect(query.getAll("tags")).toEqual(["a", "b"]);
    expect(query.get("page")).toBe("2");
  });
});
