import type { HTTPError } from "../error";

export type ProxyCallerDefaults = {
  /** Full URL path to the proxy endpoint (default: "/api/request") */
  proxyUrl?: string;
  timeout?: number;
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
