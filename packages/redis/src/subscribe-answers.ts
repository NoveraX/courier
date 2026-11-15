/** Who waits for Redis to answer the SUBSCRIBE of a channel on a subscriber connection. */
export interface SubscribeAnswers {
  /** Wait for Redis to answer a channel, `timeoutMs` at most */
  wait(channel: string, timeoutMs: number): Promise<void>;
  /** Redis answered a channel, taking it or refusing it: who waits for it waits no more */
  answered(channel: string): void;
  /** No answer on the connection is to come — it was lost, or the adapter stopped: no one waits */
  answeredAll(): void;
}

/**
 * Keep who waits for Redis to answer each channel's SUBSCRIBE, each for a
 * bounded time: a caller is let go of at the answer, as the connection is
 * lost, or at its deadline, whichever comes first.
 *
 * @returns The waits, none yet
 * @example
 * ```ts
 * const answers = createSubscribeAnswers();
 * const taken = answers.wait("room", 2_000);
 * answers.answered("room"); // taken settles
 * ```
 */
export function createSubscribeAnswers(): SubscribeAnswers {
  const waiting = new Map<string, Set<() => void>>();

  function answered(channel: string): void {
    const waits = waiting.get(channel);
    if (!waits) return;
    waiting.delete(channel);
    for (const settle of waits) settle();
  }

  return {
    wait(channel, timeoutMs) {
      return new Promise<void>((resolve) => {
        const waits = waiting.get(channel) ?? new Set<() => void>();
        waiting.set(channel, waits);
        const deadline = setTimeout(() => settle(), timeoutMs);
        if (typeof deadline === "object" && "unref" in deadline) deadline.unref();
        function settle(): void {
          clearTimeout(deadline);
          waits.delete(settle);
          if (waits.size === 0 && waiting.get(channel) === waits) waiting.delete(channel);
          resolve();
        }
        waits.add(settle);
      });
    },
    answered,
    answeredAll() {
      for (const channel of [...waiting.keys()]) answered(channel);
    },
  };
}
