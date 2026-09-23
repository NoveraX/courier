import { HTTPError } from "../errors";
import { getResponseData } from "../http-client/response";
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
      /* The unread body, or with `.raw` the response around it — as in direct
         mode, where handing back the whole Response was a third shape. */
      const streamed = wantsRaw(ctx.requestPayload)
        ? { status: response.status, headers: response.headers, data: response.body }
        : response.body;
      await ctx.onSuccess?.(streamed);
      return streamed;
    }

    /* The proxy answers a bodiless upstream status with an empty body, which
       `response.json()` reads as a syntax error — a raw SyntaxError that no
       `isHTTPError` check recognises, for the most common shape a write
       returns. Direct mode reads the same answer as `null`. */
    const body = await getResponseData(response, "json");
    const data = wantsRaw(ctx.requestPayload) ? withHeaders(body) : body;
    emitClientTiming(response, t0, tHeaders);
    await ctx.onSuccess?.(data);
    return data;
  } catch (error) {
    if (error instanceof HTTPError) throw error;
    throw error;
  }
}

function wantsRaw(requestPayload: { body?: FormData; json?: Partial<RequestPayload> }): boolean {
  const { options } = parseRequestPayload(requestPayload.body || requestPayload.json);
  return options?.rawData === true;
}

/** `.raw` promises `Headers`; over the wire they travel as a plain object. */
function withHeaders(envelope: unknown): unknown {
  if (typeof envelope !== "object" || envelope === null || !("headers" in envelope)) {
    return envelope;
  }
  const { headers } = envelope as { headers: unknown };
  if (headers instanceof Headers || typeof headers !== "object" || headers === null) {
    return envelope;
  }
  return { ...envelope, headers: new Headers(headers as Record<string, string>) };
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
