import type { PlatformFetch } from "../http-client/source-transport";
import { fetchFailure } from "../http-client/transport-failure";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { assertAbsoluteUrl } from "./absolute-url";
import { type Answer, platformAnswer } from "./answer";
import { anySignal } from "./any-signal";
import { attemptExpiry } from "./attempt-expiry";
import { holdsDeviceFiles } from "./device-files";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { flightKey, isRead } from "./flight-key";
import { sendableHeaders } from "./header-value";
import { isFormData, normalizeHttpMethod } from "./helpers";
import { ownFields } from "./own";
import { trackDownload } from "./progress";
import { answerRead, forgetRenderReads } from "./render-memo";
import { REQUEST_MEMBERS } from "./request-members";
import { type RequestQuery, withSearchParams } from "./search-params";
import { sendStreamed } from "./send-streamed";
import type { SharingCall } from "./shared-answer";
import { uploadWithoutProgress } from "./upload-without-progress";

export type CoreFetchInit = Omit<RequestInit, "method" | "body" | "signal"> & {
  /** What the request sends; absent, nothing unless `json` is given. */
  body?: WebBody | null | undefined;
  signal?: AbortSignal | null | undefined;
  json?: unknown;
  searchParams?: RequestQuery | undefined;
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
   * The request being served the call is made for, when the answer may set
   * that visitor's session: a read made for one never joins a read made for
   * another, however alike they are.
   */
  servedFor?: object | undefined;
  /**
   * The endpoint is declared a read, whatever verb carries it, or a write:
   * which of them an identical request in flight may join. Unsaid, a request
   * sent as `GET`, `HEAD` or `QUERY` reads.
   */
  reads?: boolean | undefined;
  /**
   * The call the request is made for, as Studio measures it: told when its
   * read is answered by another call's request. Never part of what makes
   * two requests identical.
   */
  call?: SharingCall | undefined;
};

/**
 * Send a request and hand back its answer, read through Courier's reader:
 * the body of a call that stops waiting, or whose time runs out, is cut
 * short as its request would be, and a failed read is thrown as the
 * request's own failure.
 *
 * @param method - The verb
 * @param url - Where the request goes, absolute
 * @param options - The request, and how it is sent
 * @returns The answer
 * @example
 * ```ts
 * const answer = await coreFetch("get", "https://api.example.com/users", { timeout: 5_000 });
 * const users = JSON.parse(await answer.read("text"));
 * ```
 */
export async function coreFetch(
  method: string,
  url: string,
  options: CoreFetchInit = {},
): Promise<Answer> {
  const own = ownFields(options);
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
    servedFor,
    reads,
    call,
    ...rest
  } = own;
  /* Followed within the request's origin unless the request says how itself. */
  const within = withinOrigin === true && own.redirect === undefined;

  const fullUrl = withSearchParams(url, searchParams);
  const requestHeaders = sendableHeaders(headers);

  let requestBody: WebBody | null | undefined = body;
  if (json !== undefined) {
    requestBody = JSON.stringify(json);
    if (!requestHeaders.has("content-type")) {
      requestHeaders.set("content-type", "application/json");
    }
  }
  /* A form goes under its encoding's content type, which names the boundary its parts end at,
     whichever way it is sent: one the source, the call or a middleware set would name none. */
  if (isFormData(requestBody)) requestHeaders.delete("content-type");

  assertAbsoluteUrl(fullUrl);
  const expiry = timeout ? attemptExpiry(timeout, requestBody) : undefined;
  const finalSignal = signal && expiry ? anySignal([signal, expiry]) : (expiry ?? signal);

  /* Each member the request's own: on no prototype, as a browser reads one an init does not
     have of the init's prototype, and named on Node, which reads it of the objects it builds. */
  const init = {
    __proto__: null,
    ...REQUEST_MEMBERS,
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
    const sent = sendSignal === undefined ? init : { ...init, signal: sendSignal, __proto__: null };
    if (transport) return transport(fullUrl, sent);
    /* Loaded with the first call that reports an upload or sends a device's file:
       a page that does neither never loads XMLHttpRequest's sending. */
    if (requestBody != null && (onUploadProgress || holdsDeviceFiles(requestBody))) {
      return import("./upload-progress").then(
        ({ sendWithUploadProgress }) =>
          sendWithUploadProgress(
            fullUrl,
            sent as typeof sent & { body: WebBody },
            onUploadProgress ?? ignoreProgress,
            { withinOrigin: within, fetch: send },
          ),
        (cause: unknown) => {
          uploadWithoutProgress(requestBody, cause);
          return sendPlainly(sent);
        },
      );
    }
    return sendPlainly(sent);
  };
  /* Handed over as it is, a form or a Blob — under Node 22 and 24, or to a source's own fetch,
     a stream too — is copied whole by Node's fetch for as long as it is sent; sent as the stream
     of its bytes, it is read as it goes out. A streamed upload goes with the content type that
     names its boundary. */
  const sendPlainly = (sent: typeof init): Promise<Response> => {
    const streamed =
      requestBody == null
        ? undefined
        : sendStreamed(fullUrl, sent as typeof sent & { body: WebBody }, {
            withinOrigin: within,
            fetch: send,
          });
    if (streamed) return streamed;
    return within ? fetchWithinOrigin(fullUrl, sent, send) : send(fullUrl, sent);
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
          servedFor,
        });
  /* A read that fails is classified as the request's failure is: the call's cancellation, its
     timeout, the network. */
  const failed = (error: unknown): unknown =>
    fetchFailure(error, signal, { timeout, timedOut: expiry?.aborted === true });
  let response: Response;
  try {
    response =
      key === undefined
        ? await sendOnce(finalSignal ?? undefined)
        : await answerRead(key, finalSignal ?? undefined, sendOnce, call);
  } catch (error) {
    throw failed(error);
  }
  const counted = onDownloadProgress ? trackDownload(response, onDownloadProgress) : response;
  return platformAnswer(counted, { signal: finalSignal ?? undefined, failed });
}

function ignoreProgress(): void {}
