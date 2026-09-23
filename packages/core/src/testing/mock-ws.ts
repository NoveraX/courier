import { createConnectionState } from "../realtime/connection-state";
import type { ChannelHandlers, WSChannel, WSChannelContext } from "../realtime/types";

/**
 * Create an in-memory WSChannel from ChannelHandlers.
 * No real WebSocket — handlers are invoked directly.
 *
 * @param handlers - Channel handlers (onJoin, onMessage, onLeave)
 * @param variables - Variables passed to the channel context
 * @param delayMs - Optional delay before the channel connects
 * @returns WSChannel with full lifecycle support
 */
export function createMockWSChannel<TSend, TReceive>(
  handlers: ChannelHandlers<TSend, TReceive>,
  variables?: unknown,
  delayMs?: number,
): WSChannel<TSend, TReceive> {
  const state = createConnectionState();
  const dataHandlers = new Set<(data: TReceive) => void>();
  let closed = false;

  const ended = new AbortController();
  const ctx: WSChannelContext<TReceive> = {
    topic: "mock.channel",
    variables,
    connectionId: `mock_${Date.now()}`,
    meta: {},
    signal: ended.signal,
    send(data: TReceive) {
      if (closed) return;
      for (const handler of dataHandlers) handler(data);
    },
    broadcast(_topic: string, data: TReceive) {
      ctx.send(data);
    },
    close() {
      channel.close();
    },
  };

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    state.set("connecting");

    if (delayMs) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
      if (closed) return;
    }

    state.set("connected");
    await handlers.onJoin?.(ctx);
  }

  const channel: WSChannel<TSend, TReceive> = {
    send(data: TSend) {
      if (closed) return;
      void Promise.resolve().then(() => handlers.onMessage(ctx, data));
    },
    on(event: "data" | "status", handler: (arg: any) => void): () => void {
      if (event === "data") {
        dataHandlers.add(handler);
        return () => dataHandlers.delete(handler);
      }
      return state.subscribe(handler);
    },
    close() {
      if (closed) return;
      closed = true;
      ended.abort();
      void Promise.resolve().then(() => handlers.onLeave?.(ctx));
      dataHandlers.clear();
      state.set("disconnected");
    },
    get status() {
      return state.current;
    },
  };

  return channel;
}
