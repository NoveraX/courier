import { isBodilessStatus } from "../http-client/response";
import type { UploadProgress } from "../http-client/types";
import type { WebBody, WebCredentials } from "../http-client/web-types";
import { createLogger } from "../logger";
import { isRecord } from "./is-record";

const log = createLogger("Upload");

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

/**
 * Send a request through XMLHttpRequest, for its upload progress events —
 * fetch has none.
 *
 * @param url - Where to send it
 * @param init - The request, as it would be given to fetch
 * @param onProgress - Called as the body is sent
 * @returns The answer as a Response
 */
export async function xhrRequest(
  url: string,
  init: XhrRequestInit,
  onProgress: (progress: UploadProgress) => void,
): Promise<Response> {
  warnAboutIgnoredOptions(init);
  /* XMLHttpRequest cannot send a stream: handed one, it sent the text
     "[object ReadableStream]" and the call succeeded. The stream is read
     into a Blob, which it sends and reports. */
  const body =
    init.body instanceof ReadableStream
      ? await new Response(init.body).blob()
      : (init.body ?? null);
  return send(url, init, body, onProgress);
}

function send(
  url: string,
  init: XhrRequestInit,
  body: XMLHttpRequestBodyInit | null,
  onProgress: (progress: UploadProgress) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const signal = init.signal;
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(init.method.toUpperCase(), url);
    xhr.responseType = "arraybuffer";
    xhr.withCredentials = init.credentials === "include";
    for (const [key, value] of init.headers) {
      /* The browser writes a multipart body's content type, with its boundary. */
      if (!(body instanceof FormData && key === "content-type")) xhr.setRequestHeader(key, value);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const settle = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress({
        percent: event.total > 0 ? event.loaded / event.total : 0,
        transferredBytes: event.loaded,
        totalBytes: event.total,
      });
    });
    xhr.addEventListener("load", () => {
      settle();
      resolve(toResponse(xhr));
    });
    xhr.addEventListener("error", () => {
      settle();
      reject(new TypeError("Network request failed"));
    });
    /* Cancelled through the signal, the request rejects with its reason, as
       fetch does; without this listener the promise never settled. */
    xhr.addEventListener("abort", () => {
      settle();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    });

    xhr.send(body);
  });
}

/** A 204, 205 or 304 has no body at all; the Response constructor refuses even an empty one. */
function toResponse(xhr: XMLHttpRequest): Response {
  const headers = new Headers();
  for (const line of xhr.getAllResponseHeaders().trim().split("\r\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  /* Read as `arraybuffer`, the answer is a buffer, or null when there is none. */
  const response: unknown = xhr.response;
  const body = isBodilessStatus(xhr.status) || !(response instanceof ArrayBuffer) ? null : response;
  return new Response(body, { status: xhr.status, statusText: xhr.statusText, headers });
}

function warnAboutIgnoredOptions(init: XhrRequestInit): void {
  const runtime: unknown = Reflect.get(globalThis, "process");
  const env = isRecord(runtime) && isRecord(runtime.env) ? runtime.env : undefined;
  if (env?.NODE_ENV === "production") return;
  const ignored = FETCH_ONLY.filter((option) => init[option] !== undefined);
  if (ignored.length > 0) {
    log.warn(`${ignored.join(", ")} cannot be applied to an upload with progress (XMLHttpRequest)`);
  }
}
