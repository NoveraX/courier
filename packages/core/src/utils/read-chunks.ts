import { abortReason } from "./abort-reason";
import { ONCE } from "./own-options";

/**
 * Read a stream to its end with its own reader, handing each chunk on as it
 * comes. A stream's reader is what every implementation of web streams has
 * alike, where piping is not: the streams of Node's fetch are Node's, and
 * the global classes may be another's — Metro's polyfill under jest-expo,
 * a page's while the fetch is an iframe's — and Node's `pipeThrough` and
 * `pipeTo`, as each implementation's, take only streams of their own.
 *
 * Once `signal` fires, the stream is cancelled with its reason, no chunk is
 * handed on after, and the read rejects with that reason. What `take`
 * throws, or a read fails with, rejects the read too, and what is left of
 * the stream is let go of with it rather than held open on the way.
 *
 * @param stream - The stream, unread
 * @param take - Called with each chunk, in order
 * @param signal - Stops the read
 * @returns Once the stream has ended and each chunk was taken
 * @example
 * ```ts
 * const chunks: Uint8Array[] = [];
 * await readChunks(response.body, (chunk) => chunks.push(chunk), signal);
 * ```
 */
export async function readChunks(
  stream: ReadableStream<Uint8Array>,
  take: (chunk: Uint8Array) => void,
  signal?: AbortSignal | null,
): Promise<void> {
  const reader = stream.getReader();
  const letGo = (reason: unknown): void => {
    reader.cancel(reason).catch(() => undefined);
  };
  const stop = (): void => {
    if (signal) letGo(abortReason(signal));
  };
  if (signal?.aborted) stop();
  else signal?.addEventListener("abort", stop, ONCE);
  try {
    /* A stream cancelled under its reader ends as one read to its end does. */
    for (
      let read = await reader.read();
      !read.done && !signal?.aborted;
      read = await reader.read()
    ) {
      take(read.value);
    }
  } catch (error) {
    if (!signal?.aborted) letGo(error);
    throw signal?.aborted ? abortReason(signal) : error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
  if (signal?.aborted) throw abortReason(signal);
}
