import { cancellation } from "./cancellation";
import { joinedBytes } from "./joined-bytes";
import { ONCE } from "./own";
import { responseTakesStreams } from "./response-takes-streams";

/**
 * What a stream a request sends holds, read to its end, for what cannot
 * send a stream as it reads it: XMLHttpRequest, and React Native's fetch. A
 * Blob of the platform's where its `Response` can be made of a stream, and
 * the bytes where it cannot, as expo/fetch reads a stream it sends — React
 * Native's `Response` holds the text "[object ReadableStream]", and its Blob
 * takes no bytes. The call's cancellation, or its time running out, stops
 * the reading and cancels the stream with its reason.
 *
 * @param stream - The body
 * @param signal - The call's
 * @returns What the stream held
 * @throws {AbortError} Once the call is cancelled or its time is out
 * @example
 * ```ts
 * const body = await wholeBody(init.body, init.signal);
 * ```
 */
export async function wholeBody(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal | null,
): Promise<Blob | Uint8Array<ArrayBuffer>> {
  let whole: Blob | Uint8Array<ArrayBuffer>;
  try {
    whole = responseTakesStreams() ? await blobOf(stream, signal) : await bytesOf(stream, signal);
  } catch (error) {
    throw signal?.aborted ? cancellation(signal, error) : error;
  }
  /* A stream cancelled under its reader ends as one read to its end does. */
  if (signal?.aborted) throw cancellation(signal);
  return whole;
}

/**
 * Whether a request's body is a stream, which what cannot send one reads
 * whole. React Native has no streams without Expo, and `instanceof` an
 * undefined global throws.
 *
 * @param body - The body
 * @returns Whether it is a `ReadableStream`
 * @example
 * ```ts
 * const body = isStream(init.body) ? await wholeBody(init.body, init.signal) : init.body;
 * ```
 */
export function isStream(body: unknown): body is ReadableStream {
  return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
}

/* Read by the platform, through a pipe the signal stops. */
function blobOf(stream: ReadableStream<Uint8Array>, signal?: AbortSignal | null): Promise<Blob> {
  const piped = signal
    ? stream.pipeThrough(new TransformStream(), { __proto__: null, signal } as StreamPipeOptions)
    : stream;
  return new Response(piped).blob();
}

/* Read by hand, as React Native's Response cannot read a stream: the signal cancels it, which
   ends the read it waits on. */
async function bytesOf(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal | null,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const stop = (): void => {
    reader.cancel(signal?.reason).catch(() => undefined);
  };
  if (signal?.aborted) stop();
  else signal?.addEventListener("abort", stop, ONCE);
  try {
    const chunks: Uint8Array[] = [];
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value);
    }
    return joinedBytes(chunks);
  } finally {
    signal?.removeEventListener("abort", stop);
  }
}
