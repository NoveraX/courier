import { abortReason } from "./abort-reason";
import { ONCE, UNQUEUED } from "./own-options";

/** What a stream passed on does as it passes. */
export interface Passing {
  /** Called with each chunk as its reader takes it, before the reader has it */
  took?: ((chunk: Uint8Array) => void) | undefined;
  /** Called once the source has ended, before the stream closes */
  ended?: (() => void) | undefined;
  /** Cuts the stream: the source is cancelled with its reason, and the stream errors with it */
  signal?: AbortSignal | undefined;
}

/**
 * What a stream another made holds, passed on as a stream of the global
 * class, read with the source's own reader as the stream is read. A stream
 * of Node's fetch cannot be piped through one of the global classes where
 * those are another implementation's, as Metro's polyfill under jest-expo;
 * its reader is what every implementation has alike.
 *
 * Nothing is read ahead of the stream's reader, so `took` hears a chunk
 * when that reader takes it. What `took` or `ended` throws errors the
 * stream with it, and lets the source go; so does `signal` firing, with
 * its reason. A stream cancelled cancels its source.
 *
 * @param source - The stream to pass on, unread
 * @param passing - What hears each chunk and the end, and what cuts the stream
 * @returns The stream to read in place of `source`
 * @example
 * ```ts
 * const counted = passedStream(response.body, { took: (chunk) => count(chunk.byteLength) });
 * ```
 */
export function passedStream(
  source: ReadableStream<Uint8Array>,
  passing: Passing = {},
): ReadableStream<Uint8Array> {
  const { signal } = passing;
  const reader = source.getReader();
  const letGo = (reason: unknown): void => {
    reader.cancel(reason).catch(() => undefined);
  };
  let stop: (() => void) | undefined;
  const forget = (): void => {
    if (stop) signal?.removeEventListener("abort", stop);
  };
  return new ReadableStream<Uint8Array>(
    {
      __proto__: null,
      start(controller) {
        if (!signal) return;
        stop = () => {
          const reason = abortReason(signal);
          controller.error(reason);
          letGo(reason);
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, ONCE);
      },
      async pull(controller) {
        try {
          const read = await reader.read();
          if (signal?.aborted) return;
          if (read.done) {
            forget();
            passing.ended?.();
            controller.close();
            return;
          }
          passing.took?.(read.value);
          controller.enqueue(read.value);
        } catch (error) {
          forget();
          letGo(error);
          throw error;
        }
      },
      cancel(reason: unknown) {
        forget();
        return reader.cancel(reason);
      },
    } as UnderlyingDefaultSource<Uint8Array>,
    UNQUEUED,
  );
}
