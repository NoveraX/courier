import { createLogger } from "../logger";
import { createConnectionState } from "../realtime/connection-state";
import { fromErrorCode, RealtimeError } from "../realtime/errors";
import type {
  ChannelHandlers,
  ConnectionStatus,
  WSChannel,
  WSChannelContext,
} from "../realtime/types";

const log = createLogger("Testing");
const INTERNAL_ERROR = 5000;

/**
 * Create an in-memory WSChannel from ChannelHandlers.
 * No real WebSocket — handlers are invoked directly.
 *
 * Handler failures reach the channel as a real server's do: an `error`
 * event for a refused message or a failed `onMessage`, and an `error` event
 * then `disconnected` for a failed `onJoin` or a `ctx.close()` with a code.
 * They used to reject with nobody listening, which failed the test run with
 * an unhandled rejection instead of showing what the app would see.
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
  const errorHandlers = new Set<(error: RealtimeError) => void>();
  const ended = new AbortController();

  const ctx: WSChannelContext<TReceive> = {
    topic: "mock.channel",
    variables,
    connectionId: `mock_${Date.now()}`,
    meta: {},
    signal: ended.signal,
    send(data: TReceive) {
      if (ended.signal.aborted) return;
      for (const handler of dataHandlers) handler(data);
    },
    broadcast(_topic: string, data: TReceive) {
      ctx.send(data);
    },
    close(code?: number, reason?: string) {
      const failed = code !== undefined && code !== 1000;
      finish(failed ? fromErrorCode(code, reason ?? "Channel closed") : undefined);
    },
  };

  function report(error: RealtimeError): void {
    for (const handler of errorHandlers) handler(error);
  }

  function finish(error: RealtimeError | undefined): void {
    if (ended.signal.aborted) return;
    ended.abort();
    if (error) report(error);
    dataHandlers.clear();
    errorHandlers.clear();
    state.set("disconnected");
    void settle("onLeave", async () => handlers.onLeave?.(ctx));
  }

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    state.set("connecting");

    if (delayMs) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
      if (ended.signal.aborted) return;
    }

    state.set("connected");
    const failure = await settle("onJoin", async () => handlers.onJoin?.(ctx));
    if (failure) finish(asRealtimeError(failure, "Subscription failed"));
  }

  const channel = {
    send(data: TSend) {
      if (ended.signal.aborted) return;
      void settle("onMessage", async () => handlers.onMessage(ctx, data)).then((failure) => {
        if (failure) report(asRealtimeError(failure, "Handler error"));
      });
    },
    on(event: "data" | "status" | "error", handler: (arg: never) => void): () => void {
      if (event === "data") return addTo(dataHandlers, handler as (data: TReceive) => void);
      if (event === "error") return addTo(errorHandlers, handler as (error: RealtimeError) => void);
      return state.subscribe(handler as (status: ConnectionStatus) => void);
    },
    close() {
      finish(undefined);
    },
    get status() {
      return state.current;
    },
  };

  return channel as WSChannel<TSend, TReceive>;
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

function addTo<THandler>(handlers: Set<THandler>, handler: THandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
