/**
 * What a scale measurement reports: each figure with its unit and the
 * budget it must stay within, percentiles of timed samples, and the memory
 * and processor time of a process with every process it started.
 */
import { execFileSync } from "node:child_process";

/** @typedef {{ name: string, value: number, unit: string, budget: number, ok: boolean, note?: string }} Measured */

/**
 * A figure and whether it stays within its budget: at most the budget, or
 * at least it for a figure where more is better.
 *
 * @param {string} name - What was measured: `mock.p99`
 * @param {number} value - The figure
 * @param {string} unit - Its unit: `ms`, `MB`, `req/s`
 * @param {number} budget - The most it may be, or the least for `more`
 * @param {{ more?: boolean, note?: string }} [options] - Whether more is better, and a note for the report
 * @returns {Measured} The figure, checked
 * @example
 * ```js
 * measured("mock.p99", 3.2, "ms", 10);
 * ```
 */
export function measured(name, value, unit, budget, { more = false, note } = {}) {
  const round = (figure) => (Number.isFinite(figure) ? Math.round(figure * 100) / 100 : figure);
  return {
    name,
    value: round(value),
    unit,
    budget: round(budget),
    ok: more ? value >= budget : value <= budget,
    ...(note && { note }),
  };
}

/**
 * Percentiles of timed samples.
 *
 * @param {readonly number[]} samples - The samples
 * @returns {{ p50: number, p95: number, p99: number, max: number, mean: number }} The percentiles
 * @example
 * ```js
 * percentiles([1, 2, 3]).p50; // 2
 * ```
 */
export function percentiles(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) ?? 0, mean };
}

/**
 * A process and every process it started, by their ids.
 *
 * @param {number} pid - The process
 * @returns {number[]} Its id and its descendants'
 * @example
 * ```js
 * treeOf(studio.pid);
 * ```
 */
export function treeOf(pid) {
  const table = execFileSync("ps", ["-A", "-o", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const tree = [pid];
  for (let index = 0; index < tree.length; index++) {
    for (const [child, parent] of table)
      if (parent === tree[index] && child !== undefined) tree.push(child);
  }
  return tree;
}

/**
 * The resident memory of processes, together.
 *
 * @param {readonly number[]} pids - The processes
 * @returns {number} Megabytes
 * @example
 * ```js
 * residentMb(treeOf(studio.pid));
 * ```
 */
export function residentMb(pids) {
  const out = execFileSync("ps", ["-o", "rss=", "-p", pids.join(",")], { encoding: "utf8" });
  return (
    out
      .trim()
      .split("\n")
      .reduce((sum, line) => sum + Number(line.trim() || 0), 0) / 1024
  );
}

/**
 * The processor time processes have used so far, together, in seconds.
 *
 * @param {readonly number[]} pids - The processes
 * @returns {number} Seconds of processor time
 * @example
 * ```js
 * const before = cpuSeconds(tree); // … later, the difference over the wall time is the load
 * ```
 */
export function cpuSeconds(pids) {
  const out = execFileSync("ps", ["-o", "time=", "-p", pids.join(",")], { encoding: "utf8" });
  return out
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/[:.]/).map(Number))
    .reduce(
      (sum, [minutes = 0, seconds = 0, hundredths = 0]) =>
        sum + minutes * 60 + seconds + hundredths / 100,
      0,
    );
}

/**
 * The report of a run: one line per figure, with its budget and a mark.
 *
 * @param {readonly Measured[]} results - The figures
 * @returns {string} The report
 * @example
 * ```js
 * console.log(report(results));
 * ```
 */
export function report(results) {
  const width = Math.max(...results.map((each) => each.name.length));
  return results
    .map(
      (each) =>
        `${each.ok ? "✓" : "✗"} ${each.name.padEnd(width)}  ${String(each.value).padStart(10)} ${each.unit.padEnd(6)} budget ${each.budget}${each.note ? `  — ${each.note}` : ""}`,
    )
    .join("\n");
}
