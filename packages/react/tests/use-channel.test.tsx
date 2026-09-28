/**
 * @vitest-environment jsdom
 */

import { type ReactNode, StrictMode, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ForbiddenError, type WSChannel } from "@noverax/courier/realtime";
import { createMockWSChannel } from "@noverax/courier/testing";

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

  it("reports an error the server sends, and the channel goes on", async () => {
    const onError = vi.fn();
    const channelFn: ChannelFn = () =>
      createMockWSChannel<unknown, unknown>({
        onMessage(ctx, data) {
          if (data === "forbidden") throw new ForbiddenError("Not allowed in this room");
          ctx.send({ echo: data });
        },
      });

    const { result } = renderHook(
      () => useChannel<unknown, unknown>(channelFn, "chat", "room", { onError }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => result.current.send("forbidden"));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ForbiddenError));
    act(() => result.current.send("fine"));

    await waitFor(() => expect(result.current.lastMessage).toEqual({ echo: "fine" }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 4403 }));
    expect(result.current.status).toBe("connected");
  });

  it("reports why the join was rejected, and shows the channel disconnected", async () => {
    const channelFn: ChannelFn = () =>
      createMockWSChannel<unknown, unknown>({
        onJoin() {
          throw new ForbiddenError("Not a member of this room");
        },
        onMessage() {},
      });

    const { result } = renderHook(() => useChannel(channelFn, "chat", "room"), { wrapper });

    // The status passes through "connected" before the join is refused, so wait on the error.
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe("Not a member of this room");
    await waitFor(() => expect(result.current.status).toBe("disconnected"));
  });

  it("keeps a message shaped like an error as data", async () => {
    const channelFn: ChannelFn = () =>
      createMockWSChannel<unknown, unknown>({
        onJoin(ctx) {
          ctx.send({ type: "error", message: "disk full on build 42" });
        },
        onMessage() {},
      });

    const { result } = renderHook(() => useChannel(channelFn, "builds", "log"), { wrapper });

    await waitFor(() => expect(result.current.lastMessage).toBeDefined());
    expect(result.current.lastMessage).toEqual({ type: "error", message: "disk full on build 42" });
    expect(result.current.error).toBeUndefined();
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

describe("useChannel's status", () => {
  it("is connecting from the first render, before the channel reports", () => {
    const { channelFn } = createChannelSpy();

    const { result } = renderHook(() => useChannel(channelFn, "chat", "room"), { wrapper });

    expect(result.current.status).toBe("connecting");
  });

  it("starts over as connecting when the variables name another channel", async () => {
    const { channelFn } = createChannelSpy();
    const { result, rerender } = renderHook(
      ({ room }) => useChannel(channelFn, "chat", "room", { variables: { room } }),
      { wrapper, initialProps: { room: "a" } },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));

    rerender({ room: "b" });

    expect(result.current.status).toBe("connecting");
    await waitFor(() => expect(result.current.status).toBe("connected"));
  });

  it("is disconnected in the very render that disables it", async () => {
    const { channelFn } = createChannelSpy();
    const seen: string[] = [];
    const { result, rerender } = renderHook(
      ({ enabled }) => {
        const channel = useChannel(channelFn, "chat", "room", { enabled });
        seen.push(channel.status);
        return channel;
      },
      { wrapper, initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.status).toBe("connected"));
    seen.length = 0;

    rerender({ enabled: false });

    expect(seen[0]).toBe("disconnected");
  });
});
