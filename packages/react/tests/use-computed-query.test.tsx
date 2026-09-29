/**
 * @vitest-environment jsdom
 */

import { ForbiddenError } from "@noverax/courier/realtime";
import { createMockSSESubscription } from "@noverax/courier/testing";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        useComputedQuery(queryFn, subscribeFn, ["api", "users", "getAll"], "users", {
          subscriptionMethod: "stream",
          mapper: (current: Array<{ id: number; name: string }> | undefined, event) => [
            ...(current ?? []),
            event.data as { id: number; name: string },
          ],
        }),
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

describe("useComputedQuery's stream", () => {
  const users = async () => [{ id: 1, name: "Alice" }];
  const append = (current: unknown[] | undefined, event: { data: unknown }) => [
    ...(current ?? []),
    event.data,
  ];

  it("says through onStreamError why the stream failed, and the query keeps its data", async () => {
    const onStreamError = vi.fn();
    const subscribeFn: SubscribeFn = () =>
      createMockSSESubscription(async function* () {
        yield { data: { id: 2, name: "Bob" } };
        throw new ForbiddenError("Not allowed to watch users");
      });

    const { result } = renderHook(
      () =>
        useComputedQuery(users, subscribeFn, ["api", "users", "getAll"], "users", {
          subscriptionMethod: "stream",
          mapper: append,
          onStreamError,
        }),
      { wrapper },
    );

    await waitFor(() => expect(onStreamError).toHaveBeenCalledTimes(1));
    expect(onStreamError.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toHaveLength(2));
  });

  it("says through onStreamError that the stream could not be opened", async () => {
    const onStreamError = vi.fn();
    const subscribeFn: SubscribeFn = () => {
      throw new Error("no stream here");
    };

    const { result } = renderHook(
      () =>
        useComputedQuery(users, subscribeFn, ["api", "users", "getAll"], "users", {
          subscriptionMethod: "stream",
          mapper: append,
          onStreamError,
        }),
      { wrapper },
    );

    await waitFor(() => expect(onStreamError).toHaveBeenCalledWith(new Error("no stream here")));
    await waitFor(() => expect(result.current.data).toEqual([{ id: 1, name: "Alice" }]));
  });

  it("reports the stream's status through onStreamStatusChange", async () => {
    const onStreamStatusChange = vi.fn();
    const subscribeFn: SubscribeFn = () =>
      createMockSSESubscription(async function* () {
        yield { data: { id: 2, name: "Bob" } };
      });

    renderHook(
      () =>
        useComputedQuery(users, subscribeFn, ["api", "users", "getAll"], "users", {
          subscriptionMethod: "stream",
          mapper: append,
          onStreamStatusChange,
        }),
      { wrapper },
    );

    await waitFor(() => expect(onStreamStatusChange).toHaveBeenLastCalledWith("disconnected"));
    expect(onStreamStatusChange).toHaveBeenCalledWith("connected");
  });
});
