import { assertTransportOptions } from "./assert-transport-options";
import {
  type PlatformFetch,
  platformFetchOf,
  type SourceFetch,
  type SourceWebSocket,
} from "./source-transport";
import {
  FETCH_CONNECTION_KEYS,
  TRANSPORT_KEYS,
  type TransportKey,
  type TransportOwner,
} from "./transport-options";

/** How one call reaches its server, each option taken from the nearest layer that sets it. */
export interface ResolvedTransport {
  /** The `fetch` it sends with, its answers checked; `undefined` for the platform's. */
  readonly fetch?: PlatformFetch | undefined;
  /** The `WebSocket` class it connects with; `undefined` for the platform's. */
  readonly webSocket?: SourceWebSocket | undefined;
  /** What `fetch` and the `WebSocket` are handed: `dispatcher`, Bun's `proxy` and `tls`, Deno's `client`. */
  readonly connection: Readonly<Record<string, unknown>>;
  /**
   * Names the transport where sockets are shared by key: empty when every
   * option is the source's own, otherwise the same for the same options
   * and another for any other — so a group's or a call's certificate never
   * rides a socket opened with another.
   */
  readonly key: string;
}

/* Whose each layer is, for what a transport that cannot send is refused with. */
const OWNERS: readonly TransportOwner[] = ["source", "group", "call"];
const wrapped = new WeakMap<SourceFetch, PlatformFetch>();
const ids = new WeakMap<object, number>();
let lastId = 0;

/**
 * The transport a call goes through: from the source's options, a group's,
 * then the call's own, each of `fetch`, `webSocket`, `dispatcher`, `proxy`,
 * `tls` and `client` taken from the last that sets it.
 *
 * @param source - The source's options
 * @param overrides - The group's settings, then the call's options; either may be absent
 * @returns The transport
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` for a `fetch` or a `webSocket` that
 *   is not a function, or a `dispatcher` that is no undici `Dispatcher`, naming whose it is
 * @example
 * ```ts
 * const transport = resolveTransport(api.options, [groupOptions, callOptions]);
 * await transport.fetch?.(url, { ...init, ...transport.connection });
 * ```
 */
export function resolveTransport(
  source: object | undefined,
  overrides: readonly (object | undefined)[] = [],
): ResolvedTransport {
  const layers = [source, ...overrides];
  const chosen = new Map<TransportKey, unknown>();
  let overridden = false;
  layers.forEach((layer, at) => {
    if (layer !== undefined) assertTransportOptions(layer, OWNERS[at] ?? "call");
    for (const key of TRANSPORT_KEYS) {
      const value = layer === undefined ? undefined : Reflect.get(layer, key);
      if (value === undefined) continue;
      chosen.set(key, value);
      if (at > 0) overridden = true;
    }
  });
  const send = chosen.get("fetch");
  const webSocket = chosen.get("webSocket");
  const connection: Record<string, unknown> = {};
  for (const key of FETCH_CONNECTION_KEYS) {
    if (chosen.has(key)) connection[key] = chosen.get(key);
  }
  return {
    ...(typeof send === "function" && { fetch: sendingFetch(send as SourceFetch) }),
    ...(typeof webSocket === "function" && { webSocket: webSocket as SourceWebSocket }),
    connection,
    /* Read only where sockets are shared by key, never on a call's way out. */
    get key() {
      return overridden ? keyOf(chosen) : "";
    },
  };
}

/**
 * A `fetch` given as an option, as Courier sends with it: its answers
 * checked to be a `Response`. The same function is wrapped once.
 *
 * @param send - The `fetch` the source, a group or a call gives
 * @returns It, typed as the platform's
 * @example
 * ```ts
 * const send = sendingFetch(undiciFetch);
 * ```
 */
export function sendingFetch(send: SourceFetch): PlatformFetch {
  let platform = wrapped.get(send);
  if (platform === undefined) {
    platform = platformFetchOf(send);
    wrapped.set(send, platform);
  }
  return platform;
}

/* The same options give the same key: objects and functions by identity, strings as written. */
function keyOf(chosen: ReadonlyMap<TransportKey, unknown>): string {
  return TRANSPORT_KEYS.map((key) => `${key}=${idOf(chosen.get(key))}`).join(";");
}

function idOf(value: unknown): string {
  if (value === undefined) return "";
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return JSON.stringify(value);
  }
  let id = ids.get(value);
  if (id === undefined) {
    id = ++lastId;
    ids.set(value, id);
  }
  return `#${id}`;
}
