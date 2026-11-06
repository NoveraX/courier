import { sendableHeaders } from "../utils/header-value";
import { isRecord } from "../utils/is-record";
import {
  newStudioRequestId,
  STUDIO_REQUEST_HEADER,
  studioRequestIdOf,
} from "../utils/studio-request-id";
import type { StudioHooks } from "./hooks";
import { reportingUploads, uploadProgressOf } from "./report-upload";

/* The proxy's own time, as its `Server-Timing` names it. */
function parseServerTimingDur(header: string): number {
  const match = /courier;dur=([\d.]+)/.exec(header);
  return match?.[1] ? parseFloat(match[1]) : 0;
}

/**
 * Tell Studio how a proxy call's time split: the way to the proxy and
 * back, the proxy's own work, and the download — when the proxy said
 * which call it answered and how long it took.
 *
 * @param hooks - The hooks Studio listens on
 * @param response - The proxy's answer
 * @param t0 - When the call was sent
 * @param tHeaders - When the answer's headers arrived
 * @example
 * ```ts
 * proxyClientTiming(hooks, response, t0, performance.now());
 * ```
 */
export function proxyClientTiming(
  hooks: StudioHooks,
  response: Response,
  t0: number,
  tHeaders: number,
): void {
  if (t0 === 0) return;
  const tEnd = performance.now();
  const rid = response.headers.get("x-courier-rid");
  const stHeader = response.headers.get("server-timing");
  if (!rid || !stHeader) return;
  const serverDur = parseServerTimingDur(stHeader);
  const ttfb = tHeaders - t0;
  hooks.onProxyClientTiming?.({
    requestId: rid,
    networkLatency: Math.max(0, ttfb - serverDur),
    download: tEnd - tHeaders,
    totalRoundTrip: tEnd - t0,
    timestamp: Date.now(),
  });
}

/**
 * A proxy call's options, its upload's progress told to Studio too, under
 * the request id the call sends the proxy so the proxy's events and the
 * upload's land in one row.
 *
 * @param hooks - The hooks Studio listens on
 * @param options - The proxy call's options
 * @returns The options to send the call with
 * @example
 * ```ts
 * const instrumented = proxyUploads(hooks, options);
 * ```
 */
export function proxyUploads(
  hooks: StudioHooks,
  options: Record<string, unknown>,
): Record<string, unknown> {
  const onUploadProgress = uploadProgressOf(options);
  if (!onUploadProgress || !hooks.onUploadProgress) return options;
  const headers = sendableHeaders(options.headers);
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
    onUploadProgress: reportingUploads(hooks, onUploadProgress, {
      requestId,
      source: named("_s"),
      group: named("_g"),
      method: named("_m"),
    }),
  };
}
