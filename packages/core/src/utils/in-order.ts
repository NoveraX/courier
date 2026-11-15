/** Queue a piece of work already begun, and what to do with its result once it is that one's turn. */
export type InOrder = <T, R>(work: Promise<T>, take: (value: T) => R | Promise<R>) => Promise<R>;

/**
 * Take the results of work in the order it began, though it ends in any
 * order: work runs side by side, and what is done with it keeps the order
 * it came in. Each `take` runs once its own work has settled and every
 * earlier one has had its turn — taken, or its work failed — and what it
 * returns is handed back without the next turn waiting for it, so a `take`
 * that sends something lets the next send go at once, behind it.
 *
 * @returns The function that queues work, resolving to what its `take`
 *   returned, or rejecting as its work or its `take` did
 *
 * @example
 * ```ts
 * const inOrder = createInOrder();
 * void inOrder(signer.sign(first), (sig) => publish({ ...first, sig }));
 * void inOrder(signer.sign(second), (sig) => publish({ ...second, sig })); // published after first
 * ```
 */
export function createInOrder(): InOrder {
  let last: Promise<unknown> = Promise.resolve();
  return (work, take) => {
    /* What take returned is held in a tuple, so the next turn waits for take to have run, never
       for what it returned to settle. */
    const turn = last.then(async () => [take(await work)] as const);
    last = turn.catch(() => undefined);
    return turn.then(([taken]) => taken);
  };
}
