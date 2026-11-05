import { assertAbsoluteUrl } from "../../utils/absolute-url";
import type { SubscriptionDriver, SubscriptionSink } from "../subscription-driver";
import { SubscriptionHandle } from "../subscription-handle";
import type { Subscription } from "../subscription-types";
import { reconnectNow, runConnectionLoop, type SSEConnectionCtx } from "./sse-connection";
import type { SubscribeSSEOptions } from "./sse-types";

/**
 * Subscribe to a Server-Sent Events stream via fetch.
 * Uses fetch (not EventSource) for custom header support (Authorization).
 * Automatically reconnects with exponential backoff and Last-Event-ID resume.
 *
 * @param url - SSE endpoint URL
 * @param options - Connection and parsing options
 * @returns The subscription — read with `on("data")` or `for await`
 * @throws {ConfigurationError} `URL_NOT_ABSOLUTE` for a path where no page resolves it
 *
 * @example
 * const sub = subscribeSSE<Notification>("/api/sse/notifications");
 * for await (const event of sub) {
 *   console.log(event.data); // typed as Notification
 * }
 */
export function subscribeSSE<TData = unknown>(
  url: string,
  options: SubscribeSSEOptions = {},
): Subscription<TData> {
  assertAbsoluteUrl(url);
  const subscription = new SubscriptionHandle<TData>(
    sseDriver<TData>(url, options),
    options.maxBufferSize,
  );
  const { signal } = options;
  if (signal?.aborted) subscription.close();
  else signal?.addEventListener("abort", () => subscription.close(), { once: true });
  return subscription;
}

/* Each life of the subscription is one run of its connection loop, its Last-Event-ID carried over. */
function sseDriver<TData>(url: string, options: SubscribeSSEOptions): SubscriptionDriver<TData> {
  let ctx: SSEConnectionCtx<TData> | undefined;
  let lastEventId = options.lastEventId;
  const start = (sink: SubscriptionSink<TData>): void => {
    ctx = {
      url,
      controller: new AbortController(),
      sink,
      config: {
        headers: options.headers,
        backoff: options.backoff,
        heartbeatTimeout: options.heartbeatTimeout ?? 45_000,
        maxAttempts: options.maxAttempts ?? Infinity,
        parse: options.parse ?? JSON.parse,
        ...(options.onResponse && { onResponse: options.onResponse }),
        ...(options.beforeConnect && { beforeConnect: options.beforeConnect }),
        ...(options.fetch && { fetch: options.fetch }),
      },
      lastEventId: ctx?.lastEventId ?? lastEventId,
      serverRetryMs: undefined,
    };
    lastEventId = ctx.lastEventId;
    void runConnectionLoop(ctx);
  };
  return {
    open: start,
    reopen: start,
    reconnect: () => ctx && reconnectNow(ctx),
    close: () => ctx?.controller.abort(),
    retry: () => ctx?.retry,
  };
}
