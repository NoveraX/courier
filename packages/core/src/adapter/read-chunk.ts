import { ONCE } from "../utils/own";
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

/** By when a whole body must have arrived, and its time, for the refusal to name. */
export type BodyDeadline = Pick<ChunkWait, "deadline" | "timeoutMs">;

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

  return new Promise((resolve, reject) => {
    const settle = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      settle();
      reject(clientLeft(signal.reason));
    };
    const timer = chunkTimer(wait, (refusal) => {
      settle();
      reject(refusal);
    });
    signal.addEventListener("abort", onAbort, ONCE);

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

/**
 * Time the wait for a body's next chunk: the idle limit, or what is left
 * before the body's deadline, whichever ends first. Whoever reads the body
 * clears the timer once the chunk has come.
 *
 * @param wait - The limits on the wait
 * @param overdue - Told the refusal once the wait is over, `BODY_TIMEOUT`
 * @returns The timer, or `undefined` for a wait past what a timer holds, which has no end
 * @example
 * ```ts
 * const timer = chunkTimer({ idleMs: 30_000, deadline, timeoutMs }, (refusal) => refuse(refusal));
 * clearTimeout(timer);
 * ```
 */
export function chunkTimer(
  wait: Omit<ChunkWait, "signal">,
  overdue: (refusal: BodyError) => void,
): ReturnType<typeof setTimeout> | undefined {
  const remaining = wait.deadline - performance.now();
  const idle = wait.idleMs < remaining;
  const delay = Math.max(0, idle ? wait.idleMs : remaining);
  /* A delay past what a timer holds would fire at once; such a wait has no end. */
  if (delay > MAX_TIMER_MS) return undefined;
  const timer = setTimeout(
    () => overdue(idle ? idleTimeout(wait.idleMs) : overdueBody(wait.timeoutMs)),
    delay,
  );
  /* A wait for a client must not keep a server that is shutting down alive. */
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return timer;
}

/**
 * Run `then` once a deadline has come, unless the timer returned is cleared
 * first: a wait on a body that no read of it bounds.
 *
 * @param deadline - When, as `performance.now()` counts
 * @param then - What runs at it
 * @returns The timer, or `undefined` for a deadline past what a timer holds, which never comes
 * @example
 * ```ts
 * const timer = atDeadline(due.deadline, () => refuse(overdueBody(due.timeoutMs)));
 * clearTimeout(timer);
 * ```
 */
export function atDeadline(
  deadline: number,
  then: () => void,
): ReturnType<typeof setTimeout> | undefined {
  const delay = Math.max(0, deadline - performance.now());
  if (delay > MAX_TIMER_MS) return undefined;
  const timer = setTimeout(then, delay);
  /* A wait on a body must not keep a server that is shutting down alive. */
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return timer;
}

/**
 * The refusal of a body whose client went away before it was whole.
 *
 * @param reason - What the read learned of it
 * @returns The refusal, `BODY_ABORTED`
 * @example
 * ```ts
 * req.once("error", (error) => refuse(clientLeft(error)));
 * ```
 */
export function clientLeft(reason: unknown): BodyError {
  return new BodyError("BODY_ABORTED", "The client stopped sending its request body", {
    cause: reason,
  });
}

function idleTimeout(ms: number): BodyError {
  return new BodyError("BODY_TIMEOUT", `No part of the request body arrived for ${ms} ms`);
}

/**
 * The refusal of a body still arriving at its deadline.
 *
 * @param ms - The whole body's time, in milliseconds
 * @returns The refusal, `BODY_TIMEOUT`
 * @example
 * ```ts
 * overdueBody(300_000).message; // "The request body took longer than 300000 ms to arrive"
 * ```
 */
export function overdueBody(ms: number): BodyError {
  return new BodyError("BODY_TIMEOUT", `The request body took longer than ${ms} ms to arrive`);
}
