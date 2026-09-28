/**
 * Progress for a request's body going out and its answer coming in.
 *
 * `onUploadProgress` worked only for a proxy call in a browser, and
 * `onDownloadProgress`, offered on every call, was never called at all — a
 * progress bar wired to either stayed at zero with no error.
 */

import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { WebBody } from "../http-client/web-types";
import { countedStream } from "./counted-stream";
import { sendUpload } from "./upload-redirects";
import { toUploadSource } from "./upload-source";
import { type XhrRequestInit, xhrRequest } from "./xhr-request";

/**
 * Send a request, reporting its body's progress.
 *
 * In a browser that is XMLHttpRequest, whose upload events fetch lacks.
 * Elsewhere the body is streamed to fetch without being read into memory
 * first, and reported as fetch takes each chunk.
 *
 * @param url - Where to send it
 * @param init - The request, as it would be given to fetch; its body is set
 * @param onProgress - Called as the body is sent
 * @returns The answer
 */
export async function sendWithUploadProgress(
  url: string,
  init: XhrRequestInit & { body: WebBody },
  onProgress: (progress: UploadProgress) => void,
): Promise<Response> {
  if (typeof XMLHttpRequest !== "undefined") return xhrRequest(url, init, onProgress);

  const source = toUploadSource(init.body);
  const headers = new Headers(init.headers);
  /* A multipart body's type carries the boundary its encoding chose. */
  if (source.contentType && (init.body instanceof FormData || !headers.has("content-type"))) {
    headers.set("content-type", source.contentType);
  }
  if (source.replayable) headers.set("content-length", String(source.size));

  const request = { ...(init as RequestInit), method: init.method, headers };
  return sendUpload(url, request, source, (stream) =>
    countedStream(stream, source.size, onProgress, init.signal),
  );
}

/**
 * Report an answer's body as it is read.
 *
 * The total is `content-length`, or 0 when it is unknown — including a
 * compressed answer, whose length counts bytes the reader never sees.
 *
 * @param response - The answer
 * @param onProgress - Called with each chunk read
 * @returns An equivalent answer whose body reports its progress
 */
export function trackDownload(
  response: Response,
  onProgress: (progress: DownloadProgress) => void,
): Response {
  if (!response.body) return response;
  const declared = Number(response.headers.get("content-length") ?? 0);
  const total = response.headers.has("content-encoding") ? 0 : declared;
  let received = 0;
  const counted = response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        onProgress({
          percent: total > 0 ? received / total : 0,
          transferredBytes: received,
          totalBytes: total,
        });
        controller.enqueue(chunk);
      },
      /* Without a declared length every event said 0%, the last one too, so a
         progress bar never finished; the end is reported once it arrives. */
      flush() {
        if (total > 0) return;
        onProgress({ percent: 1, transferredBytes: received, totalBytes: received });
      },
    }),
  );
  return new Response(counted, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
