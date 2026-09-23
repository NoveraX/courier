/**
 * Progress for a request's body going out and its answer coming in.
 *
 * `onUploadProgress` worked only for a proxy call in a browser, and
 * `onDownloadProgress`, offered on every call, was never called at all — a
 * progress bar wired to either stayed at zero with no error.
 */

import type { DownloadProgress, UploadProgress } from "../http-client/types";
import { type XhrRequestInit, xhrRequest } from "./xhr-request";

/** Bytes handed to the network at a time when there is no XMLHttpRequest. */
const CHUNK_BYTES = 64 * 1024;

/**
 * Send a request, reporting its body's progress.
 *
 * In a browser that is XMLHttpRequest, whose upload events fetch lacks.
 * Elsewhere the body is encoded once, to learn its size, and sent as a stream
 * reported as the network takes each chunk.
 *
 * @param url - Where to send it
 * @param init - The request, as it would be given to fetch
 * @param onProgress - Called as the body is sent
 * @returns The answer
 */
export async function sendWithUploadProgress(
  url: string,
  init: XhrRequestInit,
  onProgress: (progress: UploadProgress) => void,
): Promise<Response> {
  if (typeof XMLHttpRequest !== "undefined") return xhrRequest(url, init, onProgress);

  const encoded = new Response(init.body ?? null);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const headers = new Headers(init.headers);
  const contentType = encoded.headers.get("content-type");
  /* A multipart body's type carries the boundary the encoding just chose. */
  if (contentType && (init.body instanceof FormData || !headers.has("content-type"))) {
    headers.set("content-type", contentType);
  }
  headers.set("content-length", String(bytes.byteLength));

  return fetch(url, {
    ...(init as RequestInit),
    headers,
    body: countedStream(bytes, onProgress),
    duplex: "half",
  } as RequestInit);
}

function countedStream(
  bytes: Uint8Array,
  onProgress: (progress: UploadProgress) => void,
): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes.byteLength) {
        controller.close();
        return;
      }
      const chunk = bytes.subarray(sent, sent + CHUNK_BYTES);
      sent += chunk.byteLength;
      controller.enqueue(chunk);
      onProgress({
        percent: sent / bytes.byteLength,
        transferredBytes: sent,
        totalBytes: bytes.byteLength,
      });
    },
  });
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
    }),
  );
  return new Response(counted, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
