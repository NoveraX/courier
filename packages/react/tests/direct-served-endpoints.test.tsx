/**
 * @vitest-environment jsdom
 */

import { isConfigurationError } from "@noverax/courier";
import { clearWSConnectionPool } from "@noverax/courier/internal";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
/**
 * A direct React caller on streams and channels this process serves.
 *
 * `createQueryCaller(api)` dialled the API's `baseURL` for an endpoint
 * defined with `.implement()` — the upstream's address, where nothing serves
 * it — and reconnected there for good, the hook "reconnecting" with no error.
 */
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryCaller } from "../src/create-query-caller";
import { liveApi } from "./helpers/live-api";

let queryClient: QueryClient;
const dialled: string[] = [];

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      dialled.push(String(input));
      return Promise.reject(new TypeError("no network in this test"));
    }),
  );
  vi.stubGlobal(
    "WebSocket",
    vi.fn((url: string) => {
      dialled.push(url);
      throw new Error("no network in this test");
    }),
  );
});

afterEach(() => {
  queryClient.clear();
  clearWSConnectionPool();
  dialled.length = 0;
  vi.unstubAllGlobals();
});

describe("a direct React caller on an endpoint this process serves", () => {
  it("reports a stream through useSubscription's error, and dials nothing", async () => {
    const q = createQueryCaller(liveApi);
    const onError = vi.fn();

    const { result } = renderHook(
      () => q.live.useSubscription("ticks", { variables: { n: 1 }, onError }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(isConfigurationError(result.current.error)).toBe(true);
    expect(result.current.error).toMatchObject({ code: "DIRECT_CALL_TO_SERVED_ENDPOINT" });
    expect(onError).toHaveBeenCalledWith(result.current.error);
    expect(dialled).toEqual([]);
  });

  it("reports a channel through useChannel's error, and dials nothing", async () => {
    const q = createQueryCaller(liveApi);

    const { result } = renderHook(() => q.live.useChannel("room", { variables: { room: "r1" } }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toMatchObject({ code: "DIRECT_CALL_TO_SERVED_ENDPOINT" });
    expect(dialled).toEqual([]);
  });
});
