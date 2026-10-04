import type { UploadProgress } from "../http-client/types";
import { studioHooks } from "./singleton";

/** The endpoint an upload is for, as Studio names its row. */
export interface UploadCall {
  requestId: string;
  source?: string | undefined;
  group?: string | undefined;
  method?: string | undefined;
}

/**
 * The caller's progress callback, reporting each step to Studio as well.
 *
 * Studio is told the percentage on a 0–100 scale under the call's request id,
 * with the endpoint it is for, so a row can show the upload even before the
 * call's other events reach it; the last step also reports completion.
 *
 * @param onUploadProgress - The caller's own callback
 * @param call - The request id and the endpoint the upload is for
 * @returns The callback to hand the transport
 * @example
 * ```ts
 * options.onUploadProgress = reportingUploads(options.onUploadProgress, { requestId, source: "api", method: "upload" });
 * ```
 */
export function reportingUploads(
  onUploadProgress: (progress: UploadProgress) => void,
  call: UploadCall,
): (progress: UploadProgress) => void {
  return (progress) => {
    onUploadProgress(progress);
    studioHooks.onUploadProgress?.({
      ...call,
      loaded: progress.transferredBytes,
      total: progress.totalBytes,
      percentage: Math.round(progress.percent * 100),
      timestamp: Date.now(),
    });
    if (progress.percent >= 1) {
      studioHooks.onUploadComplete?.({ requestId: call.requestId, timestamp: Date.now() });
    }
  };
}

/**
 * The caller's upload callback, when its options carry one.
 *
 * @param options - A call's options
 * @returns The callback, or `undefined`
 * @example
 * ```ts
 * uploadProgressOf({ onUploadProgress: console.log }); // → console.log
 * ```
 */
export function uploadProgressOf(
  options: object | undefined,
): ((progress: UploadProgress) => void) | undefined {
  const callback: unknown = options ? Reflect.get(options, "onUploadProgress") : undefined;
  return typeof callback === "function"
    ? (progress: UploadProgress) => {
        Reflect.apply(callback, undefined, [progress]);
      }
    : undefined;
}
