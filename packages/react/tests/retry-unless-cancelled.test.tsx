/**
 * @vitest-environment jsdom
 */

/**
 * The query hooks never retry a cancellation: a read a newer call of its
 * endpoint cancelled (`cancelPrevious`), or one whose own signal aborted.
 * TanStack Query takes both for failures and would send the read again,
 * which cancels the newer call in turn. Every other failure is retried as
 * the hook says, then as the client's defaults say, then as TanStack Query
 * does by itself — and a prefetch is still sent once unless asked.
 */

import { createCaller } from "@noverax/courier";
import { courier, defineApi, defineGroup } from "@noverax/courier/define";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { sendJson, startTestServer, type TestServer } from "./helpers/test-server";

const { endpoint } = courier();

let server: TestServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeApi() {
  const users = defineGroup({
    prefix: "users",
    endpoints: {
      search: endpoint
        .get("search")
        .variables<{ q: string }>()
        .response<{ q: string }>()
        .cancelPrevious(),
      failing: endpoint.get("failing").response<{ ok: boolean }>(),
      slow: endpoint.get("slow").response<{ ok: boolean }>(),
    },
  });
  return defineApi({ name: "api", baseURL: server.origin, groups: { users } });
}

function sent(path: string): number {
  return server.requests.filter((request) => request.path === path).length;
}

beforeEach(async () => {
  server = await startTestServer((_req, res, url) => {
    if (url.pathname === "/users/failing") return sendJson(res, { message: "down" }, 503);
    const wait = url.pathname === "/users/slow" ? 2_000 : 200;
    const timer = setTimeout(() => sendJson(res, { q: url.searchParams.get("q"), ok: true }), wait);
    res.on("close", () => clearTimeout(timer));
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retryDelay: 1 } } });
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("a query hook", () => {
  it("does not retry a read a newer call of its endpoint cancelled", async () => {
    const api = makeApi();
    const q = createQueryCaller(api);
    const { result } = renderHook(() => q.users.useQuery("search", { variables: { q: "a" } }), {
      wrapper,
    });
    await waitFor(() => expect(sent("/users/search")).toBe(1));

    const newer = createCaller(api).users.search({ q: "ab" });

    await expect(newer).resolves.toEqual({ q: "ab", ok: true });
    await waitFor(() => expect(result.current.error).toMatchObject({ status: 499 }));
    expect(result.current.failureCount).toBe(1);
    expect(sent("/users/search")).toBe(2);
  });

  it("does not retry a read whose own signal aborted", async () => {
    const q = createQueryCaller(makeApi());
    const controller = new AbortController();
    const { result } = renderHook(
      () => q.users.useQuery("slow", { requestOptions: { signal: controller.signal } }),
      { wrapper },
    );
    await waitFor(() => expect(sent("/users/slow")).toBe(1));

    controller.abort();

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.failureCount).toBe(1);
  });

  it("retries any other failure as the hook says", async () => {
    const q = createQueryCaller(makeApi());

    const { result } = renderHook(() => q.users.useQuery("failing", { retry: 2 }), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.failureCount).toBe(3);
    expect(sent("/users/failing")).toBe(3);
  });

  it("retries as the client's defaults say where the hook says nothing", async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: 1, retryDelay: 1 } },
    });
    const q = createQueryCaller(makeApi());

    const { result } = renderHook(() => q.users.useQuery("failing"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(sent("/users/failing")).toBe(2);
  });

  it("retries as TanStack Query does where nothing says", async () => {
    const q = createQueryCaller(makeApi());

    const { result } = renderHook(() => q.users.useQuery("failing"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(sent("/users/failing")).toBe(4);
  });
});

describe("a prefetch", () => {
  it("is sent once unless the client says otherwise", async () => {
    const q = createQueryCaller(makeApi());

    await q.users.prefetchQuery(queryClient, "failing");

    expect(sent("/users/failing")).toBe(1);
  });
});
