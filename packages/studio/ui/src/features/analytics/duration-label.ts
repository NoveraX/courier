import { formatDuration } from "@/lib/formatters";

/**
 * A response time as Analytics writes it, or a dash for one there is not —
 * the p95 of calls that were all cut short.
 *
 * @param ms - The time, or `null`
 * @returns The label
 * @example
 * ```ts
 * durationLabel(null); // "—"
 * ```
 */
export function durationLabel(ms: number | null): string {
  return ms === null ? "—" : formatDuration(ms);
}
