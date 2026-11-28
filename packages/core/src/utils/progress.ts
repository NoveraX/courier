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
import type { BodyCounter } from "./read-body";

/**
 * The counter of a call's download: for each answer, a stream that reports
 * its body as it passes through, chunk by chunk. The answer is the
 * platform's own still: the body is piped through this as it is read.
 *
 * The total is the length the answer declares — see `declaredLength` — and
 * when it has none, the end is reported once it arrives. What `given`
 * throws ends the stream, and is kept on the call's progress when that is
 * given.
 *
 * @param given - Called with each chunk that passes
 * @param kept - The call's progress, which keeps what `given` throws
 * @returns What makes, of an answer's headers, the stream its body is piped through
 * @example
 * ```ts
 * const counted = response.body.pipeThrough(downloadCounter(onProgress)(response.headers));
 * ```
 */
export function downloadCounter(
  given: (progress: DownloadProgress) => void,
  kept?: CallProgress,
): BodyCounter {
  const onProgress = kept ? heard(kept, given) : given;
  return (headers) => {
    const total = declaredLength(headers);
    let received = 0;
    return new TransformStream<Uint8Array, Uint8Array>({
      __proto__: null,
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
    } as Transformer<Uint8Array, Uint8Array>);
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
