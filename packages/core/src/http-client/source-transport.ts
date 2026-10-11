import { ConfigurationError } from "../errors/configuration-error";

/**
 * What sends a source's requests and opens its streams in place of the
 * platform's `fetch`: called as `fetch` is, with the URL and a `RequestInit`
 * that carries everything the source's options give it, and answering with
 * a `Response`. Both are typed as no more than objects, so that a `fetch`
 * whose types name a `RequestInit` and a `Response` of its own — undici's —
 * fits as it is.
 *
 * @example
 * ```ts
 * import { Agent, fetch } from "undici"
 *
 * const mtls = new Agent({ connect: { cert, key, ca } })
 * export const payments = defineApi({
 *   baseURL: "https://payments.internal",
 *   fetch: (url, init) => fetch(url, { ...init, dispatcher: mtls }),
 * })
 * ```
 */
export type SourceFetch = (input: string, init: object) => Promise<object>;

/** `fetch` as Courier sends with it: typed as the platform's, whichever `fetch` it is. */
export type PlatformFetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The `WebSocket` class a source's channels open their sockets with, in
 * place of the platform's — undici's, which takes the `dispatcher` the
 * source's options give it: constructed with the URL and an options object
 * holding the socket's protocols, its headers and the source's connection
 * options, that `dispatcher` among them.
 *
 * @example
 * ```ts
 * import { Agent, WebSocket } from "undici"
 *
 * export const feed = defineApi({ baseURL, webSocket: WebSocket, dispatcher: new Agent({ connect: { ca } }) })
 * ```
 */
export type SourceWebSocket = new (url: string, options: SourceSocketOptions) => object;

/**
 * What a source's socket is constructed with besides its URL: its protocols
 * and its handshake's headers, and the source's connection options —
 * undici's `dispatcher` on Node, Bun's `proxy` and `tls` — as it gives them.
 */
export interface SourceSocketOptions {
  readonly protocols?: string[];
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * An undici `Dispatcher` — an `Agent` holding a client certificate, a
 * `ProxyAgent`, an `EnvHttpProxyAgent` — as far as Courier hands it on to
 * `fetch` and to the `WebSocket`, which are what call it.
 *
 * @example
 * ```ts
 * import { Agent, fetch, WebSocket } from "undici"
 *
 * export const payments = defineApi({
 *   baseURL: "https://payments.internal",
 *   dispatcher: new Agent({ connect: { ca, cert, key } }),
 *   fetch,
 *   webSocket: WebSocket,
 * })
 * ```
 */
export interface SourceDispatcher {
  dispatch(options: object, handler: object): boolean;
}

/**
 * A source's `fetch` as Courier sends with it: what it answers is checked
 * to be a `Response` — the platform's, or another `fetch`'s, undici's,
 * which is one in all but its type.
 *
 * @param send - The source's `fetch`
 * @returns The same `fetch`, typed as the platform's
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` when it is not a function, and from
 *   the returned `fetch` when it answers with something other than a `Response`
 * @example
 * ```ts
 * const send = platformFetchOf(options.fetch);
 * const response = await send(url, init);
 * ```
 */
export function platformFetchOf(send: SourceFetch): PlatformFetch {
  if (typeof send !== "function") throw notAFunction("fetch", send);
  return async (input, init) => {
    const answer = await send(input, init);
    if (isResponse(answer)) return answer;
    throw new ConfigurationError(
      "SOURCE_TRANSPORT_INVALID",
      `[courier] The source's fetch answered ${input} with something that is not a Response.`,
    );
  };
}

/**
 * The error for a source's `fetch` or `webSocket` that is not a function.
 *
 * @param option - Which of the two
 * @param value - What the source gave
 * @returns The error
 * @example
 * ```ts
 * if (typeof own !== "function") throw notAFunction("webSocket", own);
 * ```
 */
export function notAFunction(option: "fetch" | "webSocket", value: unknown): ConfigurationError {
  return new ConfigurationError(
    "SOURCE_TRANSPORT_INVALID",
    `[courier] A source's ${option} must be a function; it is ${value === null ? "null" : typeof value}.`,
  );
}

/**
 * Refuse, where a source is defined, a `fetch` or a `webSocket` given as
 * something other than a function.
 *
 * @param options - The source's options
 * @throws {ConfigurationError} `SOURCE_TRANSPORT_INVALID` for either that is not a function
 * @example
 * ```ts
 * assertSourceTransport({ fetch: undiciFetch, webSocket: UndiciWebSocket });
 * ```
 */
export function assertSourceTransport(options: {
  readonly fetch?: unknown;
  readonly webSocket?: unknown;
}): void {
  for (const option of ["fetch", "webSocket"] as const) {
    const value = options[option];
    if (value !== undefined && typeof value !== "function") throw notAFunction(option, value);
  }
}

function isResponse(value: object): value is Response {
  return (
    typeof Reflect.get(value, "status") === "number" &&
    typeof Reflect.get(value, "headers") === "object" &&
    "body" in value
  );
}
