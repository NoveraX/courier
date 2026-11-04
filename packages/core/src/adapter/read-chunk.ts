import { BodyError } from "./body-error";

/* The longest delay a timer takes as given (2^31 - 1 ms). */
const MAX_TIMER_MS = 2_147_483_647;

/** How long a body's reader waits for its next chunk, and for whom. */
export interface ChunkWait {
  /** Longest wait for this chunk, in milliseconds */
  idleMs: number;
  /** The `performance.now()` time by which the whole body must have arrived */
  deadline: number;
  /** The whole body's time, in milliseconds, for the refusal to name */
  timeoutMs: number;
  /** The request's signal, which fires when the client goes away */
  signal: AbortSignal;
}

/**
 * Read a body's next chunk, or fail once it is too long in coming.
 *
 * A client that opens a body and then sends nothing, or a byte a minute,
 * holds the server's reader for as long as it likes: no platform bounds the
 * pause between chunks, and Node's own `requestTimeout` covers Node alone.
 * The wait ends at the idle limit, the body's deadline or the client's
 * leaving, whichever comes first. The read itself is left pending; the
 * caller hands the body on to be discarded.
 *
 * @param reader - The body's reader
 * @param wait - The limits on the wait
 * @returns The read's result
 * @throws BodyError `BODY_TIMEOUT` when no chunk came in time, `BODY_ABORTED`
 *   when the client went away first; whatever the read itself fails with
 *
 * @example
 * ```ts
 * const { done, value } = await readChunk(reader, { idleMs: 30_000, deadline, timeoutMs, signal });
 * ```
 */
export function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>,
  wait: ChunkWait,
): Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>> {
  const { signal } = wait;
  if (signal.aborted) return Promise.reject(clientLeft(signal.reason));
  const remaining = wait.deadline - performance.now();
  const idle = wait.idleMs < remaining;

  const delay = Math.max(0, idle ? wait.idleMs : remaining);

  return new Promise((resolve, reject) => {
    const settle = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      settle();
      reject(clientLeft(signal.reason));
    };
    /* A delay past what a timer holds would fire at once; such a wait has no end. */
    const timer =
      delay <= MAX_TIMER_MS
        ? setTimeout(() => {
            settle();
            reject(idle ? idleTimeout(wait.idleMs) : overdue(wait.timeoutMs));
          }, delay)
        : undefined;
    /* A wait for a client must not keep a server that is shutting down alive. */
    if (typeof timer === "object" && "unref" in timer) timer.unref();
    signal.addEventListener("abort", onAbort, { once: true });

    reader.read().then(
      (result) => {
        settle();
        resolve(result);
      },
      (error: unknown) => {
        settle();
        reject(error);
      },
    );
  });
}

function clientLeft(reason: unknown): BodyError {
  return new BodyError("BODY_ABORTED", "The client stopped sending its request body", {
    cause: reason,
  });
}

function idleTimeout(ms: number): BodyError {
  return new BodyError("BODY_TIMEOUT", `No part of the request body arrived for ${ms} ms`);
}

function overdue(ms: number): BodyError {
  return new BodyError("BODY_TIMEOUT", `The request body took longer than ${ms} ms to arrive`);
}
