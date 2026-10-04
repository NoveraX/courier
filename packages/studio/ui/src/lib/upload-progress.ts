import { formatSize } from "@/lib/formatters";
import type { UploadState } from "@/store/types";

/**
 * An upload's progress as one line: how much is sent, of how much.
 *
 * @param upload - The upload's state
 * @returns For instance `"42% · 10.5 MB of 25 MB"`, or `"Sent · 25 MB"` once done
 *
 * @example
 * ```ts
 * describeUpload({ loaded: 5, total: 10, percentage: 50, done: false }) // "50% · 5 B of 10 B"
 * ```
 */
export function describeUpload(upload: UploadState): string {
  if (upload.done) return `Sent · ${formatSize(upload.total || upload.loaded)}`;
  const of = upload.total > 0 ? ` of ${formatSize(upload.total)}` : "";
  return `${upload.percentage}% · ${formatSize(upload.loaded)}${of}`;
}
