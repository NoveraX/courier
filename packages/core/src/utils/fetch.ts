import { fetchFailure } from "../http-client/transport-failure";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { normalizeHttpMethod } from "./helpers";
import { sendWithUploadProgress, trackDownload } from "./progress";

export type CoreFetchInit = Omit<RequestInit, "method"> & {
  json?: unknown;
  searchParams?: string | URLSearchParams | Record<string, string>;
  timeout?: number;
  onUploadProgress?: (progress: UploadProgress) => void;
  onDownloadProgress?: (progress: DownloadProgress) => void;
  /**
   * Follow redirects only while they stay on the request's origin — see
   * `fetchWithinOrigin`. An explicit `redirect` takes precedence.
   */
  withinOrigin?: boolean;
};

export async function coreFetch(
  method: string,
  url: string,
  options: CoreFetchInit = {},
): Promise<Response> {
  const {
    json,
    searchParams,
    body,
    headers,
    timeout,
    signal,
    onUploadProgress,
    onDownloadProgress,
    withinOrigin,
    ...rest
  } = options;

  let fullUrl = url;
  if (searchParams) {
    const paramStr =
      searchParams instanceof URLSearchParams
        ? searchParams.toString()
        : typeof searchParams === "string"
          ? searchParams
          : new URLSearchParams(searchParams as Record<string, string>).toString();
    if (paramStr) {
      fullUrl += (fullUrl.includes("?") ? "&" : "?") + paramStr;
    }
  }

  const requestHeaders =
    headers instanceof Headers ? headers : new Headers((headers as HeadersInit) || undefined);

  let requestBody: BodyInit | null | undefined = body;
  if (json !== undefined) {
    requestBody = JSON.stringify(json);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  let finalSignal: AbortSignal | null | undefined = signal;
  if (timeout) {
    const timeoutSignal = AbortSignal.timeout(timeout);
    finalSignal = finalSignal ? AbortSignal.any([finalSignal, timeoutSignal]) : timeoutSignal;
  }

  const init = {
    ...rest,
    method: normalizeHttpMethod(method),
    headers: requestHeaders,
    body: requestBody,
    ...(finalSignal != null && { signal: finalSignal }),
    /* Fetch refuses a streamed body unless the request says so. */
    ...(requestBody instanceof ReadableStream && { duplex: "half" }),
  };
  let response: Response;
  try {
    response =
      onUploadProgress && requestBody != null
        ? await sendWithUploadProgress(fullUrl, { ...init, body: requestBody }, onUploadProgress)
        : withinOrigin && rest.redirect === undefined
          ? await fetchWithinOrigin(fullUrl, init)
          : await fetch(fullUrl, init);
  } catch (error) {
    throw fetchFailure(error, signal, timeout);
  }
  return onDownloadProgress ? trackDownload(response, onDownloadProgress) : response;
}
