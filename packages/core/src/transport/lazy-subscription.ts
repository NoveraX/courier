import { ConfigurationError } from "../errors/configuration-error";
import { createLogger } from "../logger";
import { ConnectionError, RealtimeError } from "../realtime/realtime-error";
import { retryOf, shareRetry } from "../realtime/retry-of";
import type { Subscription, SubscriptionEvent, WSChannel } from "../realtime/subscription-types";
import type { ConnectionStatus } from "../realtime/types";

const log = createLogger("Stream");
const EVENTS: readonly string[] = ["data", "error", "status", "open", "close"];

/**
 * How many messages a channel keeps while its client loads: as many as its
 * socket's queue keeps (`LIMITS.MAX_QUEUE_COUNT`), named here rather than
 * imported, so a page that opens no stream does not load the limits.
 */
export const MAX_WAITING = 100;

/* A listener added before the real subscription came, and how to stop it once it is on that one. */
type Pending = [event: SubscriptionEvent, listener: never, stop?: () => void];

type Lazy = Subscription<unknown> & { send?: WSChannel<unknown, unknown>["send"] };

/**
 * A subscription handed back at once for one whose client is still loading.
 * Kept small, as it is what a page carries before any stream opens: it
 * reports `connecting` and keeps its listeners, and once the real
 * subscription arrives hands them to it — from then on every event is the
 * real one's own. A status the real one reached before is said once.
 *
 * @param opening - The subscription being opened
 * @returns A subscription that becomes it
 * @example
 * ```ts
 * const sub = lazySubscription(import("../realtime/sse").then((m) => m.subscribeSSE(url)));
 * ```
 */
export function lazySubscription(opening: Promise<Subscription<unknown>>): Subscription<unknown> {
  return lazyOf(opening);
}

/**
 * A channel handed back at once for one whose client is still loading, as
 * {@link lazySubscription}; what is sent before it arrives waits for it.
 *
 * @param opening - The channel being opened
 * @returns A channel that becomes it
 */
export function lazyChannel(
  opening: Promise<WSChannel<unknown, unknown>>,
): WSChannel<unknown, unknown> {
  /* Made to send, it has `send`. */
  return lazyOf(opening, true) as WSChannel<unknown, unknown>;
}

function lazyOf(opening: Promise<Subscription<unknown>>, sends?: boolean): Lazy {
  let real: WSChannel<unknown, unknown> | undefined;
  let failure: Error | undefined;
  let closed = false;
  let pending: Pending[] = [];
  let waiting: unknown[] = [];
  /* As a subscription tells its own: a listener that throws keeps the event from none of the others. */
  const tell = (event: SubscriptionEvent, value: unknown): void => {
    for (const [named, listener] of [...pending]) {
      if (named !== event) continue;
      try {
        (listener as (value: unknown) => void)(value);
      } catch (error) {
        log.error(`A subscription's ${event} listener failed`, error);
      }
    }
  };
  /* What ended before the real one came: a close, or `error`. */
  const end = (error?: RealtimeError): void => {
    if (error) tell("error", error);
    tell("status", "disconnected");
    tell("close", error ? { reason: "failed", error } : { reason: "closed" });
  };
  const loaded = opening.then(
    (subscription) => {
      /* A channel's opening gives a channel: the one shape `send` is read from. */
      real = subscription as WSChannel<unknown, unknown>;
      if (closed) return real.close();
      for (const entry of pending) entry[2] = real.on(entry[0], entry[1]);
      for (const data of waiting.splice(0)) real.send(data);
      if (real.status !== "connecting") tell("status", real.status);
    },
    (error: unknown) => {
      failure = error instanceof Error ? error : new ConnectionError(String(error));
      end(failure instanceof RealtimeError ? failure : new ConnectionError(failure.message));
    },
  );
  const subscription: Lazy = {
    on(event, listener) {
      if (!EVENTS.includes(event)) {
        throw new ConfigurationError(
          "UNKNOWN_EVENT",
          `[courier] A subscription has no "${String(event)}" event`,
        );
      }
      if (real) return real.on(event, listener);
      const entry: Pending = [event, listener as never];
      pending.push(entry);
      return () => {
        pending = pending.filter((kept) => kept !== entry);
        entry[2]?.();
      };
    },
    async *[Symbol.asyncIterator]() {
      await loaded;
      if (!real) throw failure;
      if (!closed) yield* real;
    },
    reconnect: () => real?.reconnect(),
    close() {
      if (closed) return;
      closed = true;
      waiting = [];
      if (real) real.close();
      else end();
    },
    get status(): ConnectionStatus {
      return real?.status ?? (closed || failure ? "disconnected" : "connecting");
    },
    get dropped(): number {
      return real?.dropped ?? 0;
    },
  };
  if (sends) {
    subscription.send = (data) => {
      if (real) return real.send(data);
      if (closed || failure) return false;
      if (waiting.length >= MAX_WAITING) {
        log.warn("Message not sent: no room is left while the channel's client loads");
        return false;
      }
      waiting.push(data);
      return true;
    };
  }
  /* Why it reconnects is the real one's: a relay watches the subscription it was handed. */
  shareRetry(subscription, () => real && retryOf(real));
  return subscription;
}
