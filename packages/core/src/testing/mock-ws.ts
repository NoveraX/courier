import { createLogger } from "../logger";
import { ChannelHandle } from "../realtime/channel-handle";
import { fromErrorCode, RealtimeError } from "../realtime/errors";
import type { SubscriptionSink } from "../realtime/subscription-driver";
import type { WSChannel } from "../realtime/subscription-types";
import type { ChannelHandlers, WSChannelContext } from "../realtime/types";

const log = createLogger("Testing");
const INTERNAL_ERROR = 5000;

/**
 * Create an in-memory WSChannel from ChannelHandlers.
 * No real WebSocket — handlers are invoked directly.
 *
 * It behaves as a channel over a socket does: `connecting` until `onJoin`
 * has run, then `connected`; handler failures reach it as a real server's
 * do — an `error` event for a refused message or a failed `onMessage`, and an
 * `error` event then `disconnected` for a failed `onJoin` or a `ctx.close()`
 * with a code — not a rejection with nobody listening, which would fail the
 * test run with an unhandled rejection instead of showing what the app would
 * see. `reconnect()` after it ended joins again.
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
  let join: ReturnType<typeof joined<TSend, TReceive>> | undefined;
  const start = (sink: SubscriptionSink<TReceive>): void => {
    join = joined(handlers, variables, delayMs, sink);
  };
  return new ChannelHandle<TSend, TReceive>(
    { open: start, reopen: start, reconnect: () => undefined, close: () => join?.leave() },
    (data) => join?.send(data) ?? false,
  );
}

/* One join of the mock channel: its handlers' context, and what the client sends it. */
function joined<TSend, TReceive>(
  handlers: ChannelHandlers<TSend, TReceive>,
  variables: unknown,
  delayMs: number | undefined,
  sink: SubscriptionSink<TReceive>,
) {
  const ended = new AbortController();
  const finish = (error: RealtimeError | undefined, byServer: boolean): void => {
    if (ended.signal.aborted) return;
    ended.abort();
    if (byServer) sink.end(error);
    void settle("onLeave", async () => handlers.onLeave?.(ctx));
  };
  const ctx: WSChannelContext<TReceive> = {
    topic: "mock.channel",
    variables,
    connectionId: `mock_${Date.now()}`,
    meta: {},
    signal: ended.signal,
    recovered: false,
    send(data: TReceive) {
      if (!ended.signal.aborted) sink.data({ data });
    },
    broadcast(_topic: string, data: TReceive) {
      ctx.send(data);
    },
    close(code?: number, reason?: string) {
      const failed = code !== undefined && code !== 1000;
      finish(failed ? fromErrorCode(code, reason ?? "Channel closed") : undefined, true);
    },
  };

  void (async () => {
    if (delayMs) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    if (ended.signal.aborted) return;
    const failure = await settle("onJoin", async () => handlers.onJoin?.(ctx));
    if (failure) finish(asRealtimeError(failure, "Subscription failed"), true);
    else if (!ended.signal.aborted) sink.open({ resumed: false });
  })();

  return {
    send(data: TSend): boolean {
      if (ended.signal.aborted) return false;
      void settle("onMessage", async () => handlers.onMessage(ctx, data)).then((failure) => {
        if (failure) sink.error(asRealtimeError(failure, "Handler error"));
      });
      return true;
    },
    leave: () => finish(undefined, false),
  };
}

/** Run a handler, logging its failure as a server would; resolves to that failure, if any. */
async function settle(name: string, run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    log.warn(`${name} handler failed`, error);
    return error ?? new Error(`${name} handler failed`);
  }
}

/** What a client reads: the handler's own RealtimeError, or a generic one. */
function asRealtimeError(error: unknown, fallback: string): RealtimeError {
  return error instanceof RealtimeError ? error : new RealtimeError(INTERNAL_ERROR, fallback);
}
