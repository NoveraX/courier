/**
 * Progress for a call's answer coming in, counted as its body is read:
 * loaded with the first call that reports one, so a page that never does
 * never loads it. An answer XMLHttpRequest brings is reported as it
 * arrives, against the length it declares. What a callback of either way
 * throws is kept on the call's progress, and the call fails with it.
 *
 * `onDownloadProgress`, offered on every call, was once never called at all
 * — a progress bar wired to it stayed at zero with no error.
 */

import type { DownloadProgress, UploadProgress } from "../http-client/types";
import type { BodyCounter } from "./read-body";

/**
 * A call's progress callbacks, and what one of them threw, kept here by the
 * way the call went once one has: the call fails with that, as it was
 * thrown. Counted on a stream, a throw ends the stream and fetch fails as
 * though the network had, which a retry policy sends the call again for;
 * heard by XMLHttpRequest, a throw reaches no one.
 */
export interface CallProgress {
  /** Hears the body go out */
  readonly onUploadProgress?: ((progress: UploadProgress) => void) | undefined;
  /** Hears the answer come in */
  readonly onDownloadProgress?: ((progress: DownloadProgress) => void) | undefined;
  /** What a callback threw, once one has */
  thrown?: { readonly value: unknown } | undefined;
}

/**
 * One of a call's progress callbacks, called so that what it throws is kept
 * on the call's progress before it goes on: the stream it counts ends with
 * it, or XMLHttpRequest ends the request.
 *
 * @param progress - The call's progress, which keeps what the callback throws
 * @param callback - The callback
 * @returns The callback, keeping what it throws
 * @example
 * ```ts
 * const report = heard(progress, onDownloadProgress);
 * ```
 */
export function heard<TProgress>(
  progress: CallProgress,
  callback: (report: TProgress) => void,
): (report: TProgress) => void {
  return (report) => {
    try {
      callback(report);
    } catch (error) {
      progress.thrown ??= { value: error };
      throw error;
    }
  };
}

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
