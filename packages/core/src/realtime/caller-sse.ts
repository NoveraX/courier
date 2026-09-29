import { subscribeSSE } from "./sse/sse-client";
import type { SSESubscription } from "./types";

/** Execute SSE subscription with merged headers */
export function executeSSE<TData = unknown>(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  onResponse?: (response: Response) => void,
): SSESubscription<TData> {
  return subscribeSSE<TData>(url, {
    headers,
    signal,
    ...(onResponse && { onResponse }),
  });
}
