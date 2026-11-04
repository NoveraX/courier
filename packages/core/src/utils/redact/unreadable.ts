/** What stands for a part of a value that cannot be read: a getter that throws, a proxy's trap. */
export const UNREADABLE = "[unreadable]";

/** What {@link attempt} gives for a read that threw. */
export const FAILED: unique symbol = Symbol("unreadable");

/**
 * Read a part of a value that may not let itself be read: a getter, a
 * proxy's trap, a `toString` that throws gives {@link FAILED} rather than
 * throwing, so what holds the part is still read for the rest.
 *
 * @param read - Reads the part
 * @returns What it read, or `FAILED`
 * @example
 * ```ts
 * const message = attempt(() => error.message); // FAILED where its getter throws
 * ```
 */
export function attempt<T>(read: () => T): T | typeof FAILED {
  try {
    return read();
  } catch {
    return FAILED;
  }
}
