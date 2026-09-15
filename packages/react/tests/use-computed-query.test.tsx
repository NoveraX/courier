/**
 * @vitest-environment jsdom
 */

import { type ReactNode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createMockSSESubscription } from "@noverax/courier/testing";

import { useComputedQuery } from "../src/hooks/use-computed-query";
import type { SubscribeFn } from "../src/hooks/use-subscription";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
});

afterEach(() => {
  queryClient.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useComputedQuery", () => {
  it("fetches query data and updates cache from SSE events", async () => {
    const queryFn = vi.fn(async () => [{ id: 1, name: "Alice" }]);

    const subscribeFn: SubscribeFn = vi.fn(() =>
      createMockSSESubscription(async function* () {
        yield { data: { id: 2, name: "Bob" } };
      }),
    );

    const { result } = renderHook(
      () =>
        useComputedQuery(
          queryFn,
          subscribeFn,
          ["api", "users", "getAll"],
          "users",
          {
            subscriptionMethod: "stream",
            mapper: (current: Array<{ id: number; name: string }> | undefined, event) => [
              ...(current ?? []),
              event.data as { id: number; name: string },
            ],
          },
        ),
      { wrapper },
    );

    // Wait for query to resolve
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Wait for SSE event to update cache
    await waitFor(() => {
      const data = queryClient.getQueryData(["api", "users", "getAll"]) as unknown[];
      expect(data).toHaveLength(2);
    });

    const cached = queryClient.getQueryData(["api", "users", "getAll"]) as Array<{
      id: number;
      name: string;
    }>;
    expect(cached[0]).toEqual({ id: 1, name: "Alice" });
    expect(cached[1]).toEqual({ id: 2, name: "Bob" });
  });

  it("does not subscribe when enabled is false", async () => {
    const queryFn = vi.fn(async () => "data");
    const subscribeFn: SubscribeFn = vi.fn(() =>
      createMockSSESubscription(async function* () {
        yield { data: "event" };
      }),
    );

    renderHook(
      () =>
        useComputedQuery(queryFn, subscribeFn, ["key"], "group", {
          subscriptionMethod: "stream",
          mapper: (_current, e) => e.data,
          enabled: false,
        }),
      { wrapper },
    );

    expect(queryFn).not.toHaveBeenCalled();
    expect(subscribeFn).not.toHaveBeenCalled();
  });

  it("uses subscriptionVariables for SSE when provided", async () => {
    const queryFn = vi.fn(async () => []);
    const subscribeFn: SubscribeFn = vi.fn(() =>
      createMockSSESubscription(async function* () {
        yield { data: "event" };
      }),
    );

    renderHook(
      () =>
        useComputedQuery(queryFn, subscribeFn, ["key"], "chat", {
          variables: { userId: 1 },
          subscriptionMethod: "live",
          subscriptionVariables: { roomId: "abc" },
          mapper: (_current, e) => e.data,
        }),
      { wrapper },
    );

    // subscribeFn should receive subscriptionVariables, not query variables
    await waitFor(() => {
      expect(subscribeFn).toHaveBeenCalledWith("chat", "live", { roomId: "abc" });
    });
  });
});
