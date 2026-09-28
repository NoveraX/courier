/**
 * Split a proxy call's options between the proxy server and the browser's
 * own request to it.
 *
 * `.with()` offers the whole `RequestInit`, and the proxy client sent all of
 * it to the server, which accepts four options and answered anything else
 * with a 400 — so `.with({ headers })` for a per-call token, or Next.js's
 * `.with({ cache: "no-store" })`, worked through `createCaller` and failed
 * the moment the same code ran in the browser. The server's options go to
 * the server; the rest shape the request the browser makes to the proxy,
 * whose `allowedHeaders` decides which headers travel further.
 */

import { ConfigurationError } from "../errors";
import type { CallOptions, UploadProgress } from "../http-client/types";

const SERVER_KEYS: ReadonlySet<string> = new Set([
  "rawData",
  "stream",
  "forwardVariables",
  "timeout",
]);

export interface ProxyCallOptions {
  /** Sent to the proxy as the call's options. */
  server: Record<string, unknown>;
  /** Other `RequestInit` fields, applied to the browser's request. */
  init: Record<string, unknown>;
  headers: Record<string, string> | undefined;
  credentials: RequestCredentials;
  timeout: number | undefined;
  proxyMethod: "GET" | "POST" | undefined;
  stream: boolean;
  cache: unknown;
  next: Record<string, unknown> | undefined;
  onUploadProgress: ((progress: UploadProgress) => void) | undefined;
  onDownloadProgress: unknown;
}

export interface ProxyCallDefaults {
  headers?: Record<string, string>;
  credentials: RequestCredentials;
  timeout?: number;
}

/**
 * Sort a call's options by who acts on them.
 *
 * @param options - The options given to `.with()` and `.raw`
 * @param defaults - The caller's own defaults
 * @returns The split options
 * @throws ConfigurationError for `prefixUrl`, which only the server may set
 */
export function splitProxyOptions(
  options: CallOptions<boolean> | undefined,
  defaults: ProxyCallDefaults,
): ProxyCallOptions {
  const {
    headers,
    credentials,
    cache,
    method,
    signal: _signal,
    onUploadProgress,
    onDownloadProgress,
    prefixUrl,
    ...rest
  } = options ?? {};
  if (prefixUrl !== undefined) {
    throw new ConfigurationError(
      "PROXY_OPTION_NOT_ALLOWED",
      "[courier] prefixUrl cannot be set on a proxy call: it would choose where the server's own request goes. Set baseURL on the source instead.",
    );
  }

  const server: Record<string, unknown> = {};
  const init: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "next") continue;
    (SERVER_KEYS.has(key) ? server : init)[key] = value;
  }
  if (server.timeout === undefined) delete server.timeout;

  return {
    server,
    init,
    headers: mergeHeaders(defaults.headers, headers),
    credentials: credentials ?? defaults.credentials,
    /* The default bounds how long the browser waits. Sent to the server as
       the call's own timeout, it replaced the endpoint's `.timeout()`. */
    timeout: typeof server.timeout === "number" ? server.timeout : defaults.timeout,
    proxyMethod: method,
    stream: server.stream === true,
    cache,
    next: (rest as { next?: Record<string, unknown> }).next,
    onUploadProgress,
    onDownloadProgress,
  };
}

function mergeHeaders(
  defaults: Record<string, string> | undefined,
  own: HeadersInit | undefined,
): Record<string, string> | undefined {
  if (!own) return defaults;
  return { ...defaults, ...Object.fromEntries(new Headers(own)) };
}
