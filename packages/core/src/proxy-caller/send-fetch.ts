import { HTTPError } from "../errors";
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
  const { onDownloadProgress: _dp, ...fetchOptions } = options;
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
    const failure = asProxyFailure(error);
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
