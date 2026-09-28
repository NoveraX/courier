import { createLogger } from "../logger";
import { acquireConnection } from "./caller-ws";
import { createConnectionState } from "./connection-state";
import type { RealtimeError } from "./errors";
import { forwardConnectionStatus } from "./forward-status";
import type { ConnectionStatus, WSChannel } from "./types";
import { qualifyTopic } from "./ws/topic-key";
import type { WSConnectionConfig } from "./ws/ws-types";

const log = createLogger("WS");

/**
 * Execute a WS bidirectional channel — returns WSChannel.
 * Used for a channel the caller can send on.
 *
 * What the server says about the channel reaches it: a refused message or a
 * failed handler as an `error` event, and the end of the subscription —
 * finished, or refused with a `RealtimeError` — as an `error` event where
 * there is one, then `disconnected`. A channel whose join was rejected used
 * to stay `connected`, with the reason only in the console.
 *
 * What is sent before the server has confirmed the subscription — right
 * after opening the channel, or while it rejoins after a reconnect — waits
 * for the confirmation, in order, instead of being refused as not subscribed.
 */
export function executeWSChannel<TSend, TReceive>(
  url: string,
  topic: string,
  variables?: unknown,
  config?: Partial<WSConnectionConfig>,
): WSChannel<TSend, TReceive> {
  const qTopic = qualifyTopic(topic, variables);
  const lease = acquireConnection(url, config);
  const conn = lease.connection;
  const state = createConnectionState();
  const dataHandlers = new Set<(data: TReceive) => void>();
  const errorHandlers = new Set<(error: RealtimeError) => void>();
  const early: TSend[] = [];
  let stop: (() => void) | undefined;
  let ended = false;

  function finish(error: RealtimeError | undefined): void {
    if (ended) return;
    ended = true;
    stop?.();
    stop = undefined;
    lease.release();
    if (early.length > 0) {
      log.warn(`${early.length} message(s) not sent: the channel ${qTopic} closed first`);
      early.length = 0;
    }
    if (error) for (const handler of errorHandlers) handler(error);
    dataHandlers.clear();
    errorHandlers.clear();
    state.set("disconnected");
  }

  void start();

  async function start(): Promise<void> {
    await Promise.resolve();
    if (ended) return;
    state.set("connecting");

    const unsubStatus = conn.onStatusChange((s) => {
      if (!ended) forwardConnectionStatus(state, s);
    });
    if (conn.status === "connected") state.set("connected");

    const unsubscribe = conn.subscribe(
      qTopic,
      {
        data: (payload) => {
          for (const handler of dataHandlers) handler(payload as TReceive);
        },
        error: (error) => {
          for (const handler of errorHandlers) handler(error);
        },
        end: (error) => finish(error),
      },
      variables,
    );
    stop = () => {
      unsubscribe();
      unsubStatus();
    };
    for (const data of early.splice(0)) conn.send(qTopic, data);
  }

  return {
    send(data: TSend) {
      if (ended) {
        log.warn(`Message not sent: the channel ${qTopic} has ended`);
        return false;
      }
      /* The subscribe goes out a microtask after the channel is made; sent
         before it, a message reached the server first and was refused. */
      if (!stop) {
        early.push(data);
        return true;
      }
      return conn.send(qTopic, data);
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
  } as WSChannel<TSend, TReceive>;
}

function addTo<THandler>(handlers: Set<THandler>, handler: THandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
