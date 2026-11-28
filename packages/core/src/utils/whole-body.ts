import { cancellation } from "./cancellation";
import { joinedBytes } from "./joined-bytes";
import { ownedBytes } from "./owned-bytes";
import { readChunks } from "./read-chunks";
import { responseTakesStreams } from "./response-takes-streams";

/**
 * What a stream a request sends holds, read to its end, for what cannot
 * send a stream as it reads it: XMLHttpRequest, and React Native's fetch.
 * The stream is read with its own reader, whatever implementation of web
 * streams made it. A Blob of the platform's holds what it read where its
 * `Response` is the fetch standard's, and the bytes do where it is not, as
 * expo/fetch reads a stream it sends — React Native's `Response` holds the
 * text "[object ReadableStream]", and its Blob takes no bytes. The call's
 * cancellation, or its time running out, stops the reading and cancels the
 * stream with its reason.
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
  const chunks: Uint8Array[] = [];
  try {
    await readChunks(
      stream,
      (chunk) => {
        chunks.push(chunk);
      },
      signal,
    );
  } catch (error) {
    throw signal?.aborted ? cancellation(signal, error) : error;
  }
  return responseTakesStreams()
    ? new Blob(chunks.map((chunk) => ownedBytes(chunk)))
    : joinedBytes(chunks);
}
