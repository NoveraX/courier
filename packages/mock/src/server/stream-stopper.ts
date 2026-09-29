/** Ends a mock server's open event streams when it stops. */
export interface StreamStopper {
  /** Fires when the server stops; a stream opened after a restart gets a fresh one. */
  signal(): AbortSignal;
  /** End every stream open now. */
  stopAll(): void;
}

/**
 * What a stopping mock server ends its event streams with. A stream never
 * finishes on its own, so waiting for the requests in flight to finish would
 * wait for it to the end of the grace period; it is ended at once instead,
 * without the frame that says it completed, so its client reconnects.
 *
 * @returns The stopper
 * @example
 * ```ts
 * const streams = createStreamStopper();
 * pumpEvents(gen, ctx, writer, AbortSignal.any([request.signal, streams.signal()]));
 * streams.stopAll();
 * ```
 */
export function createStreamStopper(): StreamStopper {
  let controller = new AbortController();
  return {
    signal: () => controller.signal,
    stopAll() {
      controller.abort();
      controller = new AbortController();
    },
  };
}
