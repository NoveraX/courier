/**
 * `.with()` options on a proxy call.
 *
 * The server accepts four options and answers any other with a 400, so the
 * proxy client sends it only those: a per-call token in `headers` goes to
 * the proxy, which forwards what it allows, and the `cache` and `next` a
 * Next.js page sets apply to the browser's own request — in the browser as
 * through `createCaller`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "../src/adapter";
import { courier, defineApi } from "../src/define/index";
import { ConfigurationError } from "../src/errors";
import { createProxyCaller } from "../src/proxy-caller";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { endpoint } = courier();
const UPSTREAM = "https://upstream.example";

const api = defineApi({
  baseURL: UPSTREAM,
  allowedHeaders: ["x-trace"],
  endpoints: { list: endpoint.get("list").response<unknown>() },
});

type Call = () => Promise<unknown>;
interface Client {
  list: Call & { with: (options: Record<string, unknown>) => Call };
}

const browserRequests: RequestInit[] = [];
const upstreamHeaders: Headers[] = [];

beforeEach(() => {
  /* The proxy client as a browser runs it; a server's own reaches its proxy in process. */
  vi.stubGlobal("document", {});
  registerSources({ api });
  const handler = createHandler();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(UPSTREAM)) {
      upstreamHeaders.push(new Headers(init?.headers));
      return Response.json({ ok: true });
    }
    browserRequests.push(init ?? {});
    return handler.handle(new Request(new URL(url, "http://app.local"), init));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  _resetSourcesForTests();
  browserRequests.length = 0;
  upstreamHeaders.length = 0;
});

describe("a proxy call's options", () => {
  it("carry a per-call header to the proxy, which forwards what it allows", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    await expect(client.list.with({ headers: { "x-trace": "abc" } })()).resolves.toEqual({
      ok: true,
    });
    expect(upstreamHeaders[0]?.get("x-trace")).toBe("abc");
  });

  it("apply Next.js cache options to the browser's own request", async () => {
    const client = createProxyCaller("api") as unknown as Client;
    const options = { method: "GET", next: { revalidate: 60 }, cache: "force-cache" };

    await expect(client.list.with(options)()).resolves.toEqual({ ok: true });
    expect(browserRequests[0]).toMatchObject({ cache: "force-cache", next: { revalidate: 60 } });
  });

  it("apply credentials and redirect to the browser's own request", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    await client.list.with({ credentials: "omit", redirect: "error" })();

    expect(browserRequests[0]).toMatchObject({ credentials: "omit", redirect: "error" });
  });

  it("refuse prefixUrl before sending anything", async () => {
    const client = createProxyCaller("api") as unknown as Client;

    const error = await client.list
      .with({ prefixUrl: "https://elsewhere.example" })()
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as ConfigurationError).code).toBe("PROXY_OPTION_NOT_ALLOWED");
    expect(browserRequests).toHaveLength(0);
  });
});
