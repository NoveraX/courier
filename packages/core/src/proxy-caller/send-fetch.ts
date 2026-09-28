import { HTTPError } from "../errors";
import type { UploadProgress } from "../http-client/types";
import { studioHooks } from "../studio";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import type { RequestPayload } from "../utils/request-payload";
import { asProxyFailure, readProxyAnswer } from "./proxy-answer";

export async function sendFetch(
  method: "get" | "post",
  url: string,
  options: Record<string, unknown>,
  ctx: {
    stream: boolean;
    requestPayload: { body?: FormData; json?: Partial<RequestPayload> };
    onSuccess?: (data: unknown) => void | Promise<void>;
    onError?: (error: HTTPError) => void | Promise<void>;
  },
): Promise<unknown> {
  const fetchOptions = withUploadInstrumentation(options);
  const hasTimingHook = studioHooks.onProxyClientTiming !== undefined;
  const t0 = hasTimingHook ? performance.now() : 0;

  let response: Response | undefined;
  let tHeaders = 0;
  try {
    response = await coreFetch(method, url, fetchOptions as CoreFetchInit);
    tHeaders = hasTimingHook ? performance.now() : 0;
    const data = await readProxyAnswer(response, ctx.requestPayload, ctx.stream);
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

/** Report an upload's progress to Studio as well as to the caller. */
function withUploadInstrumentation(options: Record<string, unknown>): Record<string, unknown> {
  const onUploadProgress = options.onUploadProgress as
    | ((progress: UploadProgress) => void)
    | undefined;
  if (!onUploadProgress || !studioHooks.onUploadProgress) return options;

  const requestId = `upload_${Date.now().toString(36)}`;
  return {
    ...options,
    onUploadProgress: (progress: UploadProgress) => {
      onUploadProgress(progress);
      studioHooks.onUploadProgress?.({
        requestId,
        loaded: progress.transferredBytes,
        total: progress.totalBytes,
        percentage: progress.percent,
        timestamp: Date.now(),
      });
      if (progress.transferredBytes === progress.totalBytes) {
        studioHooks.onUploadComplete?.({ requestId, timestamp: Date.now() });
      }
    },
  };
}

function signalOf(options: Record<string, unknown>): AbortSignal | undefined {
  return options.signal instanceof AbortSignal ? options.signal : undefined;
}
