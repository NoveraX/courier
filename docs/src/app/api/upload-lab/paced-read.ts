/** Why the lab stopped reading an upload, with the status it answers. */
export class LabRefusal extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "LabRefusal"
  }
}

/** How the lab reads an upload. */
export interface PaceOptions {
  /** The pace, in bytes a second. */
  bytesPerSecond: number
  /** The most it reads before it refuses the upload. */
  limit: number
  /** How long it waits for the whole upload, in ms. */
  deadline: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Read a body no faster than a pace, the way a slow link takes it: after
 * each chunk the reader waits until the pace has caught up. The runtime
 * stops taking bytes from the socket while it waits, so the sender's
 * upload — and the progress its browser reports — slows to match.
 *
 * @param body - The request's body
 * @param options - The pace, the most to read, and how long to wait for it
 * @returns The bytes read, and the ms it took
 * @throws {LabRefusal} 413 past the limit, 408 past the deadline
 * @example
 * ```ts
 * const { received, ms } = await readPaced(request.body, { bytesPerSecond: 2 * MB, limit, deadline: 30_000 })
 * ```
 */
export async function readPaced(
  body: ReadableStream<Uint8Array> | null,
  { bytesPerSecond, limit, deadline }: PaceOptions
): Promise<{ received: number; ms: number }> {
  const started = performance.now()
  if (!body) return { received: 0, ms: 0 }
  const reader = body.getReader()
  let received = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > limit) throw new LabRefusal(413, "The upload is larger than the lab takes")
      const elapsed = performance.now() - started
      if (elapsed > deadline) throw new LabRefusal(408, "The upload took longer than the lab waits")
      const ahead = (received / bytesPerSecond) * 1000 - elapsed
      if (ahead > 0) await sleep(Math.min(ahead, deadline - elapsed))
    }
  } catch (error) {
    /* A refused upload stops here; a body that failed has nothing left to cancel. */
    if (error instanceof LabRefusal) await reader.cancel(error.message)
    throw error
  }
  return { received, ms: Math.round(performance.now() - started) }
}
