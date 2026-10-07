import type { WebCredentials } from "../http-client/web-types";
import { subscribeSSE } from "./sse/sse-client";
import type { SSESubscription } from "./types";

/** What a proxied stream is opened with. */
export interface ProxiedStreamOptions {
  /** The caller's headers */
  readonly headers?: Record<string, string> | undefined;
  /** Whether the browser sends its cookies to the proxy route, as the caller's calls do */
  readonly credentials?: WebCredentials | undefined;
}

/**
 * Open a stream through the proxy route, with the caller's headers, and
 * with the browser's cookies where the caller sends them with its calls.
 *
 * @param url - The proxy route's stream URL, the call in its query
 * @param options - The caller's headers and credentials
 * @returns The subscription
 * @example
 * ```ts
 * executeSSE("/api/sse?_s=api&_m=feed", { credentials: "include" });
 * ```
 */
export function executeSSE<TData = unknown>(
  url: string,
  options: ProxiedStreamOptions = {},
): SSESubscription<TData> {
  const { headers, credentials } = options;
  return subscribeSSE<TData>(url, {
    headers,
    ...(credentials && { beforeConnect: () => ({ init: { credentials } }) }),
  });
}
