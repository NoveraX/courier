import { HTTPError } from "../errors";
import { studioHooks } from "../studio";
import type { CoreFetchInit } from "../utils/fetch";
import { coreFetch } from "../utils/fetch";
import { parseRequestPayload, type RequestPayload } from "../utils/request-payload";

export function buildHttpError(
  status: number,
  headers: Headers,
  responseData: unknown,
  requestPayload: { body?: FormData; json?: Partial<RequestPayload> },
): HTTPError {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  const { rawData } = options ?? {};

  const data =
    rawData && typeof responseData === "object" && responseData !== null && "data" in responseData
      ? (responseData as { data: unknown }).data
      : responseData;

  return new HTTPError({ status, headers, data });
}

export async function readErrorResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { success: false, message: `HTTP ${response.status}` };
  }
}

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

  try {
    const response = await coreFetch(method, url, fetchOptions as CoreFetchInit);
    const tHeaders = hasTimingHook ? performance.now() : 0;

    if (!response.ok) {
      const responseData = await readErrorResponse(response);
      emitClientTiming(response, t0, tHeaders);
      const httpError = buildHttpError(
        response.status,
        response.headers,
        responseData,
        ctx.requestPayload,
      );
      await ctx.onError?.(httpError);
      throw httpError;
    }

    if (ctx.stream) {
      await ctx.onSuccess?.(response);
      return response;
    }

    const data = await response.json();
    emitClientTiming(response, t0, tHeaders);
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw error;
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
