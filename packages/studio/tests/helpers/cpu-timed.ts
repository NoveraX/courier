/** What a piece of work gave back, and the CPU time it took. */
export interface CpuTimed<T> {
  value: T;
  /** User and system CPU time, in milliseconds. */
  ms: number;
}

/**
 * Run a piece of synchronous work and count the CPU time it takes: what
 * the work costs, which a machine busy with other processes leaves as it
 * is, where it stretches the time that passes while the work waits its
 * turn. Vitest runs each test file in a process of its own, so the count is
 * the file's alone — the work, and the collector's threads tidying after it.
 *
 * @param run - The work
 * @returns What it gave back, and the CPU time it took in milliseconds
 * @example
 * ```ts
 * const { value, ms } = cpuTimed(() => readConstraints({ pattern }, "string"));
 * expect(ms).toBeLessThan(500);
 * ```
 */
export function cpuTimed<T>(run: () => T): CpuTimed<T> {
  const before = process.cpuUsage();
  const value = run();
  const { user, system } = process.cpuUsage(before);
  return { value, ms: (user + system) / 1_000 };
}
