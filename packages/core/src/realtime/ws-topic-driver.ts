import { LIMITS } from "../adapter/limits";
import { createLogger } from "../logger";
import { acquireConnection, type ConnectionLease, leaseWhenFound } from "./caller-ws";
import { RealtimeError } from "./errors";
import { retryOf } from "./retry-of";
import type { SubscriptionDriver, SubscriptionSink } from "./subscription-driver";
import { qualifyTopic } from "./ws/topic-key";
import type { WSConnectionConfig } from "./ws/ws-types";

const log = createLogger("WS");

/** What runs a subscription to one topic of a shared socket, and sends on it. */
export interface TopicDriver<TData> extends SubscriptionDriver<TData> {
  send(data: unknown): boolean;
}

/**
 * Run a subscription to a topic on the pooled socket for its URL and
 * options: open while the server runs it — once it confirmed the subscribe,
 * not once the socket opened — waiting while the socket reconnects, and
 * ended as the server ended it or the connection was refused for good. The
 * socket's options may still be being found — whose session it opens with,
 * on a server — and the subscription takes its socket once they are.
 *
 * What is sent before the socket is had waits for it, within the limits a
 * socket's queue has; what is sent before the server confirms the
 * subscription waits on the socket for the confirmation.
 *
 * @param url - The WebSocket URL
 * @param topic - The endpoint's topic, qualified here by the variables
 * @param variables - The subscription's variables
 * @param config - The socket's options, or a promise of them
 * @returns The driver
 */
export function topicDriver<TData>(
  url: string,
  topic: string,
  variables: unknown,
  config:
    | Partial<WSConnectionConfig>
    | Promise<Partial<WSConnectionConfig> | undefined>
    | undefined,
): TopicDriver<TData> {
  const qTopic = qualifyTopic(topic, variables);
  let lease: ConnectionLease | undefined;
  let stop: (() => void) | undefined;
  let early: unknown[] = [];
  let live = false;

  function attach(taken: ConnectionLease, sink: SubscriptionSink<TData>): void {
    lease = taken;
    const conn = taken.connection;
    const unsubStatus = conn.onStatusChange((status) => {
      if (status === "reconnecting") sink.reconnecting();
      else if (status === "connecting") sink.connecting();
    });
    const unsubscribe = conn.subscribe(
      qTopic,
      {
        data: (payload) => sink.data({ data: payload as TData }),
        error: (error) => sink.error(error),
        open: (info) => sink.open(info),
        wait: (error) => {
          if (error) sink.error(error);
        },
        end: (error) => {
          release();
          sink.end(error);
        },
      },
      variables,
    );
    stop = () => {
      unsubscribe();
      unsubStatus();
    };
    for (const data of early.splice(0)) conn.send(qTopic, data);
  }

  function release(): void {
    live = false;
    stop?.();
    stop = undefined;
    lease?.release();
    lease = undefined;
  }

  function start(sink: SubscriptionSink<TData>): void {
    live = true;
    if (!(config instanceof Promise)) {
      attach(acquireConnection(url, config), sink);
      return;
    }
    void leaseWhenFound(url, config).then((taken) => {
      if (taken instanceof RealtimeError) {
        live = false;
        sink.end(taken);
      } else if (live) {
        attach(taken, sink);
      } else {
        taken.release();
      }
    });
  }

  return {
    open: start,
    reopen: start,
    reconnect: () => lease?.connection.reconnect(),
    close() {
      if (early.length > 0)
        log.warn(`${early.length} message(s) not sent: the channel ${qTopic} closed first`);
      early = [];
      release();
    },
    retry: () => lease && retryOf(lease.connection),
    send(data) {
      if (!live) {
        log.warn(`Message not sent: the channel ${qTopic} has ended`);
        return false;
      }
      if (lease) return lease.connection.send(qTopic, data);
      if (early.length >= LIMITS.MAX_QUEUE_COUNT) {
        log.warn(`Message not sent: the channel ${qTopic} has no room to keep it while it opens`);
        return false;
      }
      early.push(data);
      return true;
    },
  };
}
