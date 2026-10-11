import {
  notAFunction,
  type PlatformFetch,
  platformFetchOf,
  type SourceFetch,
  type SourceWebSocket,
} from "../../http-client/source-transport";
import { fieldOf } from "./read-definition";

/* What a source's options give a stream's `fetch`: the standard options a request that stays open takes, and
   those a runtime adds — undici's `dispatcher` on Node, `proxy` and `tls` on Bun, `client` on Deno. */
const STREAM_INIT = [
  "credentials",
  "mode",
  "cache",
  "redirect",
  "referrer",
  "referrerPolicy",
  "integrity",
  "priority",
  "dispatcher",
  "proxy",
  "tls",
  "client",
] as const;

/* What a socket's options take of them: the connection's own, never what describes a request. */
const SOCKET_INIT = ["dispatcher", "proxy", "tls"] as const;

/** How a source's channels open their sockets: the class, and what its options carry besides headers. */
export interface SocketTransport {
  readonly webSocket?: SourceWebSocket | undefined;
  readonly socketInit?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * What a source's options give the `fetch` its streams open with — the
 * options a request that stays open takes, as its calls are given them.
 *
 * @param api - The source
 * @returns The options; empty when it sets none
 * @example
 * ```ts
 * streamInitOf(defineApi({ baseURL, credentials: "include" })); // { credentials: "include" }
 * ```
 */
export function streamInitOf(api: object): RequestInit {
  return picked(api, STREAM_INIT) as RequestInit;
}

/**
 * The `fetch` a source sends its requests and opens its streams with, when
 * it names one of its own.
 *
 * @param api - The source
 * @returns Its `fetch`, its answers checked to be responses, or `undefined` for the platform's
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` when what it names is not a function
 * @example
 * ```ts
 * sourceFetchOf(defineApi({ baseURL, fetch: undiciFetch })); // undiciFetch
 * ```
 */
export function sourceFetchOf(api: object): PlatformFetch | undefined {
  const own = ownTransport<SourceFetch>(api, "fetch");
  return own && platformFetchOf(own);
}

/**
 * How a source's channels open their sockets: the `WebSocket` class it
 * names, and the options a connection takes from its options.
 *
 * @param api - The source
 * @returns The class and those options; empty for the platform's socket as it is
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` when its `webSocket` is not a function
 * @example
 * ```ts
 * socketTransportOf(defineApi({ baseURL, webSocket: WebSocket, dispatcher })); // { webSocket, socketInit: { dispatcher } }
 * ```
 */
export function socketTransportOf(api: object): SocketTransport {
  const webSocket = ownTransport<SourceWebSocket>(api, "webSocket");
  const socketInit = picked(api, SOCKET_INIT);
  return {
    ...(webSocket && { webSocket }),
    ...(Object.keys(socketInit).length > 0 && { socketInit }),
  };
}

/* The source's own fetch or WebSocket class: nothing when it names none, an error for what is no function. */
function ownTransport<TFunction>(
  api: object,
  option: "fetch" | "webSocket",
): TFunction | undefined {
  const own = fieldOf(fieldOf(api, "options"), option);
  if (own === undefined) return undefined;
  if (isFunction<TFunction>(own)) return own;
  throw notAFunction(option, own);
}

function isFunction<TFunction>(value: unknown): value is TFunction {
  return typeof value === "function";
}

function picked(api: object, keys: readonly string[]): Record<string, unknown> {
  const options = fieldOf(api, "options");
  const found: Record<string, unknown> = {};
  for (const key of keys) {
    const value = fieldOf(options, key);
    if (value !== undefined) found[key] = value;
  }
  return found;
}

const owners = new WeakMap<object, number>();
let nextOwner = 0;

/**
 * What names the source a socket's transport belongs to, where sockets are
 * shared by key rather than by the options they were opened with: two
 * sources' sockets to one URL, each carrying its own client certificate or
 * proxy, are never the same socket.
 *
 * @param api - The source
 * @returns The same key for the same source, another for every other
 * @example
 * ```ts
 * const shareKey = `${headersKey}:${transportOwnerOf(api)}`;
 * ```
 */
export function transportOwnerOf(api: object): string {
  let owner = owners.get(api);
  if (owner === undefined) {
    owner = ++nextOwner;
    owners.set(api, owner);
  }
  return `source-${owner}`;
}
