import { ConnectionError, RealtimeError } from "../realtime/errors";
import type { ConnectionStatus, SSEEvent, SSESubscription, WSChannel } from "../realtime/types";
import { Listeners } from "./listeners";
import type { SSEFactory, WSChannelFactory } from "./types";

/**
 * What a call is refused for before anything is loaded or opened — an
 * endpoint this process serves, a path parameter left empty — so it throws
 * where the call is made, as it did before the client was loaded lazily.
 */
type Check = (group: string, method: string, variables: unknown) => void;

/**
 * A stream factory whose client code is loaded on the first subscription.
 *
 * The browser's proxy client carried the whole SSE and WebSocket client in
 * every bundle, a third of it for an application that makes no stream call
 * at all. The subscription is handed back at once, as before: it reports
 * `connecting` and takes listeners while the client loads, then follows the
 * one that loaded.
 *
 * @param load - Loads the factory; called once, on the first subscription
 * @param check - Refuses a call at once, before anything loads
 * @returns A factory with the loaded one's behaviour
 * @example
 * ```ts
 * const sse = lazySSEFactory(async () => (await import("./proxy/sse")).createProxySSEFactory("api"));
 * ```
 */
export function lazySSEFactory(load: () => Promise<SSEFactory>, check?: Check): SSEFactory {
  const factory = once(load);
  return (group, method, variables, options) => {
    check?.(group, method, variables);
    return lazySubscription(
      opened(factory(), (create) => create(group, method, variables, options)),
    );
  };
}

/**
 * A channel factory whose client code is loaded on the first channel. A
 * message sent while it loads waits, as it waits for a socket to open.
 *
 * @param load - Loads the factory; called once, on the first channel
 * @param check - Refuses a call at once, before anything loads
 * @returns A factory with the loaded one's behaviour
 * @example
 * ```ts
 * const ws = lazyWSChannelFactory(async () => (await import("./proxy/ws")).createProxyWSChannelFactory("api"));
 * ```
 */
export function lazyWSChannelFactory(
  load: () => Promise<WSChannelFactory>,
  check?: Check,
): WSChannelFactory {
  const factory = once(load);
  return (group, method, variables, options) => {
    check?.(group, method, variables);
    return lazyChannel(opened(factory(), (create) => create(group, method, variables, options)));
  };
}

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () => {
    loading ??= load();
    return loading;
  };
}

/* Only a client that failed to load is reported as one; what the loaded
   factory throws is passed on as it is. */
function opened<TFactory, TOpened>(
  loading: Promise<TFactory>,
  open: (factory: TFactory) => TOpened,
): Promise<TOpened> {
  return loading.then(open, (error: unknown) => {
    throw new ConnectionError(`The realtime client could not be loaded: ${String(error)}`);
  });
}

/**
 * A subscription handed back at once for one still being opened: it reports
 * `connecting` and holds listeners until the real one arrives.
 *
 * @param opening - The subscription being opened
 * @returns A subscription that follows it
 * @example
 * ```ts
 * const sub = lazySubscription(import("../realtime/sse").then((m) => m.subscribeSSE(url)));
 * ```
 */
export function lazySubscription(
  opening: Promise<SSESubscription<unknown>>,
): SSESubscription<unknown> {
  const listeners = new Listeners<{ status: ConnectionStatus }>();
  let real: SSESubscription<unknown> | undefined;
  let failure: { error: unknown } | undefined;
  let closed = false;
  const loaded = opening.then(
    (sub) => {
      real = sub;
      sub.on("status", (status) => listeners.emit("status", status));
      /* A status it reached before it was followed is said once. */
      if (closed) sub.close();
      else if (sub.status !== "connecting") listeners.emit("status", sub.status);
      return sub;
    },
    (error: unknown) => {
      failure = { error };
      listeners.emit("status", "disconnected");
      return undefined;
    },
  );
  async function* events(): AsyncGenerator<SSEEvent<unknown>, void, unknown> {
    const sub = await loaded;
    if (!sub) throw failure?.error;
    if (closed) return;
    yield* sub;
  }
  return {
    [Symbol.asyncIterator]: events,
    close: () => {
      closed = true;
      real?.close();
    },
    get status(): ConnectionStatus {
      return real?.status ?? (closed || failure ? "disconnected" : "connecting");
    },
    get dropped(): number {
      return real?.dropped ?? 0;
    },
    on: listeners.add,
  };
}

/**
 * A channel handed back at once for one still being opened: it holds
 * listeners and what is sent until the real one arrives.
 *
 * @param opening - The channel being opened
 * @returns A channel that follows it
 * @example
 * ```ts
 * const ch = lazyChannel(import("../realtime/ws-channel-client").then((m) => m.executeWSChannel(url, topic, vars)));
 * ```
 */
export function lazyChannel(
  opening: Promise<WSChannel<unknown, unknown>>,
): WSChannel<unknown, unknown> {
  const listeners = new Listeners<{
    data: unknown;
    status: ConnectionStatus;
    error: RealtimeError;
  }>();
  const waiting: unknown[] = [];
  let real: WSChannel<unknown, unknown> | undefined;
  let failed = false;
  let closed = false;
  opening.then(
    (channel) => {
      real = channel;
      channel.on("data", (data) => listeners.emit("data", data));
      channel.on("status", (status) => listeners.emit("status", status));
      channel.on("error", (error) => listeners.emit("error", error));
      if (closed) {
        channel.close();
        return;
      }
      /* A status it reached before it was followed is said once. */
      if (channel.status !== "connecting") listeners.emit("status", channel.status);
      for (const message of waiting.splice(0)) channel.send(message);
    },
    (error: unknown) => {
      failed = true;
      waiting.length = 0;
      const reason = error instanceof RealtimeError ? error : new ConnectionError(String(error));
      listeners.emit("error", reason);
      listeners.emit("status", "disconnected");
    },
  );
  return {
    send: (data) => {
      if (real) return real.send(data);
      if (closed || failed) return false;
      waiting.push(data);
      return true;
    },
    on: listeners.add,
    close: () => {
      closed = true;
      real?.close();
    },
    get status(): ConnectionStatus {
      return real?.status ?? (closed || failed ? "disconnected" : "connecting");
    },
  };
}
