/* The signals that stop a run short: Ctrl+C at the terminal, and a stop asked of the process. */
const STOPS = ["SIGINT", "SIGTERM"] as const;

/**
 * Do work that changes the project so that a stop undoes it rather than
 * cutting it off half done: while the work runs, Ctrl+C and SIGTERM abort
 * the signal it is given — a program it runs is stopped, and the work
 * undoes what it did before it ends — where otherwise the process would
 * end at once. Outside such work nothing is changed, and a stop ends the
 * process as it always does.
 *
 * @param work - The work, given the signal a stop aborts
 * @returns What the work returns
 * @example
 * ```ts
 * const status = await interruptible((signal) => transaction(signal));
 * ```
 */
export async function interruptible<TResult>(
  work: (signal: AbortSignal) => Promise<TResult>,
): Promise<TResult> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  for (const signal of STOPS) process.on(signal, stop);
  try {
    return await work(controller.signal);
  } finally {
    for (const signal of STOPS) process.off(signal, stop);
  }
}
