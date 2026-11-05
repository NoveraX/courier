/**
 * @vitest-environment jsdom
 *
 * `reconnect` from a stream's or a channel's hook, as a component calls it
 * once its user signed in anew: a live one reconnects at once, and one its
 * server ended is opened again — the same subscription, read as before, its
 * error cleared. What a channel keeps while it opens is bounded.
 */
import { RealtimeError } from "@noverax/courier/realtime";
import { createMockSSESubscription, createMockWSChannel } from "@noverax/courier/testing";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { type ChannelFn, useChannel } from "../src/hooks/use-channel";
import { type SubscribeFn, useSubscription } from "../src/hooks/use-subscription";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useSubscription's reconnect", () => {
  it("opens a stream its server ended again, and reads it", async () => {
    let lives = 0;
    const subscribe: SubscribeFn = vi.fn(() =>
      createMockSSESubscription(async function* () {
        lives++;
        yield { data: { life: lives } };
      }),
    );
    const { result } = renderHook(() => useSubscription(subscribe, "live", "ticks"));
    await waitFor(() => expect(result.current.status).toBe("disconnected"));

    act(() => result.current.reconnect());

    await waitFor(() => expect(result.current.data).toEqual({ life: 2 }));
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("clears the error the stream ended with", async () => {
    let lives = 0;
    const subscribe: SubscribeFn = () =>
      createMockSSESubscription(async function* () {
        lives++;
        if (lives === 1) throw new RealtimeError(4401, "Token expired");
        yield { data: "signed in" };
      });
    const { result } = renderHook(() => useSubscription(subscribe, "live", "ticks"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await waitFor(() => expect(result.current.error).toBeDefined());

    act(() => result.current.reconnect());

    expect(result.current.error).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe("signed in"));
    expect(result.current.error).toBeUndefined();
  });

  it("reconnects a live stream at once, and reads on", async () => {
    const subscription = createMockSSESubscription(async function* () {
      yield { data: 1 };
      await new Promise(() => undefined);
    });
    const reconnect = vi.spyOn(subscription, "reconnect");
    const subscribe: SubscribeFn = () => subscription;
    const { result } = renderHook(() => useSubscription(subscribe, "live", "ticks"));
    await waitFor(() => expect(result.current.data).toBe(1));

    act(() => result.current.reconnect());

    expect([reconnect.mock.calls.length, result.current.status]).toEqual([1, "connected"]);
  });
});

describe("useChannel's reconnect", () => {
  it("joins a channel its server ended again, its messages read as before", async () => {
    let joins = 0;
    const channel: ChannelFn = vi.fn(() =>
      createMockWSChannel<unknown, unknown>({
        onJoin(ctx) {
          joins++;
          ctx.send({ join: joins });
          if (joins === 1) ctx.close(4401, "Token expired");
        },
        onMessage: () => undefined,
      }),
    );
    const { result } = renderHook(() => useChannel(channel, "chat", "room"));
    await waitFor(() => expect(result.current.error?.code).toBe(4401));

    act(() => result.current.reconnect());

    expect(result.current.error).toBeUndefined();
    await waitFor(() =>
      expect([result.current.lastMessage, result.current.status]).toEqual([
        { join: 2 },
        "connected",
      ]),
    );
    expect(channel).toHaveBeenCalledTimes(1);
  });
});

describe("useChannel's send while the channel opens", () => {
  it("keeps 100 messages, and refuses the rest with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const heard: unknown[] = [];
    const channel: ChannelFn = () =>
      createMockWSChannel<unknown, unknown>({ onMessage: (_ctx, data) => void heard.push(data) });
    const { result } = renderHook(() => useChannel<number, unknown>(channel, "chat", "room"));

    const answers = Array.from({ length: 102 }, (_, i) => result.current.send(i));

    await waitFor(() => expect(heard).toHaveLength(100));
    expect([answers.filter(Boolean).length, answers.at(-1)]).toEqual([100, false]);
    expect(warn.mock.calls.flat().join(" ")).toContain("the message was dropped");
  });
});
