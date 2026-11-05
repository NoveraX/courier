import { ConnectionError } from "../realtime/errors";
import { lazyChannel, lazySubscription } from "./lazy-subscription";
import type { SSEFactory, WSChannelFactory } from "./types";

/* The subscription and channel a lazy factory hands back, which a relay builds on too. */
export { lazyChannel, lazySubscription };

/**
 * What a call is refused for before anything is loaded or opened — an
 * endpoint this process serves, a path parameter left empty, an option the
 * call may not set — so it throws where the call is made, as it did before
 * the client was loaded lazily.
 */
type Check = (
  group: string,
  method: string,
  variables: unknown,
  options: Readonly<Record<string, unknown>>,
) => void;

type Factory<TOpened> = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
) => TOpened;

/**
 * A stream factory whose client code is loaded on the first subscription.
 *
 * The browser's proxy client carried the whole SSE and WebSocket client in
 * every bundle, a third of it for an application that makes no stream call
 * at all. The subscription is handed back at once, as before: it reports
 * `connecting` and takes listeners while the client loads, then hands them
 * to the one that loaded.
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
  return lazyFactory(load, lazySubscription, check);
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
  return lazyFactory(load, lazyChannel, check);
}

/* The factory loaded once, on the first call; what it opens is handed back
   at once as `lazy` makes it. */
function lazyFactory<TOpened>(
  load: () => Promise<Factory<TOpened>>,
  lazy: (opening: Promise<TOpened>) => TOpened,
  check?: Check,
): Factory<TOpened> {
  let loading: Promise<Factory<TOpened>> | undefined;
  return (group, method, variables, options) => {
    check?.(group, method, variables, options);
    loading ??= load();
    return lazy(
      loading.then(
        (create) => create(group, method, variables, options),
        /* Only a client that failed to load is reported as one; what the
           loaded factory throws is passed on as it is. */
        (error: unknown) => {
          throw new ConnectionError(`The realtime client could not be loaded: ${String(error)}`);
        },
      ),
    );
  };
}
