import { createLogger } from "../logger";

const log = createLogger("Stream");
const ABORTED = Symbol("aborted");

/**
 * Read a stream endpoint's events until the source finishes or `signal` fires.
 *
 * Closing a stream used to wait for its generator: `return()` on a generator
 * parked on an await is queued behind the pending step, so a handler waiting
 * on an event that never came held the reader — and whatever it owned —
 * forever. Here the wait on each event ends the moment the signal fires, and
 * the source is asked to return without waiting: at once when it sits at a
 * `yield`, the next time it yields when it is parked on an await — one that
 * may never yield again should watch its own `ctx.signal`. A reader that
 * stops on its own, with the signal still quiet, waits for the source's
 * cleanup as `for await` does.
 *
 * @param source - The endpoint's event source
 * @param signal - Fires when the stream is closed
 * @returns The source's events, ending early when the signal fires
 * @example
 * for await (const event of abortableEvents(handler(ctx), controller.signal)) {
 *   write(event);
 * }
 */
export async function* abortableEvents<TEvent>(
  source: AsyncIterable<TEvent>,
  signal: AbortSignal,
): AsyncGenerator<TEvent, void, undefined> {
  const iterator = source[Symbol.asyncIterator]();
  let open = true;
  const release = (): void => {
    if (!open) return;
    open = false;
    void closeSource(iterator, true);
  };
  signal.addEventListener("abort", release, { once: true });
  try {
    while (!signal.aborted) {
      const step = await nextOrAbort(iterator, signal);
      if (step === ABORTED) return;
      if (step.done) {
        open = false;
        return;
      }
      yield step.value;
    }
  } catch (error) {
    open = false;
    throw error;
  } finally {
    signal.removeEventListener("abort", release);
    if (open) {
      open = false;
      await closeSource(iterator, signal.aborted);
    }
  }
}

async function closeSource<TEvent>(
  iterator: AsyncIterator<TEvent>,
  aborted: boolean,
): Promise<void> {
  const returned = Promise.resolve(iterator.return?.());
  if (!aborted) {
    await returned;
    return;
  }
  void returned.catch((error: unknown) =>
    log.warn("Stream generator failed while being closed", error),
  );
}

function nextOrAbort<TEvent>(
  iterator: AsyncIterator<TEvent>,
  signal: AbortSignal,
): Promise<IteratorResult<TEvent> | typeof ABORTED> {
  const pending = iterator.next();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      /* The step is abandoned; a failure it ends in later still gets told. */
      pending.catch((error: unknown) =>
        log.warn("Stream generator failed after its stream closed", error),
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
