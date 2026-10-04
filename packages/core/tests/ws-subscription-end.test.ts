/**
 * The end of a WebSocket subscription reaching the endpoint that serves it.
 *
 * Ending a push subscription ends the handler's wait and fires its context's
 * signal, so a push endpoint waiting on an upstream event does not keep its
 * timers and upstream subscriptions after the client has gone.
 */
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createWSHandler } from "../src/adapter/handle-ws";
import { courier } from "../src/define/courier";
import type { Sources } from "../src/define/types";
import type { WebSocketLike } from "../src/realtime/adapters";
import type { WSChannelContext, WSContext } from "../src/realtime/types";
import { encodeMessage } from "../src/realtime/ws/ws-protocol";
import { _resetSourcesForTests, registerSources } from "../src/sources";

const { channel } = courier();
const TOPIC = "api.live.feed";
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

afterEach(() => {
  _resetSourcesForTests();
});

type Socket = WebSocketLike & { emit(type: string, event?: unknown): void };

function createSocket(): Socket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  return {
    readyState: 1,
    bufferedAmount: 0,
    send: () => undefined,
    close: () => undefined,
    addEventListener(type: string, handler: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler as (event: unknown) => void]);
    },
    emit(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
  };
}

function serve(feed: unknown): Socket {
  registerSources({
    api: { options: { groups: { live: { options: {}, feed } } } },
  } as unknown as Sources);
  const socket = createSocket();
  createWSHandler().handleSocket(socket, new Request("http://localhost/api/ws"));
  return socket;
}

function send(socket: Socket, message: Record<string, unknown>): void {
  socket.emit("message", { data: encodeMessage(message as never) });
}

/** A push endpoint that yields once, then waits on an upstream that stays quiet. */
function quietUpstream() {
  const seen: { signal?: AbortSignal; released: boolean } = { released: false };
  const handler = async function* (ctx: WSContext) {
    seen.signal = ctx.signal;
    try {
      yield "hello";
      await new Promise((resolve) => ctx.signal.addEventListener("abort", resolve));
    } finally {
      seen.released = true;
    }
  };
  return { handler, seen };
}

describe("a push endpoint waiting on its upstream", () => {
  it("hears an unsubscribe through its signal and releases what it holds", async () => {
    const { handler, seen } = quietUpstream();
    const socket = serve(channel.response<string>().implement(handler as never));
    send(socket, { type: "subscribe", id: "s1", topic: TOPIC });
    await settle();
    expect(seen.signal?.aborted).toBe(false);

    send(socket, { type: "unsubscribe", id: "u1", topic: TOPIC });
    await settle();

    expect(seen.signal?.aborted).toBe(true);
    expect(seen.released).toBe(true);
  });

  it("hears the socket close through its signal and releases what it holds", async () => {
    const { handler, seen } = quietUpstream();
    const socket = serve(channel.response<string>().implement(handler as never));
    send(socket, { type: "subscribe", id: "s1", topic: TOPIC });
    await settle();

    socket.emit("close", { code: 1001 });
    await settle();

    expect(seen.signal?.aborted).toBe(true);
    expect(seen.released).toBe(true);
  });
});

describe("a channel endpoint", () => {
  it("hears the end of its subscription through its signal", async () => {
    let signal: AbortSignal | undefined;
    const room = channel
      .send(z.string())
      .response<string>()
      .implement((() => ({
        onJoin: (ctx: WSChannelContext) => {
          signal = ctx.signal;
        },
        onMessage: () => undefined,
      })) as never);
    const socket = serve(room);
    send(socket, { type: "subscribe", id: "s1", topic: TOPIC });
    await settle();
    expect(signal?.aborted).toBe(false);

    send(socket, { type: "unsubscribe", id: "u1", topic: TOPIC });
    await settle();

    expect(signal?.aborted).toBe(true);
  });
});
