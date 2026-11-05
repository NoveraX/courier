/** How a request body is taken: how fast, where its connection is lost, and who hears it arrive. */
export interface BodyPace {
  /** How fast to take it, in kilobits a second; 0 takes it as fast as it comes. */
  kbps: number;
  /** Stop once this many bytes have arrived, as a connection lost partway does. */
  cutAt?: number | undefined;
  /** Hears how many bytes have arrived, after each part of the body. */
  onProgress?: ((received: number) => void) | undefined;
  /** Ends a wait between parts once the client has gone. */
  signal?: AbortSignal | undefined;
}

/** What a body the `interrupt` fault cut off fails with: the mock's doing, not the client's. */
export class CutOff extends Error {
  constructor() {
    super("The request body's connection was cut off partway");
    this.name = "CutOff";
  }
}

/* Wait until `at` (a `performance.now()` time), or until the client goes. */
function waitUntil(at: number, signal: AbortSignal | undefined): Promise<void> {
  const ms = at - performance.now();
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/**
 * A request body taken no faster than a link of `kbps` would carry it.
 * Each part is read only once the parts before it have had their time, so
 * the platform stops reading the socket meanwhile and the client's upload
 * slows to the pace — its progress moves as it would on that link. Past
 * `cutAt` bytes the stream fails with `CutOff`, and the rest of the body is
 * left where it is, for the dropped connection to take.
 *
 * @param body - The body, held to its limits
 * @param pace - The speed, where to cut, and who hears the progress
 * @returns The body, paced
 * @example
 * ```ts
 * const body = pacedBody(requestBodyStream(request, { maxBytes: 10_485_760 }), { kbps: 1500 });
 * ```
 */
export function pacedBody(
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
  pace: BodyPace,
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const start = performance.now();
  let received = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        /* Kilobits a second are bits a millisecond. */
        if (pace.kbps > 0) await waitUntil(start + (received * 8) / pace.kbps, pace.signal);
        const { done, value } = await reader.read();
        if (done) return controller.close();
        received += value.byteLength;
        pace.onProgress?.(received);
        if (pace.cutAt !== undefined && received >= pace.cutAt) {
          reader.releaseLock();
          throw new CutOff();
        }
        controller.enqueue(value);
      },
      cancel(reason: unknown) {
        return reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}
