/**
 * A call's progress callbacks, and what one of them threw. Kept apart from
 * the counter of a download, which loads with the first call that reports
 * one: an upload a server counts as it streams it, and XMLHttpRequest in a
 * page or an app, hear their callbacks through this and load no counter
 * with it.
 */

import type { DownloadProgress, UploadProgress } from "../http-client/types";

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
