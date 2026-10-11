import { groupOptionsOf } from "../../define/group-options-of";
import { groupChain } from "../../define/group-tree";
import { type ResolvedTransport, resolveTransport } from "../../http-client/resolve-transport";
import type { SourceWebSocket } from "../../http-client/source-transport";
import { SOCKET_CONNECTION_KEYS } from "../../http-client/transport-options";
import { fieldOf } from "./read-definition";

/* What a source's options give a stream's `fetch` besides its transport: the standard options of a request that stays open. */
const STREAM_REQUEST_INIT = [
  "credentials",
  "mode",
  "cache",
  "redirect",
  "referrer",
  "referrerPolicy",
  "integrity",
  "priority",
] as const;

/** How a channel opens its socket: the class, and what its options carry besides headers. */
export interface SocketTransport {
  readonly webSocket?: SourceWebSocket | undefined;
  readonly socketInit?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * The transport a call of a source goes through: each of `fetch`,
 * `webSocket`, `dispatcher`, Bun's `proxy` and `tls` and Deno's `client`
 * from the call's options when they set it, else from the nearest of the
 * groups its path names, else from the source's.
 *
 * @param api - The source
 * @param group - The call's group path; empty for the source's own endpoints
 * @param call - The call's options, as `.with()` gave them; absent for a relay, which no caller's options reach
 * @returns The transport
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` for a `fetch` or a `webSocket` that is not a function, or a `dispatcher` that is no undici `Dispatcher`
 * @example
 * ```ts
 * transportOf(api, "settlement", { dispatcher: rotated }).connection.dispatcher === rotated; // → true
 * ```
 */
export function transportOf(api: object, group: string, call?: object): ResolvedTransport {
  const chain = group === "" ? [] : groupChain(api, group);
  const groupOptions = chain?.length ? groupOptionsOf(chain) : undefined;
  const source = fieldOf(api, "options");
  return resolveTransport(typeof source === "object" && source !== null ? source : undefined, [
    groupOptions,
    call,
  ]);
}

/**
 * What a stream's `fetch` is given besides its headers — the options a
 * request that stays open takes from its source, as its calls are given
 * them, and its transport's `dispatcher`, `proxy`, `tls` and `client`.
 *
 * @param api - The source
 * @param transport - The stream's transport; the source's own when absent
 * @returns The options; empty when they set none
 * @example
 * ```ts
 * streamInitOf(defineApi({ baseURL, credentials: "include" })); // { credentials: "include" }
 * ```
 */
export function streamInitOf(
  api: object,
  transport: ResolvedTransport = transportOf(api, ""),
): RequestInit {
  return { ...picked(fieldOf(api, "options"), STREAM_REQUEST_INIT), ...transport.connection };
}

/**
 * How a channel opens its socket: the `WebSocket` class its transport
 * names, and the connection options a socket takes of it — never what
 * describes a request.
 *
 * @param transport - The channel's transport
 * @returns The class and those options; empty for the platform's socket as it is
 * @example
 * ```ts
 * socketTransportOf(transportOf(api, "live")); // { webSocket, socketInit: { dispatcher } }
 * ```
 */
export function socketTransportOf(transport: ResolvedTransport): SocketTransport {
  const socketInit = picked(transport.connection, SOCKET_CONNECTION_KEYS);
  return {
    ...(transport.webSocket && { webSocket: transport.webSocket }),
    ...(Object.keys(socketInit).length > 0 && { socketInit }),
  };
}

function picked(options: unknown, keys: readonly string[]): Record<string, unknown> {
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
