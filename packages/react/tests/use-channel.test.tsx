/**
 * @vitest-environment jsdom
 */

import { type ReactNode, StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { WSChannel } from "@noverax/nexus/realtime";
import { createMockWSChannel } from "@noverax/nexus/testing";

import { useChannel } from "../src/hooks/use-channel";
import type { ChannelFn } from "../src/hooks/use-channel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function createChannelSpy(): {
  channelFn: ChannelFn;
  lastChannel: () => WSChannel<unknown, unknown> | undefined;
} {
  let last: WSChannel<unknown, unknown> | undefined;
  const channelFn: ChannelFn = vi.fn((_group, _method, _vars?) => {
    const ch = createMockWSChannel<unknown, unknown>({
      onJoin(ctx) {
        // Send a welcome message on join
        ctx.send({ msg: "welcome" });
      },
      onMessage(ctx, data) {
        // Echo messages back with prefix
        ctx.send({ echo: data });
      },
    });
    last = ch;
    return ch;
  });
  return { channelFn, lastChannel: () => last };
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

describe("useChannel", () => {
  it("receives initial message from server onJoin", async () => {
    const { channelFn } = createChannelSpy();

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room"),
      { wrapper },
    );

    expect(result.current.lastMessage).toBeUndefined();

    await waitFor(() => {
      expect(result.current.lastMessage).toEqual({ msg: "welcome" });
    });
  });

  it("passes group, method, and variables to channelFn", async () => {
    const { channelFn } = createChannelSpy();
    const variables = { room: "general" };

    renderHook(
      () => useChannel(channelFn, "chat", "room", { variables }),
      { wrapper },
    );

    await waitFor(() => {
      expect(channelFn).toHaveBeenCalledWith("chat", "room", variables);
    });
  });

  it("does not connect when enabled=false", () => {
    const { channelFn } = createChannelSpy();

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room", { enabled: false }),
      { wrapper },
    );

    expect(channelFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe("disconnected");
    expect(result.current.lastMessage).toBeUndefined();
  });

  it("reconnects when enabled toggles true", async () => {
    const { channelFn } = createChannelSpy();
    let enabled = false;

    const { result, rerender } = renderHook(
      () => useChannel(channelFn, "chat", "room", { enabled }),
      { wrapper },
    );

    expect(channelFn).not.toHaveBeenCalled();

    enabled = true;
    rerender();

    await waitFor(() => {
      expect(result.current.lastMessage).toEqual({ msg: "welcome" });
    });

    expect(channelFn).toHaveBeenCalledTimes(1);
  });

  it("sends messages via send()", async () => {
    const { channelFn } = createChannelSpy();

    const { result } = renderHook(
      () => useChannel<{ text: string }, unknown>(channelFn, "chat", "room"),
      { wrapper },
    );

    // Wait for connection
    await waitFor(() => {
      expect(result.current.lastMessage).toEqual({ msg: "welcome" });
    });

    act(() => {
      result.current.send({ text: "hello" });
    });

    await waitFor(() => {
      expect(result.current.lastMessage).toEqual({ echo: { text: "hello" } });
    });
  });

  it("calls onData callback for each message", async () => {
    const { channelFn } = createChannelSpy();
    const onData = vi.fn();

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room", { onData }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toBeDefined();
    });

    expect(onData).toHaveBeenCalledWith({ msg: "welcome" });
  });

  it("closes channel on unmount", async () => {
    const { channelFn, lastChannel } = createChannelSpy();

    const { result, unmount } = renderHook(
      () => useChannel(channelFn, "chat", "room"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toBeDefined();
    });

    const ch = lastChannel()!;
    unmount();

    expect(ch.status).toBe("disconnected");
  });

  it("close() terminates channel manually", async () => {
    const { channelFn, lastChannel } = createChannelSpy();

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toBeDefined();
    });

    act(() => {
      result.current.close();
    });

    expect(lastChannel()!.status).toBe("disconnected");
  });

  it("tracks connection status changes", async () => {
    const { channelFn } = createChannelSpy();
    const onStatusChange = vi.fn();

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room", { onStatusChange }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toBeDefined();
    });

    const statuses = onStatusChange.mock.calls.map((args) => args[0] as string);
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
  });

  it("reconnects when variables change", async () => {
    const { channelFn } = createChannelSpy();
    let variables = { room: "general" };

    const { result, rerender } = renderHook(
      () => useChannel(channelFn, "chat", "room", { variables }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toBeDefined();
    });

    variables = { room: "random" };
    rerender();

    await waitFor(() => {
      expect(channelFn).toHaveBeenCalledTimes(2);
    });

    expect(channelFn).toHaveBeenLastCalledWith("chat", "room", { room: "random" });
  });

  it("connects only once under React StrictMode (mount → cleanup → mount)", async () => {
    const { channelFn } = createChannelSpy();

    const strictWrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        StrictMode,
        null,
        createElement(QueryClientProvider, { client: queryClient }, children),
      );

    const { result } = renderHook(
      () => useChannel(channelFn, "chat", "room"),
      { wrapper: strictWrapper },
    );

    await waitFor(() => {
      expect(result.current.lastMessage).toEqual({ msg: "welcome" });
    });

    // StrictMode dev double-mount must not produce a phantom channel
    expect(channelFn).toHaveBeenCalledTimes(1);
  });
});
