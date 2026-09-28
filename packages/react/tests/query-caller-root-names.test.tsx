/**
 * @vitest-environment jsdom
 */

/**
 * Groups named like the hooks the runtime reads — `then`, `toJSON`,
 * `valueOf` — at the root of a query client.
 *
 * The query clients answered those names as absent before looking at the
 * source, so a group of that name, which the types offered and a generator
 * emits from an ordinary tag, had no hooks at all. Core's client reaches
 * such a group while staying something `await` does not take for a promise.
 */
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { courier, defineApi, defineBoundary, defineGroup } from "@noverax/courier/define";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { createQueryCaller } from "../src/create-query-caller";
import { type CourierServer, startCourierServer } from "./helpers/courier-server";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

let upstream: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function namesApi() {
  const list = () => endpoint.get("").response<{ path: string }>();
  return defineApi({
    name: "names",
    baseURL: upstream.origin,
    groups: {
      then: defineGroup({ prefix: "then-group", endpoints: { list: list() } }),
      toJSON: defineGroup({ prefix: "to-json-group", endpoints: { list: list() } }),
      valueOf: defineGroup({ prefix: "value-group", endpoints: { list: list() } }),
    },
  });
}

beforeEach(async () => {
  upstream = await startTestServer((_request, response, url) =>
    sendJson(response, { path: url.pathname }),
  );
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
  queryClient.clear();
  await upstream.close();
});

describe("a direct query client", () => {
  it.each([
    ["then", "/then-group"],
    ["toJSON", "/to-json-group"],
    ["valueOf", "/value-group"],
  ] as const)("reaches a group named %s", async (name, path) => {
    const q = createQueryCaller(namesApi());

    const { result } = renderHook(() => q[name].useQuery("list"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ path }));
  });

  it("is not taken for a promise with a group named then", async () => {
    const q = createQueryCaller(namesApi());

    expect(await Promise.resolve(q)).toBe(q);
  });

  it("lists its groups, as core's client does", () => {
    const q = createQueryCaller(namesApi());

    expect(Object.keys(q)).toEqual(["then", "toJSON", "valueOf"]);
  });
});

describe("a proxy query client given a boundary", () => {
  let server: CourierServer;

  beforeEach(async () => {
    server = await startCourierServer({ names: namesApi() });
  });

  afterEach(async () => {
    await server.close();
  });

  function proxyCaller() {
    const api = namesApi();
    const boundary = defineBoundary({
      source: "names",
      expose: { "then.list": "query", "toJSON.list": "query", "valueOf.list": "query" },
    });
    return createProxyQueryCaller<typeof api>("names", { boundary, proxyPath: server.proxyPath });
  }

  it("reaches a group named then, and is still not a promise", async () => {
    const q = proxyCaller();

    const { result } = renderHook(() => q.then.useQuery("list"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ path: "/then-group" }));
    expect(await Promise.resolve(q)).toBe(q);
  });

  it("reaches a group named valueOf", async () => {
    const q = proxyCaller();

    const { result } = renderHook(() => q.valueOf.useQuery("list"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ path: "/value-group" }));
  });
});

describe("a query client without those names in its source", () => {
  it("is not taken for a promise", async () => {
    const q = createQueryCaller(
      defineApi({
        name: "plain",
        baseURL: "https://api.example.com",
        groups: { users: defineGroup({ prefix: "users", endpoints: { list: endpoint.get("") } }) },
      }),
    );

    expect(await Promise.resolve(q)).toBe(q);
  });

  it("answers those names as absent when it knows only a source name", async () => {
    const q = createProxyQueryCaller<ReturnType<typeof namesApi>>("names");

    expect(await Promise.resolve(q)).toBe(q);
    expect(JSON.stringify({ q })).toBe('{"q":{}}');
  });
});
