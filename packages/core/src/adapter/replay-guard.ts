/** How a message's id and time decided whether to act on it. */
export type ReplayVerdict = "fresh" | "stale" | "early" | "replayed";

/** Which messages to act on, by when they were sent and whether they were seen. */
export interface ReplayGuard {
  /** Whether to act on a message: once for its id, and only near the time it says it was sent */
  admit(id: string, at: number): ReplayVerdict;
  /** How many ids it remembers */
  readonly size: number;
}

export interface ReplayGuardOptions {
  /** How far from this clock, either way, a message may say it was sent */
  readonly windowMs: number;
  /** The most ids remembered; the oldest is forgotten first, and none sent before it is taken after */
  readonly capacity: number;
  /** The clock; `Date.now` unless a test gives its own */
  readonly now?: (() => number) | undefined;
}

/**
 * Act on a message once: one that says it was sent `windowMs` or more
 * before this clock, or as far after it, is refused, and so is one whose id
 * was seen. An id is remembered until the time its message says it was
 * sent is out of the window — after that, any message carrying it is
 * refused anyway — and at most `capacity` of them at once. An id forgotten
 * for room while its message is still in the window would let that message
 * be taken again: so nothing sent no later than it is taken from then on,
 * refused as stale.
 *
 * @param options - The window, the capacity and the clock
 * @returns The guard
 *
 * @example
 * ```ts
 * const replay = createReplayGuard({ windowMs: 60_000, capacity: 10_000 });
 * replay.admit(message.id, message.at); // "fresh", then "replayed"
 * ```
 */
export function createReplayGuard(options: ReplayGuardOptions): ReplayGuard {
  const { windowMs, capacity, now = Date.now } = options;
  /* Each id with the time its message says it was sent, in the order seen: the first is the oldest. */
  const seen = new Map<string, number>();
  /* The latest time a message forgotten for room said it was sent: none sent then or before is taken. */
  let floor = Number.NEGATIVE_INFINITY;

  function forget(time: number): void {
    for (const [id, at] of seen) {
      const outside = time - at >= windowMs;
      if (!outside && seen.size <= capacity) return;
      if (!outside) floor = Math.max(floor, at);
      seen.delete(id);
    }
  }

  return {
    admit(id, at) {
      const time = now();
      forget(time);
      if (time - at >= windowMs) return "stale";
      if (at - time >= windowMs) return "early";
      if (seen.has(id)) return "replayed";
      if (at <= floor) return "stale";
      seen.set(id, at);
      if (seen.size > capacity) forget(time);
      return "fresh";
    },
    get size() {
      return seen.size;
    },
  };
}
