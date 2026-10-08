import { fetchFailure } from "../http-client/transport-failure";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { assertAbsoluteUrl } from "./absolute-url";
import { anySignal } from "./any-signal";
import { holdsDeviceFiles } from "./device-files";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { normalizeHttpMethod } from "./helpers";
import { sendWithUploadProgress, trackDownload } from "./progress";
import { timeoutSignal } from "./timeout-signal";

export type CoreFetchInit = Omit<RequestInit, "method" | "body" | "signal"> & {
  /** What the request sends; absent, nothing unless `json` is given. */
  body?: WebBody | null | undefined;
  signal?: AbortSignal | null | undefined;
  json?: unknown;
  searchParams?: string | URLSearchParams | Record<string, string> | undefined;
  timeout?: number | undefined;
  onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
  onDownloadProgress?: ((progress: DownloadProgress) => void) | undefined;
  /**
   * Follow redirects only while they stay on the request's origin — see
   * `fetchWithinOrigin`. An explicit `redirect` takes precedence.
   */
  withinOrigin?: boolean | undefined;
  /**
   * Sends the request in place of `fetch`: the route a proxy caller takes
   * to the proxy of the server it runs in, without leaving the process.
   */
  transport?: ((url: string, init: RequestInit) => Promise<Response>) | undefined;
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
    transport,
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

  let requestBody: WebBody | null | undefined = body;
  if (json !== undefined) {
    requestBody = JSON.stringify(json);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }

  assertAbsoluteUrl(fullUrl);
  const expiry = timeout ? timeoutSignal(timeout) : undefined;
  const finalSignal = signal && expiry ? anySignal([signal, expiry]) : (expiry ?? signal);

  const init = {
    ...rest,
    method: normalizeHttpMethod(method),
    headers: requestHeaders,
    body: requestBody ?? null,
    ...(finalSignal != null && { signal: finalSignal }),
    /* Fetch refuses a streamed body unless the request says so. React Native has no streams. */
    ...(typeof ReadableStream !== "undefined" &&
      requestBody instanceof ReadableStream && { duplex: "half" }),
  };
  let response: Response;
  try {
    /* XMLHttpRequest reports an upload's progress, which fetch cannot, and
       reads a file a React Native form names by where it is, which expo/fetch refuses. */
    response = transport
      ? await transport(fullUrl, init)
      : requestBody != null && (onUploadProgress || holdsDeviceFiles(requestBody))
        ? await sendWithUploadProgress(
            fullUrl,
            { ...init, body: requestBody },
            onUploadProgress ?? ignoreProgress,
            { withinOrigin: withinOrigin === true && rest.redirect === undefined },
          )
        : withinOrigin && rest.redirect === undefined
          ? await fetchWithinOrigin(fullUrl, init)
          : await fetch(fullUrl, init);
  } catch (error) {
    throw fetchFailure(error, signal, { timeout, timedOut: expiry?.aborted === true });
  }
  return onDownloadProgress ? trackDownload(response, onDownloadProgress) : response;
}

function ignoreProgress(): void {}
