const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * A session's length as a clock reads it: `03:24`, or `1:03:24` past an hour.
 *
 * @param ms - How long the session has run
 * @returns The clock
 * @example
 * ```ts
 * sessionClock(204_000); // "03:24"
 * ```
 */
export function sessionClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const clock = `${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}
