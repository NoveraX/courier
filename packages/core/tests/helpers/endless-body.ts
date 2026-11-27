/**
 * A request body that never ends — a stream that hands one part over when
 * it is first read and nothing ever after, as an encoder that has stalled
 * does — and a wait bounded by a deadline, for a call that would never
 * settle.
 */

/** A body that never ends, and what has been done to it. */
export interface EndlessBody {
  readonly stream: ReadableStream<Uint8Array>;
  /** Resolved once its reader has taken its part */
  readonly read: Promise<void>;
  /** Resolved with the reason it is cancelled with */
  readonly cancelled: Promise<unknown>;
}

/**
 * A stream that hands `part` over when first read, and nothing after.
 *
 * @param part - What it hands over, as UTF-8
 * @returns The stream, and when it was read and cancelled
 */
export function endlessBody(part: string): EndlessBody {
  let taken: () => void = () => undefined;
  const read = new Promise<void>((resolve) => {
    taken = resolve;
  });
  let cancel: (reason: unknown) => void = () => undefined;
  const cancelled = new Promise<unknown>((resolve) => {
    cancel = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode(part));
      taken();
      return new Promise<void>(() => undefined);
    },
    cancel: (reason: unknown) => cancel(reason),
  });
  return { stream, read, cancelled };
}

/**
 * The promise as it settles, or a rejection once `ms` pass without it
 * settling: what a call that never settles fails with, sooner than the
 * test's own timeout.
 *
 * @param promise - What should settle
 * @param ms - How long it may take
 * @returns What it settles to
 */
export function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`still waiting after ${ms} ms`)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
