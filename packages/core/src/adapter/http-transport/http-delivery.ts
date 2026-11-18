/** How an answer carries a connection's frames: held open as they come, or once. */
export type DeliveryKind = "stream" | "poll";

/** Where an answer's bytes go: the response a server writes, whichever server it is. */
export interface DeliverySink {
  /** Bytes of a stream, sent on as they are written */
  write(bytes: Uint8Array): void;
  /** The answer's end, after `last`: all a poll carries, or what a stream wrote in its last task */
  end(last: Uint8Array | undefined): void;
}

/** One answer to a `stream` or a `poll`, which the connection writes its frames to. */
export interface Delivery {
  readonly kind: DeliveryKind;
  /** Write bytes: a stream sends them at the end of the task, a poll as it ends */
  write(bytes: Uint8Array): void;
  /** End the answer, after what was written to it */
  end(): void;
  /**
   * Hand the answer to the response that carries it. What was written
   * before is passed on at once, and so is the end, if it came: the
   * connection answers before the server that read the request has a
   * response to write to.
   */
  attach(sink: DeliverySink): void;
  /** The client left before the answer ended */
  leave(): void;
}

/**
 * An answer's body, written as the connection's frames come: a stream
 * passes on what a task wrote at its end, so a burst goes in one write; a
 * poll keeps it all for its end, so it goes whole, its length known.
 *
 * @param kind - A stream or a poll
 * @param onEnd - Told once it has ended: by `end()`, or by its client leaving, when `left`
 * @returns The answer
 * @example
 * ```ts
 * const delivery = createDelivery("stream", (left) => detach(left));
 * delivery.write(bytes);
 * delivery.attach({ write: (chunk) => res.write(chunk), end: (last) => res.end(last) });
 * ```
 */
export function createDelivery(kind: DeliveryKind, onEnd: (left: boolean) => void): Delivery {
  let sink: DeliverySink | undefined;
  let pending: Uint8Array[] = [];
  let flushing = false;
  let ended = false;

  function taken(): Uint8Array | undefined {
    if (pending.length === 0) return undefined;
    const bytes = pending.length === 1 ? (pending[0] as Uint8Array) : joined(pending);
    pending = [];
    return bytes;
  }

  function flush(): void {
    flushing = false;
    if (ended || sink === undefined) return;
    const bytes = taken();
    if (bytes !== undefined) sink.write(bytes);
  }

  return {
    kind,
    write(bytes) {
      if (ended) return;
      pending.push(bytes);
      if (kind === "poll" || flushing || sink === undefined) return;
      flushing = true;
      queueMicrotask(flush);
    },
    end() {
      if (ended) return;
      ended = true;
      sink?.end(taken());
      onEnd(false);
    },
    attach(given) {
      sink = given;
      if (ended) sink.end(taken());
      else if (kind === "stream") flush();
    },
    leave() {
      if (ended) return;
      ended = true;
      pending = [];
      onEnd(true);
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
