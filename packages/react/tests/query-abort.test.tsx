/**
 * @vitest-environment jsdom
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

let server: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCaller() {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      slow: endpoint.get("slow").response<{ ok: boolean }>(),
      pages: endpoint.get("pages").variables<{ page: number }>().response<{ ok: boolean }>(),
    },
  });
  return createQueryCaller(defineApi({ name: "api", baseURL: server.origin, groups: { users } }));
}

beforeEach(async () => {
  server = await startTestServer((_req, res) => {
    const timer = setTimeout(() => sendJson(res, { ok: true }), 2_000);
    res.on("close", () => clearTimeout(timer));
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("a query's request", () => {
  it("is aborted when its only component unmounts", async () => {
    const q = makeCaller();
    const { unmount } = renderHook(() => q.users.useQuery("slow"), { wrapper });
    await waitFor(() => expect(server.requests).toHaveLength(1));

    unmount();

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });

  it("is aborted by queryClient.cancelQueries", async () => {
    const q = makeCaller();
    renderHook(() => q.users.useQuery("slow"), { wrapper });
    await waitFor(() => expect(server.requests).toHaveLength(1));

    await queryClient.cancelQueries({ queryKey: ["api", "users", "slow"] });

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });

  it("is still aborted by the signal passed in requestOptions", async () => {
    const q = makeCaller();
    const controller = new AbortController();
    renderHook(() => q.users.useQuery("slow", { requestOptions: { signal: controller.signal } }), {
      wrapper,
    });
    await waitFor(() => expect(server.requests).toHaveLength(1));

    controller.abort();

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });

  it("is aborted for an infinite query whose component unmounts", async () => {
    const q = makeCaller();
    const { unmount } = renderHook(
      () =>
        q.users.useInfiniteQuery("pages", {
          variables: (page) => ({ page }),
          initialPageParam: 0,
          getNextPageParam: () => undefined,
        }),
      { wrapper },
    );
    await waitFor(() => expect(server.requests).toHaveLength(1));

    unmount();

    await waitFor(() => expect(server.aborted).toEqual(["/users/pages"]));
  });

  it("is aborted for a prefetch when its query is cancelled", async () => {
    const q = makeCaller();
    const prefetch = q.users.prefetchQuery(queryClient, "slow");
    await waitFor(() => expect(server.requests).toHaveLength(1));

    await queryClient.cancelQueries({ queryKey: ["api", "users", "slow"] });
    await prefetch;

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });
});

/** The platform's AbortSignal without `any`, as Safari before 17.4, Chrome before 116 and Firefox before 124 have it. */
function withoutAny(): void {
  const { any: _dropped, ...rest } = Object.getOwnPropertyDescriptors(AbortSignal);
  vi.stubGlobal(
    "AbortSignal",
    Object.defineProperties(function OlderAbortSignal() {}, rest),
  );
}

describe("a query's request on a browser without AbortSignal.any", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is aborted by the signal passed in requestOptions", async () => {
    withoutAny();
    const q = makeCaller();
    const controller = new AbortController();
    renderHook(() => q.users.useQuery("slow", { requestOptions: { signal: controller.signal } }), {
      wrapper,
    });
    await waitFor(() => expect(server.requests).toHaveLength(1));

    controller.abort();

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });

  it("is aborted when its component unmounts, a signal of its own passed too", async () => {
    withoutAny();
    const q = makeCaller();
    const controller = new AbortController();
    const { unmount } = renderHook(
      () => q.users.useQuery("slow", { requestOptions: { signal: controller.signal } }),
      { wrapper },
    );
    await waitFor(() => expect(server.requests).toHaveLength(1));

    unmount();

    await waitFor(() => expect(server.aborted).toEqual(["/users/slow"]));
  });
});
