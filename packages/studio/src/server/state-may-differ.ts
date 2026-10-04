import type { WatchedState } from "./watched-state";

/* A timestamp this recent may share its tick with a save still to come: on a
   filesystem that counts whole seconds, or two, a save inside the same tick
   that keeps the size leaves the lookup as it was. */
const RACY_MS = 2_000;

/**
 * Whether a path may have changed between two lookups: what is there differs,
 * or its timestamp is recent enough to share a tick with a save the lookup
 * cannot tell apart. Until the tick is past the path is handed on each time,
 * and the ledger compares its bytes.
 *
 * @param before - What the previous lookup found
 * @param now - What this lookup found
 * @param at - When this lookup was made, in epoch milliseconds
 * @returns Whether to hand the path on
 * @example
 * ```ts
 * if (stateMayDiffer(entry.seen, watchedState(path), Date.now())) onSuspect(path);
 * ```
 */
export function stateMayDiffer(
  before: WatchedState | null,
  now: WatchedState | null,
  at: number,
): boolean {
  if (now !== null && Math.abs(at - now.mtimeMs) < RACY_MS) return true;
  if (before === null || now === null) return before !== now;
  return (
    before.mtimeMs !== now.mtimeMs ||
    before.ctimeMs !== now.ctimeMs ||
    before.size !== now.size ||
    before.ino !== now.ino ||
    before.error !== now.error
  );
}
