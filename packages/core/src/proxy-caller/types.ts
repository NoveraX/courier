import type { ExposablePath, KindAt, ProxyBoundary } from "../define/boundary-types";
import type { HTTPError } from "../errors";
import type { WebCredentials } from "../http-client/web-types";
import type { CallerWSOptions } from "../realtime/ws/ws-types";
import type { ProxyPath } from "./proxy-path";

export type ProxyCallerDefaults = {
  /**
   * Per-transport proxy endpoint configuration. Each field is optional and
   * accepts either a relative path or an absolute URL. When the caller
   * provides `source`, missing fields fall back to `source.options.proxyPath`
   * (per-transport merge), then to built-in defaults at resolution time.
   *
   * @example
   * ```ts
   * createProxyCaller<typeof api>("api", {
   *   boundary,
   *   proxyPath: { ws: "ws://localhost:3001" }, // dev-only WS override
   * });
   * ```
   */
  proxyPath?: ProxyPath;
  /**
   * The API's definition, the `defineApi()` result, for code on the server.
   * In a browser bundle pass `boundary` instead: the definition would ship
   * with the page.
   */
  source?: Record<string, unknown>;
  /**
   * The endpoints this client may call, from `defineBoundary`. Pass this
   * instead of `source` to keep the API's definition out of the bundle —
   * a boundary carries the transports and nothing about the server.
   */
  boundary?: ProxyBoundary;
  /**
   * How long the browser waits for the proxy, in ms. Not sent to the server,
   * where the endpoint's own `.timeout()` bounds the upstream call.
   */
  timeout?: number;
  /**
   * Cancel a call still in flight when the same endpoint is called again; the
   * cancelled call rejects with an `HTTPError` of status 499. Only a read is
   * ever cancelled — an endpoint the source or the boundary declares a write
   * is left to complete. Defaults to the source's own `deduplicate` when
   * `source` is given.
   */
  deduplicate?: boolean;
  credentials?: WebCredentials;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
  /**
   * How the sockets of this client's channels and push subscriptions behave:
   * the token sent on connecting and when the server asks for a fresh one,
   * the reconnect backoff, how long the server may stay silent, the queue
   * limits, sub-protocols and the largest message sent.
   */
  ws?: CallerWSOptions;
};

/**
 * The proxy transport's call: a source and a call's options, as the transport
 * hands them on, then an endpoint's key and its variables.
 */
export type UntypedCallerFn = (
  source: string,
  options?: Readonly<Record<string, unknown>>,
) => (endpoint: string, variables?: unknown, reads?: boolean) => Promise<unknown>;

/** Does the API declare an endpoint reached by opening a stream or a socket? */
type HasRealtime<TApi> = [
  Extract<KindAt<TApi, ExposablePath<TApi>>, "stream" | "channel">,
] extends [never]
  ? false
  : true;

/**
 * The options argument of `createProxyCaller`, required for an API with
 * streams or channels.
 *
 * The type argument names each endpoint's transport, but only a runtime
 * value — `source` or `boundary` — tells the client which endpoints to open
 * as a stream or a socket. Without one, a stream typed as a subscription went
 * out as a plain HTTP request whose result had none of its members.
 */
export type ProxyCallerArguments<TApi> =
  HasRealtime<TApi> extends true
    ? [
        defaults: ProxyCallerDefaults &
          ({ source: Record<string, unknown> } | { boundary: ProxyBoundary }),
      ]
    : [defaults?: ProxyCallerDefaults];
