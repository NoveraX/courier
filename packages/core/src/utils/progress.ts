/**
 * Progress for a call's answer coming in; its body going out is reported
 * by `upload-progress.ts`, which a call loads only when it reports one.
 *
 * `onDownloadProgress`, offered on every call, was once never called at all
 * — a progress bar wired to it stayed at zero with no error.
 */

import type { DownloadProgress } from "../http-client/types";

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
