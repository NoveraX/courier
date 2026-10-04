/* The longest delay a Node timer takes; the timer never needs to fire. */
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Keep the process alive until released.
 *
 * Before Studio listens, nothing else does: a config whose load awaits
 * something that holds no handle of its own — a promise nothing settles —
 * would end the process in silence instead of being given up when its time
 * runs out.
 *
 * @returns The release; calling it again does nothing
 * @example
 * ```ts
 * const release = holdProcessOpen();
 * httpServer.listen(port, host);
 * release();
 * ```
 */
export function holdProcessOpen(): () => void {
  const timer = setInterval(() => undefined, MAX_TIMER_DELAY_MS);
  return () => clearInterval(timer);
}
