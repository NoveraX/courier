/**
 * @vitest-environment jsdom
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

type Page = { items: string[]; nextCursor: number | null };

let server: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCaller() {
  const posts = defineGroup({
    prefix: "posts",
    endpoints: {
      list: endpoint.get("").variables<{ cursor: number; tag?: string }>().response<Page>(),
      recent: endpoint.get("recent").variables<{ cursor: number }>().response<Page>(),
    },
  });
  const api = defineApi({ name: "api", baseURL: server.origin, groups: { posts } });
  return createQueryCaller(api);
}

beforeEach(async () => {
  server = await startTestServer((_req, res, url) => {
    const cursor = Number(url.searchParams.get("cursor"));
    const tag = url.searchParams.get("tag") ?? "none";
    sendJson(res, {
      items: [0, 1, 2].map((i) => `${tag}-post-${cursor * 3 + i}`),
      nextCursor: cursor < 2 ? cursor + 1 : null,
    });
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("useInfiniteQuery", () => {
  it("refetches from the first page when its variables change", async () => {
    const q = makeCaller();
    let tag = "a";
    const { result, rerender } = renderHook(
      () =>
        q.posts.useInfiniteQuery("list", {
          variables: (cursor) => ({ cursor, tag }),
          initialPageParam: 0,
          getNextPageParam: (page) => page.nextCursor,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.pages[0]?.items[0]).toBe("a-post-0"));

    tag = "b";
    rerender();

    await waitFor(() => expect(result.current.data?.pages[0]?.items[0]).toBe("b-post-0"));
    expect(server.requests.map((r) => r.query.get("tag"))).toEqual(["a", "b"]);
  });

  it("keeps a separate cache entry for each set of variables", async () => {
    const q = makeCaller();
    const feed = (tag: string) => () =>
      q.posts.useInfiniteQuery("list", {
        variables: (cursor) => ({ cursor, tag }),
        initialPageParam: 0,
        getNextPageParam: (page) => page.nextCursor,
      });

    const first = renderHook(feed("a"), { wrapper });
    const second = renderHook(feed("b"), { wrapper });

    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(first.result.current.data?.pages[0]?.items[0]).toBe("a-post-0");
    expect(second.result.current.data?.pages[0]?.items[0]).toBe("b-post-0");
    expect(server.requests).toHaveLength(2);
  });

  it("sends each page's parameter and appends the next page", async () => {
    const q = makeCaller();
    const { result } = renderHook(
      () =>
        q.posts.useInfiniteQuery("recent", {
          variables: (cursor) => ({ cursor }),
          initialPageParam: 0,
          getNextPageParam: (page) => page.nextCursor,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));

    const next = await result.current.fetchNextPage();

    expect(next.data?.pages.map((page) => page.items[0])).toEqual(["none-post-0", "none-post-3"]);
    expect(server.requests.map((r) => r.query.get("cursor"))).toEqual(["0", "1"]);
  });

  it("does not share its cache with a useQuery of the same variables", async () => {
    const q = makeCaller();
    const plain = renderHook(
      () => q.posts.useQuery("list", { variables: { cursor: 0, tag: "a" } }),
      { wrapper },
    );
    await waitFor(() => expect(plain.result.current.isSuccess).toBe(true));

    const infinite = renderHook(
      () =>
        q.posts.useInfiniteQuery("list", {
          variables: (cursor) => ({ cursor, tag: "a" }),
          initialPageParam: 0,
          getNextPageParam: (page) => page.nextCursor,
        }),
      { wrapper },
    );

    await waitFor(() => expect(infinite.result.current.isSuccess).toBe(true));
    expect(infinite.result.current.data?.pages[0]?.items[0]).toBe("a-post-0");
    expect(plain.result.current.data?.items[0]).toBe("a-post-0");
  });

  it("is matched by its method's key prefix for invalidation", async () => {
    const q = makeCaller();
    const { result } = renderHook(
      () =>
        q.posts.useInfiniteQuery("list", {
          variables: (cursor) => ({ cursor, tag: "a" }),
          initialPageParam: 0,
          getNextPageParam: (page) => page.nextCursor,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: ["api", "posts", "list"] });

    await waitFor(() => expect(server.requests).toHaveLength(2));
  });
});
