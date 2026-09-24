/**
 * Wait for work, but no longer than a budget.
 *
 * @param work - What to wait for; it keeps running past the budget
 * @param budgetMs - How long to wait at most
 * @returns `true` when the work settled in time, `false` when the budget ran out first
 *
 * @example
 * ```ts
 * if (!(await withinBudget(watcher.settled(), 2000))) log.debug("planning against the state Studio has");
 * ```
 */
export async function withinBudget(work: Promise<unknown>, budgetMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), budgetMs);
  });
  const settled = work.then(
    () => true as const,
    () => true as const,
  );
  try {
    return await Promise.race([settled, budget]);
  } finally {
    clearTimeout(timer);
  }
}
