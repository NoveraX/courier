/** A count of something Studio holds at once — calls running, bytes buffered — up to a limit. */
export interface Capacity {
  /**
   * Take an amount, unless that would pass the limit.
   *
   * @param amount - How much (default 1)
   * @returns Whether it was taken
   */
  take(amount?: number): boolean;
  /**
   * Give back an amount taken.
   *
   * @param amount - How much (default 1)
   * @throws {RangeError} When it is more than is taken: something gave back twice, and the count no longer holds
   */
  give(amount?: number): void;
  /** How much is taken now. */
  readonly used: number;
}

/**
 * A capacity of `limit`, shared by everything that takes from it.
 *
 * Giving back more than is taken is refused rather than counted as nothing:
 * a place given back twice would otherwise let one more caller in than the
 * limit for as long as the place given back first stays taken.
 *
 * @param limit - The most that may be taken at once
 * @returns The capacity, nothing taken
 * @example
 * ```ts
 * const fetches = createCapacity(4);
 * if (!fetches.take()) throw new StudioBusyError("…");
 * try { await fetch(url); } finally { fetches.give(); }
 * ```
 */
export function createCapacity(limit: number): Capacity {
  let used = 0;
  return {
    take(amount = 1) {
      if (used + amount > limit) return false;
      used += amount;
      return true;
    },
    give(amount = 1) {
      if (amount > used) {
        throw new RangeError(`Gave back ${amount} of a capacity that holds ${used}.`);
      }
      used -= amount;
    },
    get used() {
      return used;
    },
  };
}
