/** Who waits for Redis to answer the SUBSCRIBE of channels on a subscriber connection. */
export interface SubscribeAnswers {
  /** Wait for Redis to answer each of `channels`, `timeoutMs` at most */
  wait(channels: readonly string[], timeoutMs: number): Promise<void>;
  /** Redis answered a channel, taking it or refusing it, or no handler wants it now: who waits for it waits no more */
  answered(channel: string): void;
  /** No answer on the connection is to come — it was lost, or the adapter stopped: no one waits */
  answeredAll(): void;
}

/**
 * Keep who waits for Redis to answer the SUBSCRIBE of channels, each for a
 * bounded time: a wait is over once each of its channels is answered, as
 * the connection is lost, or at its deadline, whichever comes first.
 *
 * @returns The waits, none yet
 * @example
 * ```ts
 * const answers = createSubscribeAnswers();
 * const taken = answers.wait(["room", "lobby"], 2_000);
 * answers.answered("room");
 * answers.answered("lobby"); // taken settles
 * ```
 */
export function createSubscribeAnswers(): SubscribeAnswers {
  const waiting = new Map<string, Set<() => void>>();

  function forget(channel: string, settle: () => void): void {
    const waits = waiting.get(channel);
    if (!waits) return;
    waits.delete(settle);
    if (waits.size === 0) waiting.delete(channel);
  }

  function answered(channel: string): void {
    const waits = waiting.get(channel);
    if (!waits) return;
    waiting.delete(channel);
    for (const settle of waits) settle();
  }

  return {
    wait(channels, timeoutMs) {
      return new Promise<void>((resolve) => {
        /* The channels of this wait still unanswered, each with what it is told at the answer. */
        const left = new Map<string, () => void>();
        const deadline = setTimeout(done, timeoutMs);
        if (typeof deadline === "object" && "unref" in deadline) deadline.unref();
        function done(): void {
          clearTimeout(deadline);
          for (const [channel, settle] of left) forget(channel, settle);
          left.clear();
          resolve();
        }
        for (const channel of new Set(channels)) {
          const settle = (): void => {
            left.delete(channel);
            if (left.size === 0) done();
          };
          left.set(channel, settle);
          waiting.set(channel, (waiting.get(channel) ?? new Set<() => void>()).add(settle));
        }
        if (left.size === 0) done();
      });
    },
    answered,
    answeredAll() {
      for (const channel of [...waiting.keys()]) answered(channel);
    },
  };
}
