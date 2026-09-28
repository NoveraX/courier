import type { UploadProgress } from "../http-client/types";

/** Bytes handed to the network at a time. */
const CHUNK_BYTES = 64 * 1024;

/**
 * Stream a body to fetch, reporting each chunk once fetch has taken it.
 *
 * A chunk used to be reported the moment it was queued, so the events ran
 * ahead of the network — the last one fired before the server had the bytes —
 * and they kept coming after the request was cancelled, up to 100% of a body
 * the server never received. Here the stream holds nothing in reserve: fetch
 * asks for the next chunk once it has written the previous one, and that is
 * when the previous one is counted. Nothing is reported once `signal` fires.
 *
 * @param source - The body
 * @param total - Its size in bytes, or 0 when unknown
 * @param onProgress - Called as chunks are taken, and once at the end
 * @param signal - The request's signal
 * @returns The stream to give fetch as the body
 *
 * @example
 * ```ts
 * const body = countedStream(blob.stream(), blob.size, report, controller.signal);
 * await fetch(url, { method: "POST", body, duplex: "half" });
 * ```
 */
export function countedStream(
  source: ReadableStream<Uint8Array>,
  total: number,
  onProgress: (progress: UploadProgress) => void,
  signal?: AbortSignal | null,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let taken = 0;
  let handed = 0;
  let rest: Uint8Array = new Uint8Array(0);

  const report = (): void => {
    if (handed === 0 || signal?.aborted) return;
    taken += handed;
    handed = 0;
    onProgress({
      percent: total > 0 ? taken / total : 0,
      transferredBytes: taken,
      totalBytes: total,
    });
  };

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        report();
        if (rest.byteLength === 0) {
          const { done, value } = await reader.read();
          if (done) {
            /* A body of unknown size learns its size only now. */
            if (total === 0 && !signal?.aborted) {
              onProgress({ percent: 1, transferredBytes: taken, totalBytes: taken });
            }
            controller.close();
            return;
          }
          rest = value;
        }
        const chunk = rest.subarray(0, CHUNK_BYTES);
        rest = rest.subarray(chunk.byteLength);
        handed = chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel: (reason: unknown) => reader.cancel(reason),
    },
    { highWaterMark: 0 },
  );
}
