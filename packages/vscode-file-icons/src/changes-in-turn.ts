import { logFailure } from "./icons-log";

/** Changes to the icons, made one at a time, and when the ones asked for are made. */
export interface ChangesInTurn {
  /**
   * Make a change once every change asked for before it is made.
   *
   * @param what - What a failure of it is logged as: "Courier could not …"
   * @param change - The change
   * @returns Settles once it is made or has failed, never rejecting
   */
  inTurn(what: string, change: () => Promise<unknown>): Promise<unknown>;
  /**
   * Settles once every change asked for so far is made, the ones asked for
   * meanwhile too. Never rejects.
   */
  settled(): Promise<void>;
}

/**
 * The changes to Courier's icons, one at a time: the themes rebuild on
 * each, and an offer, a command and a sync may come together. A change that
 * fails is logged, and the next is still made.
 *
 * @returns How to ask for a change, and to wait for those asked for
 * @example
 * ```ts
 * const { inTurn, settled } = changesInTurn();
 * void inTurn("Courier could not keep its file icons current", () => keepIconsCurrent(icons));
 * await settled();
 * ```
 */
export function changesInTurn(): ChangesInTurn {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    inTurn(what, change) {
      queue = queue.then(change).catch((error: unknown) => logFailure(what, error));
      return queue;
    },
    async settled() {
      let made: Promise<unknown>;
      do {
        made = queue;
        await made;
      } while (made !== queue);
    },
  };
}
