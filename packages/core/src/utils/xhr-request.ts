import { isBodilessStatus } from "../http-client/response";
import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody, WebCredentials } from "../http-client/web-types";
import { createLogger } from "../logger";
import { cancellation } from "./cancellation";
import { isRecord } from "./is-record";
import { ONCE } from "./own";
import { platformError } from "./platform-error";
import { declaredLength } from "./progress";
import { isStream, wholeBody } from "./whole-body";

const log = createLogger("XMLHttpRequest");

/** Options XMLHttpRequest cannot honour; a request that sets one is told so in development. */
const FETCH_ONLY = ["cache", "next", "mode", "redirect", "keepalive", "priority", "integrity"];

export interface XhrRequestInit {
  method: string;
  headers: Headers;
  body: WebBody | null | undefined;
  signal?: AbortSignal | null;
  credentials?: WebCredentials;
  [option: string]: unknown;
}

/** Who hears a request sent through XMLHttpRequest go out, and its answer come in. */
export interface XhrProgress {
  /** Hears the body go out */
  onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
  /** Hears the answer come in */
  onDownloadProgress?: ((progress: DownloadProgress) => void) | undefined;
}

/**
 * Send a request through XMLHttpRequest, which reports its body going out —
 * fetch cannot — and its answer coming in where the platform's `Response`
 * cannot be made of a stream to count it, as in React Native; and, in React
 * Native, for a form naming a file on the device, which XMLHttpRequest reads
 * from where it is.
 *
 * @param url - Where to send it
 * @param init - The request, as it would be given to fetch
 * @param progress - Who hears the body go out and the answer come in
 * @returns The answer, a Response of the Blob XMLHttpRequest handed over
 * @example
 * ```ts
 * const response = await xhrRequest(url, init, { onUploadProgress: (p) => bar.set(p.percent) });
 * ```
 */
export async function xhrRequest(
  url: string,
  init: XhrRequestInit,
  progress: XhrProgress = {},
): Promise<Response> {
  warnAboutIgnoredOptions(init);
  /* XMLHttpRequest cannot send a stream: handed one, it sent the text
     "[object ReadableStream]" and the call succeeded. The stream is read
     whole first, unless the call is cancelled first, and what it held is
     sent and reported. */
  const body = isStream(init.body) ? await wholeBody(init.body, init.signal) : (init.body ?? null);
  return send(url, init, body, progress);
}

function send(
  url: string,
  init: XhrRequestInit,
  body: XMLHttpRequestBodyInit | null,
  { onUploadProgress, onDownloadProgress }: XhrProgress,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(cancellation(signal));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(init.method.toUpperCase(), url);
    xhr.responseType = "blob";
    xhr.withCredentials = init.credentials === "include";
    for (const [key, value] of init.headers) xhr.setRequestHeader(key, value);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, ONCE);
    const settle = () => signal?.removeEventListener("abort", onAbort);

    /* Listened to only when asked: a listener on the upload makes a browser preflight a request
       to another origin. */
    if (onUploadProgress) {
      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        onUploadProgress({
          percent: event.total > 0 ? event.loaded / event.total : 0,
          transferredBytes: event.loaded,
          totalBytes: event.total,
        });
      });
    }
    const downloaded = onDownloadProgress && reportDownload(xhr, onDownloadProgress);
    xhr.addEventListener("load", () => {
      settle();
      const answer = bodyOf(xhr);
      downloaded?.(answer);
      const { status, statusText } = xhr;
      resolve(new Response(answer, { status, statusText, headers: headersOf(xhr) }));
    });
    xhr.addEventListener("error", () => {
      settle();
      reject(new TypeError("Network request failed"));
    });
    /* Cancelled through the signal, the request rejects with an AbortError, its reason as the
       cause, as fetch's does; without this listener the promise never settled. */
    xhr.addEventListener("abort", () => {
      settle();
      reject(cancellation(signal, platformError("The request was aborted", "AbortError")));
    });

    xhr.send(body);
  });
}

/**
 * Report the answer as XMLHttpRequest takes it in — React Native's reports
 * a download once a listener asks — against the length it declares, as a
 * body read through fetch is counted; once it has loaded, the end is
 * reported unless an event already did.
 */
function reportDownload(
  xhr: XMLHttpRequest,
  onProgress: (progress: DownloadProgress) => void,
): (answer: Blob | null) => void {
  let total: number | undefined;
  let whole = false;
  xhr.addEventListener("progress", (event) => {
    total ??= declaredLength(headersOf(xhr));
    whole = total > 0 && event.loaded >= total;
    onProgress({
      percent: total > 0 ? event.loaded / total : 0,
      transferredBytes: event.loaded,
      totalBytes: total,
    });
  });
  return (answer) => {
    if (whole) return;
    const size = answer?.size ?? 0;
    onProgress({ percent: 1, transferredBytes: size, totalBytes: size });
  };
}

/**
 * The answer's Blob, which every platform's Response reads as it reads its
 * own fetch's: React Native's — the whatwg-fetch polyfill, whose fetch asks
 * XMLHttpRequest for a Blob too — read a buffer's text as Latin-1 and
 * refused to make a Blob of one. A 204, 205 or 304 has no body at all; the
 * Response constructor refuses even an empty one.
 */
function bodyOf(xhr: XMLHttpRequest): Blob | null {
  /* Asked for a Blob, XMLHttpRequest answers with one once it has loaded. */
  const response: unknown = xhr.response;
  return isBodilessStatus(xhr.status) || !(response instanceof Blob) ? null : response;
}

function headersOf(xhr: XMLHttpRequest): Headers {
  const headers = new Headers();
  for (const line of xhr.getAllResponseHeaders().trim().split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return headers;
}

function warnAboutIgnoredOptions(init: XhrRequestInit): void {
  const runtime: unknown = Object.hasOwn(globalThis, "process")
    ? Reflect.get(globalThis, "process")
    : undefined;
  const env = isRecord(runtime) && isRecord(runtime.env) ? runtime.env : undefined;
  if (env?.NODE_ENV === "production") return;
  const ignored = FETCH_ONLY.filter((option) => init[option] !== undefined);
  if (ignored.length > 0) {
    log.warn(`${ignored.join(", ")} cannot be applied to a request sent with XMLHttpRequest`);
  }
}
