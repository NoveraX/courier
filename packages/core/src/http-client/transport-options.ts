import type { SourceDispatcher, SourceFetch, SourceWebSocket } from "./source-transport";

/**
 * How a source, a group of its endpoints, or one call reaches its server:
 * the `fetch` and the `WebSocket` it sends with, and what they are handed —
 * undici's `dispatcher` on Node, Bun's `proxy` and `tls`, Deno's `client`.
 * Each is taken on its own from the call that sets it, else from the
 * nearest group that does, else from the source, else the platform's.
 *
 * @example
 * ```ts
 * import { Agent, fetch, WebSocket } from "undici"
 *
 * const settlement = defineGroup({
 *   prefix: "settlement",
 *   dispatcher: new Agent({ connect: { pfx, passphrase, minVersion: "TLSv1.2" } }),
 *   fetch,
 *   webSocket: WebSocket,
 *   endpoints: { pay: endpoint.post("payments") },
 * })
 * ```
 *
 * A type rather than an interface, as the other option types are: options
 * written with it stay assignable to `Record<string, unknown>`.
 */
export type TransportOptions = {
  /**
   * Sends the requests and opens the streams in place of the platform's
   * `fetch` — undici's `fetch`, which takes the `dispatcher` that carries a
   * client certificate or a proxy; a Cloudflare service binding's `fetch`;
   * one that records. Whatever else the transport gives — a `dispatcher`,
   * Bun's `proxy` and `tls`, Deno's `client` — reaches it in its `init`. In
   * a browser and in React Native an upload that reports its progress goes
   * through `XMLHttpRequest`, which can report it, instead.
   */
  fetch?: SourceFetch | undefined;
  /**
   * The `WebSocket` class channels open their sockets with, in place of the
   * platform's — undici's, constructed with the `dispatcher` the transport
   * gives.
   */
  webSocket?: SourceWebSocket | undefined;
  /**
   * The undici `Dispatcher` requests, streams and sockets go through on
   * Node — an `Agent` holding a client certificate or an authority of its
   * own, a `ProxyAgent`, an `EnvHttpProxyAgent` — handed to `fetch` and to
   * the `WebSocket`. Take `fetch` and `webSocket` from the same undici:
   * Node's own refuses a dispatcher of another major version.
   */
  dispatcher?: SourceDispatcher | undefined;
  /** Bun: the proxy requests and sockets go through, `http://proxy.corp:3128`. */
  proxy?: string | object | undefined;
  /** Bun: the TLS requests and sockets use — `ca`, `cert`, `key`, `passphrase`. */
  tls?: object | undefined;
  /** Deno: the `Deno.HttpClient` requests and streams go through, from `Deno.createHttpClient()`. */
  client?: object | undefined;
};

/** The name of an option that says how a call reaches its server. */
export type TransportKey = keyof TransportOptions;

/** Every option that says how a call reaches its server. */
export const TRANSPORT_KEYS: readonly TransportKey[] = [
  "fetch",
  "webSocket",
  "dispatcher",
  "proxy",
  "tls",
  "client",
];

/** What a transport hands `fetch` in its `init`: the connection's options, never a request's. */
export const FETCH_CONNECTION_KEYS: readonly TransportKey[] = [
  "dispatcher",
  "proxy",
  "tls",
  "client",
];

/** What a transport hands the `WebSocket`: Deno's sockets take no `client`. */
export const SOCKET_CONNECTION_KEYS: readonly TransportKey[] = ["dispatcher", "proxy", "tls"];

/** Whose transport options a message names. */
export type TransportOwner = "source" | "group" | "call";
