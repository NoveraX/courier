/* The applies this process is making, by id: an apply awaits its flushes, so another Studio in the process can start meanwhile. */
const applying = new Set<string>();

/**
 * Run an apply, known as in flight until it ends, however it ends.
 *
 * @param id - The apply's id
 * @param run - The apply
 * @returns What the apply returns
 * @example
 * ```ts
 * return whileApplying(id, () => applyStaged(root, plan, journal, commit));
 * ```
 */
export async function whileApplying<TResult>(
  id: string,
  run: () => Promise<TResult>,
): Promise<TResult> {
  applying.add(id);
  try {
    return await run();
  } finally {
    applying.delete(id);
  }
}

/**
 * Tell whether this process is making an apply now: its journal is its own
 * to finish or undo, not one a crash left.
 *
 * @param id - The apply's id
 * @returns `true` while the apply runs in this process
 * @example
 * ```ts
 * if (isApplying(journal.id)) return; // not a crash's leftover
 * ```
 */
export function isApplying(id: string): boolean {
  return applying.has(id);
}
