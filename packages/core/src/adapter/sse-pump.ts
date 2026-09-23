import { createLogger } from "../logger";

const log = createLogger("SSE");
const ABORTED = Symbol("aborted");

/**
 * Run a stream's generator until it finishes or the stream is closed.
 *
 * A generator waiting on an event that never comes used to hold its stream,
 * its registry slot and the server's shutdown with it: `stop()` never
 * returned and a SIGTERM never completed. The wait on each event now ends
 * the moment the stream closes. The generator itself cannot be stopped from
 * outside while it is parked on an await — `return()` is queued behind the
 * pending step — so it is asked to return and its `finally` runs the next
 * time it yields; one that may never yield again should watch `ctx.signal`.
 *
 * @param generator - The endpoint's event source
 * @param signal - Fires when the stream closes
 * @param onEvent - Writes one event; awaited before the next is read
 * @returns Whether the generator finished or the stream closed first
 */
export async function pumpEvents<TEvent>(
  generator: AsyncIterable<TEvent>,
  signal: AbortSignal,
  onEvent: (event: TEvent) => void | Promise<void>,
): Promise<"complete" | "aborted"> {
  const iterator = generator[Symbol.asyncIterator]();
  try {
    for (;;) {
      const step = await nextOrAbort(iterator, signal);
      if (step === ABORTED) return "aborted";
      if (step.done) return "complete";
      await onEvent(step.value);
      if (signal.aborted) return "aborted";
    }
  } finally {
    if (signal.aborted) {
      void Promise.resolve(iterator.return?.()).catch((error: unknown) =>
        log.warn("SSE generator failed while being closed", error),
      );
    }
  }
}

function nextOrAbort<TEvent>(
  iterator: AsyncIterator<TEvent>,
  signal: AbortSignal,
): Promise<IteratorResult<TEvent> | typeof ABORTED> {
  if (signal.aborted) return Promise.resolve(ABORTED);
  const pending = iterator.next();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      /* The step is abandoned; a failure it ends in later still gets told. */
      pending.catch((error: unknown) =>
        log.warn("SSE generator failed after its stream closed", error),
      );
      resolve(ABORTED);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(
      (step) => {
        signal.removeEventListener("abort", onAbort);
        resolve(step);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
