import type { PlatformFetch } from "../http-client/source-transport";
import { fetchFailure } from "../http-client/transport-failure";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { assertAbsoluteUrl } from "./absolute-url";
import { anySignal } from "./any-signal";
import { holdsDeviceFiles } from "./device-files";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { flightKey, isRead } from "./flight-key";
import { normalizeHttpMethod } from "./helpers";
import { sendWithUploadProgress, trackDownload } from "./progress";
import { answerRead, forgetRenderReads } from "./render-memo";
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
  /** Sends the request in place of the platform's `fetch`: the source's own. */
  fetch?: PlatformFetch | undefined;
  /**
   * Join an identical read already in flight, or answer it with the one the
   * render being served made, rather than send another — the default;
   * `false` sends this one alone.
   */
  coalesce?: boolean | undefined;
  /**
   * The endpoint is declared a read, whatever verb carries it, or a write:
   * which of them an identical request in flight may join. Unsaid, a request
   * sent as `GET`, `HEAD` or `QUERY` reads.
   */
  reads?: boolean | undefined;
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
    fetch: send = fetch,
    coalesce,
    reads,
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
    /* Fetch refuses a streamed body unless the request says so. React Native has no streams. */
    ...(typeof ReadableStream !== "undefined" &&
      requestBody instanceof ReadableStream && { duplex: "half" }),
  };
  /* XMLHttpRequest reports an upload's progress, which fetch cannot, and
     reads a file a React Native form names by where it is, which expo/fetch refuses. */
  const sendOnce = (sendSignal: AbortSignal | undefined): Promise<Response> => {
    const sent = sendSignal === undefined ? init : { ...init, signal: sendSignal };
    if (transport) return transport(fullUrl, sent);
    if (requestBody != null && (onUploadProgress || holdsDeviceFiles(requestBody))) {
      return sendWithUploadProgress(
        fullUrl,
        { ...sent, body: requestBody },
        onUploadProgress ?? ignoreProgress,
        { withinOrigin: withinOrigin === true && rest.redirect === undefined, fetch: send },
      );
    }
    return withinOrigin && rest.redirect === undefined
      ? fetchWithinOrigin(fullUrl, sent, send)
      : send(fullUrl, sent);
  };
  const read = isRead(init.method, reads);
  /* A write the render makes may change what its reads answered. */
  if (!read) forgetRenderReads();
  const key =
    !read || coalesce === false || onDownloadProgress || onUploadProgress
      ? undefined
      : flightKey(init.method, fullUrl, requestHeaders, requestBody, {
          ...rest,
          withinOrigin,
          fetch: send,
          transport,
        });
  let response: Response;
  try {
    response =
      key === undefined
        ? await sendOnce(finalSignal ?? undefined)
        : await answerRead(key, finalSignal ?? undefined, sendOnce);
  } catch (error) {
    throw fetchFailure(error, signal, { timeout, timedOut: expiry?.aborted === true });
  }
  return onDownloadProgress ? trackDownload(response, onDownloadProgress) : response;
}

function ignoreProgress(): void {}
