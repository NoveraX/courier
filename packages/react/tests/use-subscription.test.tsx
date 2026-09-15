/**
 * @vitest-environment jsdom
 */

import { type ReactNode, StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { SSESubscription } from "@noverax/courier/realtime";
import { createMockSSESubscription } from "@noverax/courier/testing";

import { useSubscription } from "../src/hooks/use-subscription";
import type { SubscribeFn } from "../src/hooks/use-subscription";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function createSubscribeSpy(): {
  subscribeFn: SubscribeFn;
  lastSub: () => SSESubscription<unknown> | undefined;
} {
  let last: SSESubscription<unknown> | undefined;
  const subscribeFn: SubscribeFn = vi.fn((_group, _method, _vars?) => {
    const sub = createMockSSESubscription(async function* () {
      yield { data: { msg: "hello" }, id: "1" };
      yield { data: { msg: "world" }, id: "2" };
    });
    last = sub;
    return sub;
  });
  return { subscribeFn, lastSub: () => last };
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

describe("useSubscription", () => {
  it("receives events and updates data", async () => {
    const { subscribeFn } = createSubscribeSpy();

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed"),
      { wrapper },
    );

    expect(result.current.data).toBeUndefined();
    expect(result.current.events).toEqual([]);

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });

    expect(result.current.data).toEqual({ msg: "world" });
    expect(result.current.events[0]?.data).toEqual({ msg: "hello" });
    expect(result.current.events[1]?.data).toEqual({ msg: "world" });
  });

  it("passes group, method, and variables to subscribeFn", async () => {
    const { subscribeFn } = createSubscribeSpy();
    const variables = { userId: 42 };

    renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { variables }),
      { wrapper },
    );

    await waitFor(() => {
      expect(subscribeFn).toHaveBeenCalledWith("notifications", "feed", variables);
    });
  });

  it("does not subscribe when enabled=false", async () => {
    const { subscribeFn } = createSubscribeSpy();

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { enabled: false }),
      { wrapper },
    );

    expect(subscribeFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe("disconnected");
    expect(result.current.data).toBeUndefined();
  });

  it("resubscribes when enabled toggles true", async () => {
    const { subscribeFn } = createSubscribeSpy();
    let enabled = false;

    const { result, rerender } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { enabled }),
      { wrapper },
    );

    expect(subscribeFn).not.toHaveBeenCalled();

    enabled = true;
    rerender();

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });

    expect(subscribeFn).toHaveBeenCalledTimes(1);
  });

  it("calls onData callback for each event", async () => {
    const { subscribeFn } = createSubscribeSpy();
    const onData = vi.fn();

    renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { onData }),
      { wrapper },
    );

    await waitFor(() => {
      expect(onData).toHaveBeenCalledTimes(2);
    });

    expect(onData).toHaveBeenCalledWith({ data: { msg: "hello" }, id: "1" });
    expect(onData).toHaveBeenCalledWith({ data: { msg: "world" }, id: "2" });
  });

  it("closes subscription on unmount", async () => {
    const { subscribeFn, lastSub } = createSubscribeSpy();

    const { result, unmount } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0);
    });

    const sub = lastSub()!;
    unmount();

    // After unmount the subscription should be closed
    expect(sub.status).toBe("disconnected");
  });

  it("close() terminates subscription manually", async () => {
    // Use a long-running stream that doesn't auto-finish
    const subscribeFn: SubscribeFn = vi.fn(() => {
      return createMockSSESubscription(async function* () {
        yield { data: { msg: "first" }, id: "1" };
        // Simulate an infinite stream — never returns
        await new Promise(() => {});
      });
    });

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "chat", "messages"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    act(() => {
      result.current.close();
    });

    expect(result.current.data).toEqual({ msg: "first" });
  });

  it("tracks connection status changes", async () => {
    const { subscribeFn } = createSubscribeSpy();
    const onStatusChange = vi.fn();

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { onStatusChange }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });

    // Should have received status transitions: connecting → connected → disconnected
    const statuses = onStatusChange.mock.calls.map((args) => args[0] as string);
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
  });

  it("resubscribes when variables change", async () => {
    const { subscribeFn } = createSubscribeSpy();
    let variables = { userId: 1 };

    const { result, rerender } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { variables }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });

    variables = { userId: 2 };
    rerender();

    await waitFor(() => {
      expect(subscribeFn).toHaveBeenCalledTimes(2);
    });

    expect(subscribeFn).toHaveBeenLastCalledWith("notifications", "feed", { userId: 2 });
  });

  it("handles stream errors", async () => {
    const onError = vi.fn();

    // Create a subscription whose async iterator throws after first event
    const subscribeFn: SubscribeFn = vi.fn(() => {
      const sub = createMockSSESubscription(async function* () {
        yield { data: { msg: "ok" }, id: "1" };
      });

      // Wrap iterator to throw after first event
      const original = sub[Symbol.asyncIterator]();
      let yielded = false;
      const errorIter: AsyncIterableIterator<{ data: unknown }> = {
        async next() {
          if (!yielded) {
            yielded = true;
            return original.next();
          }
          throw new Error("stream broke");
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };

      return { ...sub, [Symbol.asyncIterator]: () => errorIter };
    });

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed", { onError }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toBe("stream broke");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "stream broke" }));
  });

  it("shows optimisticData immediately while connecting", async () => {
    const subscribeFn: SubscribeFn = vi.fn(() => {
      return createMockSSESubscription(async function* () {
        // Simulate delay before first event
        await new Promise((r) => setTimeout(r, 100));
        yield { data: { msg: "real" }, id: "1" };
      });
    });

    const { result } = renderHook(
      () =>
        useSubscription(subscribeFn, "notifications", "feed", {
          optimisticData: { msg: "loading..." },
        }),
      { wrapper },
    );

    // Immediately shows optimistic data before any event arrives
    expect(result.current.data).toEqual({ msg: "loading..." });

    await waitFor(() => {
      expect(result.current.data).toEqual({ msg: "real" });
    });
  });

  it("subscribes only once under React StrictMode (mount → cleanup → mount)", async () => {
    const { subscribeFn } = createSubscribeSpy();

    const strictWrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        StrictMode,
        null,
        createElement(QueryClientProvider, { client: queryClient }, children),
      );

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "notifications", "feed"),
      { wrapper: strictWrapper },
    );

    await waitFor(() => {
      expect(result.current.events).toHaveLength(2);
    });

    // StrictMode dev double-mount must not produce a phantom subscription
    expect(subscribeFn).toHaveBeenCalledTimes(1);
  });
});
