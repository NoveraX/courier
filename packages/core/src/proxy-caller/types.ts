import type { CourierRoutes } from "../define/routes";
import type { HTTPError } from "../errors";
import type { WebCredentials } from "../http-client/web-types";
import type { CallerWSOptions } from "../realtime/ws/ws-types";
import type { ProxyPath } from "./proxy-path";

/** The options of a page's proxy client: where the proxy is, and how its calls go. */
export type ProxyCallerOptions = {
  /**
   * Where the app serves its proxy routes, per transport. Each field is
   * optional and accepts either a relative path, resolved against the
   * page's origin, or an absolute URL; a missing one falls back to the
   * built-in default at resolution time — `/api/request` and `/api/sse`,
   * and none for a socket.
   *
   * @example
   * ```ts
   * createProxyCaller(apiRoutes, {
   *   proxyPath: { ws: "ws://localhost:3001" }, // dev-only WS override
   * });
   * ```
   */
  proxyPath?: ProxyPath | undefined;
  /**
   * How long the browser waits for the proxy, in ms. Not sent to the server,
   * where the endpoint's own `.timeout()` bounds the upstream call.
   */
  timeout?: number | undefined;
  /**
   * The reads a newer call cancels while they are still in flight — a
   * search as the user types — by their paths, such as `users.search`; the
   * cancelled call rejects with an `HTTPError` of status 499. Only a read is
   * ever cancelled — an endpoint the routes name a write is left to
   * complete. Defaults to the API's own `cancelPrevious`, which the routes
   * carry.
   */
  cancelPrevious?: readonly string[] | undefined;
  /**
   * Whether identical reads in flight together reach the proxy once, each
   * call with a copy of the answer: the default. `false` sends every call
   * alone. Defaults to the API's own `coalesce`, which the routes carry.
   */
  coalesce?: boolean | undefined;
  credentials?: WebCredentials | undefined;
  headers?: Record<string, string> | undefined;
  onError?: ((error: HTTPError) => void | Promise<void>) | undefined;
  onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
  /**
   * How the sockets of this client's channels and push subscriptions behave:
   * the token sent on connecting and when the server asks for a fresh one,
   * the reconnect backoff, how long the server may stay silent, the queue
   * limits, sub-protocols and the largest message sent.
   */
  ws?: CallerWSOptions | undefined;
};

/**
 * What a proxy client's transports are created with: the options its page
 * gives it, and the routes of its API, where it has them.
 */
export type ProxyCallerDefaults = ProxyCallerOptions & { routes?: CourierRoutes | undefined };

/**
 * What the routes say of an endpoint: a read that may be cached, which goes
 * as GET; any other read, which goes as POST, its variables kept out of the
 * address; or a write. Unsaid for a path they do not name.
 */
export type ProxyEndpointKind = "cached-read" | "read" | "mutation";

/**
 * The proxy transport's call: a source and a call's options, as the transport
 * hands them on, then an endpoint's key, its variables and what it is.
 */
export type UntypedCallerFn = (
  source: string,
  options?: Readonly<Record<string, unknown>>,
) => (endpoint: string, variables?: unknown, kind?: ProxyEndpointKind) => Promise<unknown>;
