import { acquireConnection, type ConnectionLease, leaseWhenFound } from "./caller-ws";
import { createConnectionState } from "./connection-state";
import { RealtimeError } from "./errors";
import { forwardConnectionStatus } from "./forward-status";
import { createEventQueue } from "./sse/event-queue";
import type { ConnectionStatus, SSESubscription } from "./types";
import { qualifyTopic } from "./ws/topic-key";
import type { WSConnectionConfig } from "./ws/ws-types";

/**
 * Execute a WS push-only subscription — returns SSESubscription (async iterable).
 * Used for a channel that only pushes.
 *
 * Reads through the same bounded queue as an SSE subscription, so its
 * events are not kept for the subscription's life. Iteration ends when the
 * server finishes the subscription, rejects with the `RealtimeError` it
 * failed or was refused with, and leaving the loop early unsubscribes. The
 * socket's options may still be being found — whose session it opens with,
 * on a server — and the subscription takes its socket once they are.
 */
export function executeWSPush<TData>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig> | Promise<Partial<WSConnectionConfig> | undefined>,
): SSESubscription<TData> {
  const qTopic = qualifyTopic(topic, variables);
  let lease: ConnectionLease | undefined =
    config instanceof Promise ? undefined : acquireConnection(url, config);
  const state = createConnectionState();
  const queue = createEventQueue<TData>();
  let stop: (() => void) | undefined;
  let ended = false;

  function finish(error: Parameters<typeof queue.fail>[0] | undefined): void {
    if (ended) return;
    ended = true;
    stop?.();
    stop = undefined;
    lease?.release();
    state.set("disconnected");
    if (error) queue.fail(error);
    else queue.finish();
  }

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    if (ended) return;
    state.set("connecting");
    if (lease === undefined) {
      const taken = await leaseWhenFound(url, Promise.resolve(config));
      if (taken instanceof RealtimeError) return finish(taken);
      if (ended) return taken.release();
      lease = taken;
    }
    const conn = lease.connection;

    const unsubStatus = conn.onStatusChange((s) => {
      if (!ended) forwardConnectionStatus(state, s);
    });
    if (conn.status === "connected") state.set("connected");

    const unsubscribe = conn.subscribe(
      qTopic,
      {
        data: (payload) => queue.push({ data: payload as TData }),
        end: (error) => finish(error),
      },
      variables,
    );
    stop = () => {
      unsubscribe();
      unsubStatus();
    };
  }

  const close = () => finish(undefined);
  const iter = queue.iterator(close);

  return {
    [Symbol.asyncIterator]() {
      return iter;
    },
    close,
    get status() {
      return state.current;
    },
    get dropped() {
      return queue.dropped;
    },
    on(_event: "status", handler: (status: ConnectionStatus) => void) {
      return state.subscribe(handler);
    },
  };
}
