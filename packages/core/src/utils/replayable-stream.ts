import { UNQUEUED } from "./own";

/**
 * A body's stream whose copies are readings of their own, each opened from
 * where the body is.
 *
 * A `fetch` built on undici before 8 — Node 22's and 24's, or an older one a
 * source sends with — tees a request's body as it sends it, and keeps one
 * branch unread in case it must send the body again: a second copy of every
 * byte, held until the request ends. A body that can be read again from
 * where it is needs no copy, so this stream answers a tee with two readings
 * of it — itself, and one opened only once it is read, which holds nothing
 * until then. Whatever reads either reads the whole body.
 *
 * @param stream - The body's stream, as it is sent
 * @param open - Opens the body again, from its start
 * @returns `stream`, whose tee copies nothing
 * @example
 * ```ts
 * const body = replayableStream(counted(source.open()), () => source.open());
 * ```
 */
export function replayableStream<T>(
  stream: ReadableStream<T>,
  open: () => ReadableStream<T>,
): ReadableStream<T> {
  Object.defineProperty(stream, "tee", {
    configurable: true,
    value: (): [ReadableStream<T>, ReadableStream<T>] => [
      replayableStream(openedLater(open), open),
      stream,
    ],
  });
  return stream;
}

/* The body's bytes, opened from its start as they are first read. */
function openedLater<T>(open: () => ReadableStream<T>): ReadableStream<T> {
  let reader: ReadableStreamDefaultReader<T> | undefined;
  return new ReadableStream<T>(
    {
      __proto__: null,
      async pull(controller) {
        reader ??= open().getReader();
        const read = await reader.read();
        if (read.done) controller.close();
        else controller.enqueue(read.value);
      },
      cancel: (reason: unknown) => reader?.cancel(reason),
    } as UnderlyingDefaultSource<T>,
    UNQUEUED as QueuingStrategy<T>,
  );
}
