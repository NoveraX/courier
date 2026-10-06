/** How a request body is read: the most of it to take, how fast, and where the connection is lost. */
export interface BodyPace {
  /** The most bytes to take; a body that declares more, or sends more, is stopped. */
  limit: number;
  /** How fast to take it, in kilobits a second; 0 takes it as fast as it comes. */
  kbps: number;
  /** Stop once this many bytes have arrived, as a connection lost partway does. */
  cutAt?: number | undefined;
  /** Hears how many bytes have arrived, after each part of the body. */
  onProgress?: ((received: number) => void) | undefined;
  /** Ends a wait between parts once the client has gone. */
  signal?: AbortSignal | undefined;
}

/** A body as the pace let it be read: whole, or stopped at the limit or the cut. */
export type PacedBody =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; reason: "limit" | "cut" };

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

function joined(chunks: readonly Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

/**
 * Read a request body no faster than a link of `kbps` would carry it.
 * Each part is taken only once the parts before it have had their time, so
 * the platform stops reading the socket meanwhile and the client's upload
 * slows to the pace — its progress moves as it would on that link. A body
 * that declares more than `limit` is stopped before a byte is read, and
 * one that sends more at the part that crosses it.
 *
 * @param request - The request
 * @param pace - The limit, the speed, where to cut, and who hears the progress
 * @returns The bytes, or where the read stopped
 * @throws When the client stops sending before the body is whole
 * @example
 * ```ts
 * const read = await readPaced(c.req.raw, { limit: 10_485_760, kbps: 1500 });
 * if (!read.ok) return refuse(read.reason);
 * ```
 */
export async function readPaced(request: Request, pace: BodyPace): Promise<PacedBody> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > pace.limit) return { ok: false, reason: "limit" };
  const body = request.body;
  if (!body) return { ok: true, bytes: new Uint8Array(0) };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  const start = performance.now();
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > pace.limit) return { ok: false, reason: "limit" };
      chunks.push(value);
      pace.onProgress?.(total);
      if (pace.cutAt !== undefined && total >= pace.cutAt) return { ok: false, reason: "cut" };
      /* Kilobits a second are bits a millisecond. */
      if (pace.kbps > 0) await waitUntil(start + (total * 8) / pace.kbps, pace.signal);
    }
  } finally {
    reader.releaseLock();
  }
  return { ok: true, bytes: joined(chunks, total) };
}
