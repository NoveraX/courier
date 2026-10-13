import { HTTPError } from "../errors";
import { studioHooks } from "../studio";
import { reportingUploads, uploadProgressOf } from "../studio/report-upload";
import {
  newStudioRequestId,
  STUDIO_REQUEST_HEADER,
  studioRequestIdOf,
} from "../studio/studio-request-id";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { isRecord } from "../utils/is-record";
import { asProxyFailure, readProxyAnswer } from "./proxy-answer";

export async function sendFetch(
  method: "get" | "post",
  url: string,
  options: Record<string, unknown>,
  ctx: {
    stream: boolean;
    /** Whether the call asked for `.raw`. */
    raw: boolean;
    onSuccess?: ((data: unknown) => void | Promise<void>) | undefined;
    onError?: ((error: HTTPError) => void | Promise<void>) | undefined;
  },
): Promise<unknown> {
  const instrumented = withUploadInstrumentation(options);
  /* A streamed answer is read as it arrives, by one reader: never shared, never kept. */
  const fetchOptions = ctx.stream ? { ...instrumented, coalesce: false } : instrumented;
  const hasTimingHook = studioHooks.onProxyClientTiming !== undefined;
  const t0 = hasTimingHook ? performance.now() : 0;

  let response: Response | undefined;
  let tHeaders = 0;
  try {
    response = await coreFetch(method, url, fetchOptions as CoreFetchInit);
    tHeaders = hasTimingHook ? performance.now() : 0;
    const data = await readProxyAnswer(response, ctx.raw, ctx.stream);
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    const failure = asProxyFailure(error, signalOf(options));
    if (failure instanceof HTTPError) await ctx.onError?.(failure);
    throw failure;
  } finally {
    if (response) emitClientTiming(response, t0, tHeaders);
  }
}

/** Parse Server-Timing header to extract courier duration (ms) */
function parseServerTimingDur(header: string): number {
  const match = /courier;dur=([\d.]+)/.exec(header);
  return match?.[1] ? parseFloat(match[1]) : 0;
}

/** Emit browser-measured network timing for proxy requests */
function emitClientTiming(response: Response, t0: number, tHeaders: number): void {
  if (t0 === 0) return;
  const tEnd = performance.now();
  const rid = response.headers.get("x-courier-rid");
  const stHeader = response.headers.get("server-timing");
  if (!rid || !stHeader) return;

  const serverDur = parseServerTimingDur(stHeader);
  const ttfb = tHeaders - t0;

  studioHooks.onProxyClientTiming?.({
    requestId: rid,
    networkLatency: Math.max(0, ttfb - serverDur),
    download: tEnd - tHeaders,
    totalRoundTrip: tEnd - t0,
    timestamp: Date.now(),
  });
}

/**
 * Report an upload's progress to Studio as well as to the caller.
 *
 * The progress is measured here, before the proxy has seen the call, so the
 * call carries the Studio request id it is reported under and the proxy
 * adopts it: Studio then shows one row for the upload and the call. An id
 * the caller named already is kept, so a caller that looks for its call by
 * that id — Studio's Playground — finds the upload too.
 */
function withUploadInstrumentation(options: Record<string, unknown>): Record<string, unknown> {
  const onUploadProgress = uploadProgressOf(options);
  if (!onUploadProgress || !studioHooks.onUploadProgress) return options;

  const headers = headersOf(options.headers);
  const requestId = studioRequestIdOf(headers) ?? newStudioRequestId();
  headers.set(STUDIO_REQUEST_HEADER, requestId);
  const routing = options.searchParams;
  const named = (key: string): string | undefined => {
    const value: unknown = isRecord(routing) ? routing[key] : undefined;
    return typeof value === "string" ? value : undefined;
  };
  return {
    ...options,
    headers,
    onUploadProgress: reportingUploads(onUploadProgress, {
      requestId,
      source: named("_s"),
      group: named("_g"),
      method: named("_m"),
    }),
  };
}

function headersOf(value: unknown): Headers {
  if (value instanceof Headers) return new Headers(value);
  const headers = new Headers();
  if (!isRecord(value)) return headers;
  for (const [name, content] of Object.entries(value)) {
    if (typeof content === "string") headers.set(name, content);
  }
  return headers;
}

function signalOf(options: Record<string, unknown>): AbortSignal | undefined {
  return options.signal instanceof AbortSignal ? options.signal : undefined;
}
