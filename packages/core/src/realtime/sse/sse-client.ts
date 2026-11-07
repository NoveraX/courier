import { assertAbsoluteUrl } from "../../utils/absolute-url";
import { ONCE, ownFields } from "../../utils/own";
import { type Backoff, resolveBackoff } from "../backoff";
import { CLIENT_LIMITS } from "../client-limits";
import { onResume } from "../resume-signals";
import type { SubscriptionDriver, SubscriptionSink } from "../subscription-driver";
import { SubscriptionHandle } from "../subscription-handle";
import type { Subscription } from "../subscription-types";
import { reconnectNow, runConnectionLoop, type SSEConnectionCtx } from "./sse-connection";
import { resumeStream } from "./sse-resume";
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
 * @throws {ConfigurationError} `INVALID_BACKOFF` for a backoff no wait can be drawn from
 *
 * @example
 * const sub = subscribeSSE<Notification>("/api/sse/notifications");
 * for await (const event of sub) {
 *   console.log(event.data); // typed as Notification
 * }
 */
export function subscribeSSE<TData = unknown>(
  url: string,
  given?: SubscribeSSEOptions,
): Subscription<TData> {
  /* The subscription's options, as each part of it reads them: their own. */
  const options = ownFields(given);
  assertAbsoluteUrl(url);
  const backoff = resolveBackoff(options.backoff);
  const subscription = new SubscriptionHandle<TData>(
    sseDriver<TData>(url, options, backoff),
    options.maxBufferSize,
  );
  const { signal } = options;
  if (signal?.aborted) subscription.close();
  else signal?.addEventListener("abort", () => subscription.close(), ONCE);
  return subscription;
}

/*
 * Each life of the subscription is one run of its connection loop, its
 * Last-Event-ID carried over, and the page's resume signals heard while it runs.
 */
function sseDriver<TData>(
  url: string,
  options: SubscribeSSEOptions,
  backoff: Backoff,
): SubscriptionDriver<TData> {
  let ctx: SSEConnectionCtx<TData> | undefined;
  let lastEventId = options.lastEventId;
  let unhear: (() => void) | undefined;
  const start = (sink: SubscriptionSink<TData>): void => {
    const life: SSEConnectionCtx<TData> = {
      url,
      controller: new AbortController(),
      sink,
      config: {
        headers: options.headers,
        backoff,
        heartbeatTimeout: options.heartbeatTimeout ?? CLIENT_LIMITS.SSE_SILENCE_TIMEOUT_MS,
        maxAttempts: options.maxAttempts ?? Infinity,
        parse: options.parse ?? JSON.parse,
        onResponse: options.onResponse,
        beforeConnect: options.beforeConnect,
        fetch: options.fetch,
      },
      lastEventId: ctx?.lastEventId ?? lastEventId,
      serverRetryMs: undefined,
    };
    ctx = life;
    lastEventId = life.lastEventId;
    const stop =
      options.reconnectOnResume === false
        ? undefined
        : onResume((signal) => resumeStream(life, signal));
    unhear = stop;
    void runConnectionLoop(life).finally(() => {
      stop?.();
      if (unhear === stop) unhear = undefined;
    });
  };
  return {
    open: start,
    reopen: start,
    reconnect: () => ctx && reconnectNow(ctx),
    close: () => {
      unhear?.();
      unhear = undefined;
      ctx?.controller.abort();
    },
    retry: () => ctx?.retry,
  };
}
