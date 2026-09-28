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

describe("useSubscription's events", () => {
  function ticks(count: number): SubscribeFn {
    return vi.fn(() =>
      createMockSSESubscription(async function* () {
        for (let i = 0; i < count; i++) yield { data: { i }, id: String(i) };
      }),
    );
  }

  it("keeps the latest 100 unless told otherwise", async () => {
    const subscribeFn = ticks(150);

    const { result } = renderHook(() => useSubscription(subscribeFn, "live", "ticks"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual({ i: 149 }));
    expect(result.current.events).toHaveLength(100);
    expect(result.current.events[0]?.data).toEqual({ i: 50 });
  });

  it("keeps as many as maxEvents says", async () => {
    const subscribeFn = ticks(10);

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "live", "ticks", { maxEvents: 3 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual({ i: 9 }));
    expect(result.current.events.map((event) => event.data)).toEqual([
      { i: 7 },
      { i: 8 },
      { i: 9 },
    ]);
  });

  it("keeps none with a maxEvents of 0, and still shows the latest data", async () => {
    const subscribeFn = ticks(5);

    const { result } = renderHook(
      () => useSubscription(subscribeFn, "live", "ticks", { maxEvents: 0 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toEqual({ i: 4 }));
    expect(result.current.events).toEqual([]);
  });

  it("takes a smaller maxEvents without opening the stream again", async () => {
    const subscribeFn = ticks(10);

    const { result, rerender } = renderHook(
      ({ maxEvents }) => useSubscription(subscribeFn, "live", "ticks", { maxEvents }),
      { wrapper, initialProps: { maxEvents: 5 } },
    );
    await waitFor(() => expect(result.current.data).toEqual({ i: 9 }));

    rerender({ maxEvents: 2 });

    expect(result.current.events.map((event) => event.data)).toEqual([{ i: 8 }, { i: 9 }]);
    expect(subscribeFn).toHaveBeenCalledTimes(1);
  });
});

describe("useSubscription's status", () => {
  /* A stream that stays open once it has said one thing. */
  const openStream: SubscribeFn = () =>
    createMockSSESubscription(async function* () {
      yield { data: { n: 1 }, id: "1" };
      await new Promise(() => undefined);
    });

  it("is connecting from the first render, before the stream reports", () => {
    const { result } = renderHook(() => useSubscription(openStream, "live", "feed"), {
      wrapper,
    });

    expect(result.current.status).toBe("connecting");
  });

  it("starts over as connecting when the variables name another stream", async () => {
    const { result, rerender } = renderHook(
      ({ room }) => useSubscription(openStream, "live", "feed", { variables: { room } }),
      { wrapper, initialProps: { room: "a" } },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    rerender({ room: "b" });

    expect(result.current.status).toBe("connecting");
    await waitFor(() => expect(result.current.status).toBe("connected"));
  });

  it("is disconnected in the very render that disables it", async () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ enabled }) => {
        const sub = useSubscription(openStream, "live", "feed", { enabled });
        seen.push(sub.status);
        return sub;
      },
      { wrapper, initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));
    seen.length = 0;

    rerender({ enabled: false });

    expect(seen[0]).toBe("disconnected");
    expect(result.current.status).toBe("disconnected");
  });

  it("is disconnected, with the reason, when the stream cannot be opened", async () => {
    const onStatusChange = vi.fn();
    const refused: SubscribeFn = () => {
      throw new Error("no stream here");
    };

    const { result } = renderHook(
      () => useSubscription(refused, "live", "feed", { onStatusChange }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error?.message).toBe("no stream here"));
    expect(result.current.status).toBe("disconnected");
    expect(onStatusChange).toHaveBeenLastCalledWith("disconnected");
  });
});
