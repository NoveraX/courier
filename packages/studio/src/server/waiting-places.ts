/** Places taken in turn: whoever finds none free waits for one, first come first served. */
export interface WaitingPlaces {
  /**
   * Take a place, once one is free and every caller before has had theirs.
   *
   * @param signal - Aborted when the caller no longer wants the place: it leaves the line
   * @returns Once the place is taken
   * @throws The signal's reason, when it is aborted before a place is free
   */
  enter(signal?: AbortSignal): Promise<void>;
  /**
   * Give a place back: the first caller waiting takes it.
   *
   * @throws {RangeError} When no place is taken: something gave back twice
   */
  leave(): void;
  /** How many places are taken now. */
  readonly taken: number;
  /** How many callers wait for one. */
  readonly waiting: number;
}

interface Waiter {
  admit(): void;
}

/**
 * Places for work that should wait its turn rather than be refused — the
 * developer's own, say — of which no more than `limit` run at once.
 *
 * @param limit - How many places there are
 * @returns The places, none taken
 * @example
 * ```ts
 * const reads = createWaitingPlaces(4);
 * await reads.enter(signal);
 * try { await read(); } finally { reads.leave(); }
 * ```
 */
export function createWaitingPlaces(limit: number): WaitingPlaces {
  let taken = 0;
  const line: Waiter[] = [];
  return {
    enter(signal) {
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (taken < limit && line.length === 0) {
        taken++;
        return Promise.resolve();
      }
      return waitInLine(line, signal, () => taken++);
    },
    leave() {
      if (taken === 0) throw new RangeError("Gave back a place none had taken.");
      taken--;
      line.shift()?.admit();
    },
    get taken() {
      return taken;
    },
    get waiting() {
      return line.length;
    },
  };
}

function waitInLine(
  line: Waiter[],
  signal: AbortSignal | undefined,
  take: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      admit() {
        signal?.removeEventListener("abort", left);
        take();
        resolve();
      },
    };
    const left = (): void => {
      line.splice(line.indexOf(waiter), 1);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", left, { once: true });
    line.push(waiter);
  });
}
