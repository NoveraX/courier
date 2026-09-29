/**
 * @vitest-environment jsdom
 */

import { isConfigurationError } from "@noverax/courier";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProxyQueryCaller } from "../src/create-proxy-query-caller";
import { type CourierServer, startCourierServer } from "./helpers/courier-server";
import { liveApi } from "./helpers/live-api";

let server: CourierServer;
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeCaller() {
  return createProxyQueryCaller<typeof liveApi>("api", {
    source: liveApi,
    proxyPath: server.proxyPath,
  });
}

beforeEach(async () => {
  server = await startCourierServer({ api: liveApi });
  queryClient = new QueryClient();
});

afterEach(async () => {
  queryClient.clear();
  await server.close();
});

describe("useSubscription over a real SSE stream", () => {
  it("starts from a clean state when its variables change", async () => {
    const q = makeCaller();
    let variables: { n: number; from?: number } = { n: 3 };
    const { result, rerender } = renderHook(() => q.live.useSubscription("ticks", { variables }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.events.map((e) => e.data.i)).toEqual([1, 2, 3]));

    variables = { n: 2, from: 10 };
    rerender();

    expect(result.current.events).toEqual([]);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.events.map((e) => e.data.i)).toEqual([10, 11]));
    expect(result.current.data).toEqual({ i: 11 });
  });

  it("goes back to its optimistic data when its variables change", async () => {
    const q = makeCaller();
    let variables: { n: number; from?: number } = { n: 1 };
    const { result, rerender } = renderHook(
      () => q.live.useSubscription("ticks", { variables, optimisticData: { i: 0 } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual({ i: 1 }));

    variables = { n: 1, from: 5 };
    rerender();

    expect(result.current.data).toEqual({ i: 0 });
    await waitFor(() => expect(result.current.data).toEqual({ i: 5 }));
  });

  it("reports connecting while the stream opens", async () => {
    const q = makeCaller();
    const seen: string[] = [];
    const { result } = renderHook(
      () => {
        const sub = q.live.useSubscription("ticks", { variables: { n: 2 } });
        if (seen.at(-1) !== sub.status) seen.push(sub.status);
        return sub;
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
    expect(seen).toEqual(["connecting", "connected", "disconnected"]);
  });

  it("reports a transport configuration error through error and onError", async () => {
    const q = createProxyQueryCaller<typeof liveApi>("api", {
      source: liveApi,
      proxyPath: { ...server.proxyPath, sse: "api/sse" },
    });
    const onError = vi.fn();

    const { result } = renderHook(
      () => q.live.useSubscription("ticks", { variables: { n: 1 }, onError }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(isConfigurationError(result.current.error)).toBe(true);
    expect(onError).toHaveBeenCalledWith(result.current.error);
    expect(result.current.status).toBe("disconnected");
  });
});
