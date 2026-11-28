import { fetchFailure } from "../http-client/transport-failure";
import type { WebBody } from "../http-client/web-types";
import { assertAbsoluteUrl } from "./absolute-url";
import { type Answer, loadCounter, platformAnswer } from "./answer";
import { anySignal } from "./any-signal";
import { attemptExpiry } from "./attempt-expiry";
import type { CallProgress } from "./call-progress";
import type { CoreFetchInit } from "./core-fetch-init";
import { holdsDeviceFiles } from "./device-files";
import { fetchWithinOrigin } from "./fetch-within-origin";
import { flightKey, isRead } from "./flight-key";
import { sendableHeaders } from "./header-value";
import { isFormData, normalizeHttpMethod } from "./helpers";
import { keptWithinOrigin } from "./kept-within-origin";
import { ownFields } from "./own";
import { answerRead, forgetRenderReads } from "./render-memo";
import { REQUEST_MEMBERS } from "./request-members";
import { responseTakesStreams } from "./response-takes-streams";
import { withSearchParams } from "./search-params";
import { sendStreamed } from "./send-streamed";
import { assertStreamingFetch } from "./streamed-answer";
import { withoutProgress } from "./without-progress";

/**
 * Send a request and hand back its answer, read through Courier's reader:
 * the body of a call that stops waiting, or whose time runs out, is cut
 * short as its request would be, a failed read is thrown as the request's
 * own failure, and what a progress callback throws, as it was thrown.
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
    streamed,
    ...rest
  } = own;

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
  /* Refused before it is sent where its answer cannot be read as it comes. */
  if (streamed) assertStreamingFetch(transport ?? send);
  /* What sends each hop of a call kept within its request's origin, unless the request says how
     it follows redirects itself or the platform keeps it there; refused where neither can. */
  const within =
    withinOrigin === true && own.redirect === undefined
      ? keptWithinOrigin(send, requestBody)
      : undefined;
  const expiry = timeout ? attemptExpiry(timeout, requestBody) : undefined;
  const finalSignal = signal && expiry ? anySignal([signal, expiry]) : (expiry ?? signal);
  /* The call's progress callbacks, and what one of them throws, kept by whichever way the call
     goes: the call fails with it, as it was thrown. */
  const progress: CallProgress = { onUploadProgress, onDownloadProgress };

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
  /* XMLHttpRequest reports an upload's progress, which fetch cannot; reads a file a React
     Native form names by where it is, which expo/fetch refuses; and reports a download where no
     Response of the platform's can be made of the body to count it, as in React Native. It
     stands in for the platform's fetch alone, as a source's own sends every call, and never
     for a call that reads its answer as it comes, which it would hand over only whole, nor for
     one kept within its origin, whose every redirect it would follow. */
  const throughXhr =
    transport === undefined &&
    send === fetch &&
    streamed !== true &&
    !within &&
    Object.hasOwn(globalThis, "XMLHttpRequest") &&
    ((requestBody != null && (onUploadProgress !== undefined || holdsDeviceFiles(requestBody))) ||
      (onDownloadProgress !== undefined && !responseTakesStreams()));
  /* Any other download is counted as it is read, by code loaded alongside the request with the
     first call that reports one. */
  const counting =
    throughXhr || onDownloadProgress === undefined
      ? undefined
      : loadCounter(onDownloadProgress, progress);
  const sendOnce = (sendSignal: AbortSignal | undefined): Promise<Response> => {
    const sent = sendSignal === undefined ? init : { ...init, signal: sendSignal, __proto__: null };
    if (transport) return transport(fullUrl, sent);
    if (!throughXhr) return sendPlainly(sent);
    /* Loaded with the first call that needs it: a page that never does never loads it. */
    return import("./xhr-request").then(
      ({ xhrRequest }) => xhrRequest(fullUrl, sent, progress),
      (cause: unknown) => {
        withoutProgress(cause, requestBody);
        return sendPlainly(sent);
      },
    );
  };
  /* Handed over as it is, a form or a Blob — under Node 22 and 24, or to a source's own fetch,
     a stream too — is copied whole by Node's fetch for as long as it is sent; sent as the stream
     of its bytes, it is read as it goes out, and counted when the call reports its upload, as a
     server has no XMLHttpRequest. A streamed upload goes with the content type that names its
     boundary. */
  const sendPlainly = (sent: typeof init): Promise<Response> => {
    const asStream =
      requestBody == null
        ? undefined
        : sendStreamed(fullUrl, sent as typeof sent & { body: WebBody }, {
            progress,
            withinOrigin: within !== undefined,
            fetch: within ?? send,
          });
    if (asStream) return asStream;
    return within ? fetchWithinOrigin(fullUrl, sent, within) : send(fullUrl, sent);
  };
  const read = isRead(init.method, reads);
  /* A write the render makes may change what its reads answered. */
  if (!read) forgetRenderReads();
  const key =
    !read || coalesce === false || streamed || onDownloadProgress || onUploadProgress
      ? undefined
      : flightKey(init.method, fullUrl, requestHeaders, requestBody, {
          ...rest,
          withinOrigin,
          fetch: send,
          transport,
          servedFor,
        });
  /* A read that fails is classified as the request's failure is: the call's cancellation, its
     timeout, the network — unless a progress callback threw, while the caller still waited. */
  const failed = (error: unknown): unknown =>
    progress.thrown && !signal?.aborted
      ? progress.thrown.value
      : fetchFailure(error, signal, { timeout, timedOut: expiry?.aborted === true });
  let response: Response;
  try {
    response =
      key === undefined
        ? await sendOnce(finalSignal ?? undefined)
        : await answerRead(key, finalSignal ?? undefined, sendOnce, call);
  } catch (error) {
    throw failed(error);
  }
  const counter = await counting;
  return platformAnswer(response, { signal: finalSignal ?? undefined, failed, counter });
}
