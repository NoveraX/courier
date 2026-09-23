import type { ProxyBoundary } from "../define/boundary-types";
import type { HTTPError } from "../errors";
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
   * createProxyCaller("api", {
   *   source: api,
   *   proxyPath: { ws: "ws://localhost:3001" }, // dev-only WS override
   * });
   * ```
   */
  proxyPath?: ProxyPath;
  /** API source object for transport detection — pass the defineApi() result */
  source?: Record<string, unknown>;
  /**
   * The endpoints this client may call, from `defineBoundary`. Pass this
   * instead of `source` to keep the API's definition out of the bundle —
   * a boundary carries the transports and nothing about the server.
   */
  boundary?: ProxyBoundary;
  timeout?: number;
  /**
   * Cancel a call still in flight when the same endpoint is called again; the
   * cancelled call rejects with an `HTTPError` of status 499. Defaults to the
   * source's own `deduplicate` when `source` is given.
   */
  deduplicate?: boolean;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  onError?: (error: HTTPError) => void | Promise<void>;
  onSuccess?: (data: unknown) => void | Promise<void>;
};

export type FetchCallbacks = {
  onSuccess?: (data: unknown) => void | Promise<void>;
  onError?: (error: HTTPError) => void | Promise<void>;
};

/** Untyped caller shape used internally to bypass complex CallerFn generics */
export type UntypedCallerFn = (
  source: string,
  options?: Record<string, unknown>,
) => (...args: unknown[]) => Promise<unknown>;
