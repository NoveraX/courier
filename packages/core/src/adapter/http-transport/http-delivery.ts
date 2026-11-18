/** How an answer carries a connection's frames: held open as they come, or once. */
export type DeliveryKind = "stream" | "poll";

/** One answer to a `stream` or a `poll`, which the connection writes its frames to. */
export interface Delivery {
  readonly kind: DeliveryKind;
  /** The answer's body */
  readonly body: ReadableStream<Uint8Array>;
  /** Write bytes: a stream sends them at the end of the task, a poll as it ends */
  write(bytes: Uint8Array): void;
  /** End the answer, after what was written to it */
  end(): void;
}

/**
 * An answer's body, written as the connection's frames come: a stream
 * passes on what a task wrote at its end, so a burst goes in one write; a
 * poll keeps it all for the one write that ends it.
 *
 * @param kind - A stream or a poll
 * @param onEnd - Told once it has ended: by `end()`, or by its client leaving, when `left`
 * @returns The answer
 * @example
 * ```ts
 * const delivery = createDelivery("stream", (left) => detach(left));
 * delivery.write(bytes);
 * return new Response(delivery.body);
 * ```
 */
export function createDelivery(kind: DeliveryKind, onEnd: (left: boolean) => void): Delivery {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let pending: Uint8Array[] = [];
  let flushing = false;
  let ended = false;

  function flush(): void {
    flushing = false;
    if (ended || pending.length === 0) return;
    controller?.enqueue(pending.length === 1 ? (pending[0] as Uint8Array) : joined(pending));
    pending = [];
  }

  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
    cancel() {
      if (ended) return;
      ended = true;
      pending = [];
      onEnd(true);
    },
  });

  return {
    kind,
    body,
    write(bytes) {
      if (ended) return;
      pending.push(bytes);
      if (kind === "poll" || flushing) return;
      flushing = true;
      queueMicrotask(flush);
    },
    end() {
      if (ended) return;
      flush();
      ended = true;
      controller?.close();
      onEnd(false);
    },
  };
}

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  let size = 0;
  for (const chunk of chunks) size += chunk.byteLength;
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}
