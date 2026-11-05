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
  /** The most ids remembered; the oldest is forgotten first */
  readonly capacity: number;
  /** The clock; `Date.now` unless a test gives its own */
  readonly now?: (() => number) | undefined;
}

/**
 * Act on a message once: one that says it was sent `windowMs` or more
 * before this clock, or as far after it, is refused, and so is one whose id
 * was seen. An id is remembered for twice the window — after that, any
 * message carrying it is outside the window anyway — and at most
 * `capacity` of them at once.
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
  /* Each id with when it was seen, in the order seen: the first is the oldest. */
  const seen = new Map<string, number>();

  function forget(at: number): void {
    for (const [id, seenAt] of seen) {
      if (seen.size <= capacity && at - seenAt < 2 * windowMs) return;
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
      seen.set(id, time);
      if (seen.size > capacity) forget(time);
      return "fresh";
    },
    get size() {
      return seen.size;
    },
  };
}
