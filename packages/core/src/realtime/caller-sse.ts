import type { WebCredentials } from "../http-client/web-types";
import { fetchWithinOrigin } from "../utils/fetch-within-origin";
import { subscribeSSE } from "./sse/sse-client";
import type { SSESubscription } from "./types";

/** What a proxied stream is opened with. */
export interface ProxiedStreamOptions {
  /** The caller's headers */
  readonly headers?: Record<string, string> | undefined;
  /** Whether the browser sends its cookies to the proxy route, as the caller's calls do */
  readonly credentials?: WebCredentials | undefined;
  /** Headers made afresh for each connection, a reconnection's included */
  readonly connectHeaders?: (() => Record<string, string>) | undefined;
  /** Follow a redirect only while it stays on the stream's origin — see `fetchWithinOrigin` */
  readonly withinOrigin?: boolean | undefined;
}

/**
 * Open a stream through the proxy route, with the caller's headers, and
 * with the browser's cookies where the caller sends them with its calls;
 * what holds for one connection only is made again for each.
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
  const { headers, credentials, connectHeaders, withinOrigin } = options;
  const send = withinOrigin ? { fetch: sendWithinOrigin } : {};
  if (!credentials && !connectHeaders) return subscribeSSE<TData>(url, { headers, ...send });
  return subscribeSSE<TData>(url, {
    headers,
    ...send,
    beforeConnect: () => ({
      ...(credentials && { init: { credentials } }),
      ...(connectHeaders && { headers: connectHeaders() }),
    }),
  });
}

/* Each connection's request, and every hop it is redirected through on its own origin. */
function sendWithinOrigin(url: string, init: RequestInit): Promise<Response> {
  return fetchWithinOrigin(url, init);
}
