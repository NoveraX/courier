import { getConnection } from "./caller-ws";
import { createConnectionState } from "./connection-state";
import { forwardConnectionStatus } from "./forward-status";
import type { ConnectionStatus, SSEEvent, SSESubscription, WSChannel } from "./types";
import { qualifyTopic } from "./ws/topic-hash";
import type { WSConnectionConfig } from "./ws/ws-types";

/**
 * Execute a WS push-only subscription — returns SSESubscription (async iterable).
 * Used for a channel that only pushes.
 */
export function executeWSPush<TData>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig>,
): SSESubscription<TData> {
  const qTopic = qualifyTopic(topic, variables);
  const conn = getConnection(url, config);
  const state = createConnectionState();
  const buffer: SSEEvent<TData>[] = [];
  let finished = false;
  let resolve: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    state.set("connecting");

    const unsubStatus = conn.onStatusChange((s) => {
      forwardConnectionStatus(state, s, () => {
        finished = true;
        resolve?.();
        resolve = null;
      });
    });

    if (conn.status === "connected") state.set("connected");

    unsubscribe = conn.subscribe(
      qTopic,
      (payload) => {
        buffer.push({ data: payload as TData });
        resolve?.();
        resolve = null;
      },
      variables,
    );

    const origUnsub = unsubscribe;
    unsubscribe = () => {
      origUnsub();
      unsubStatus();
    };
  }

  async function* iterate(): AsyncGenerator<SSEEvent<TData>, void, unknown> {
    let cursor = 0;
    while (true) {
      if (finished) return;
      const event = buffer[cursor];
      if (event) {
        cursor++;
        yield event;
        continue;
      }
      if (finished) return;
      await new Promise<void>((r) => {
        resolve = r;
      });
    }
  }

  const iter = iterate();

  return {
    [Symbol.asyncIterator]() {
      return iter;
    },
    close() {
      unsubscribe?.();
      finished = true;
      resolve?.();
      resolve = null;
      state.set("disconnected");
    },
    get status() {
      return state.current;
    },
    get dropped() {
      return 0;
    },
    on(_event: "status", handler: (status: ConnectionStatus) => void) {
      return state.subscribe(handler);
    },
  };
}

/**
 * Execute a WS bidirectional channel — returns WSChannel.
 * Used for a channel the caller can send on.
 */
export function executeWSChannel<TSend, TReceive>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig>,
): WSChannel<TSend, TReceive> {
  const qTopic = qualifyTopic(topic, variables);
  const conn = getConnection(url, config);
  const state = createConnectionState();
  const dataHandlers = new Set<(data: TReceive) => void>();
  let unsubscribe: (() => void) | null = null;

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    state.set("connecting");

    conn.onStatusChange((s) => {
      forwardConnectionStatus(state, s);
    });

    if (conn.status === "connected") state.set("connected");

    unsubscribe = conn.subscribe(
      qTopic,
      (payload) => {
        for (const handler of dataHandlers) handler(payload as TReceive);
      },
      variables,
    );
  }

  return {
    send(data: TSend) {
      conn.send(qTopic, data);
    },
    on(event: "data" | "status", handler: (arg: any) => void): () => void {
      if (event === "data") {
        dataHandlers.add(handler);
        return () => dataHandlers.delete(handler);
      }
      return state.subscribe(handler);
    },
    close() {
      unsubscribe?.();
      dataHandlers.clear();
      state.set("disconnected");
    },
    get status() {
      return state.current;
    },
  };
}
