import type { DownloadProgress, UploadProgress } from "../http-client/types";
import { normalizeHttpMethod } from "./helpers";
import { sendWithUploadProgress, trackDownload } from "./progress";

export type CoreFetchInit = Omit<RequestInit, "method"> & {
  json?: unknown;
  searchParams?: string | URLSearchParams | Record<string, string>;
  timeout?: number;
  onUploadProgress?: (progress: UploadProgress) => void;
  onDownloadProgress?: (progress: DownloadProgress) => void;
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
  };
  const response =
    onUploadProgress && requestBody != null
      ? await sendWithUploadProgress(fullUrl, { ...init, body: requestBody }, onUploadProgress)
      : await fetch(fullUrl, init);
  return onDownloadProgress ? trackDownload(response, onDownloadProgress) : response;
}
