/**
 * Progress for a call's answer coming in, counted as its body is read:
 * loaded with the first call that reports one, so a page that never does
 * never loads it. An answer XMLHttpRequest brings is reported as it
 * arrives, against the length it declares. What a callback of either way
 * throws is kept on the call's progress, as `heard` keeps it, and the call
 * fails with it.
 *
 * `onDownloadProgress`, offered on every call, was once never called at all
 * — a progress bar wired to it stayed at zero with no error.
 */

import type { DownloadProgress } from "../http-client/types";
import { type CallProgress, heard } from "./call-progress";
import { passedStream } from "./passed-stream";
import type { BodyCounter } from "./read-body";

/**
 * The counter of a call's download: each answer's body passed on as a
 * stream of the global class, which reports it chunk by chunk as its reader
 * reads it — Courier's, or the reader of a call that reads it itself.
 *
 * The total is the length the answer declares — see `declaredLength` — and
 * when it has none, the end is reported once it arrives. What `given`
 * throws fails the read, and is kept on the call's progress when that is
 * given.
 *
 * @param given - Called with each chunk that is read
 * @param kept - The call's progress, which keeps what `given` throws
 * @returns What counts each answer's body
 * @example
 * ```ts
 * const counted = downloadCounter(onProgress)(response.body, response.headers);
 * ```
 */
export function downloadCounter(
  given: (progress: DownloadProgress) => void,
  kept?: CallProgress,
): BodyCounter {
  const onProgress = kept ? heard(kept, given) : given;
  return (body, headers) => {
    const total = declaredLength(headers);
    let received = 0;
    return passedStream(body, {
      took(chunk) {
        received += chunk.byteLength;
        onProgress({
          percent: total > 0 ? received / total : 0,
          transferredBytes: received,
          totalBytes: total,
        });
      },
      /* Without a declared length every event said 0%, the last one too, so a
         progress bar never finished; the end is reported once it arrives. */
      ended() {
        if (total > 0) return;
        onProgress({ percent: 1, transferredBytes: received, totalBytes: received });
      },
    });
  };
}

/**
 * The length an answer declares of the body its reader sees: its
 * `content-length`, or 0 when it declares none — or is compressed, when
 * that length counts bytes the reader never sees.
 *
 * @param headers - The answer's headers
 * @returns The length, or 0
 * @example
 * ```ts
 * declaredLength(new Headers({ "content-length": "2048" })); // → 2048
 * ```
 */
export function declaredLength(headers: Headers): number {
  if (headers.has("content-encoding")) return 0;
  return Number(headers.get("content-length")) || 0;
}
