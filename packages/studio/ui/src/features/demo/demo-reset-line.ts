const MINUTE_MS = 60_000;

/**
 * When a public demo resets, as its banner says it: in whole minutes,
 * rounded up so the demo never resets earlier than it said.
 *
 * @param resetsAt - When the host resets the demo, in epoch milliseconds, if it says
 * @param now - The time, in epoch milliseconds
 * @returns The sentence
 * @example
 * ```ts
 * demoResetLine(Date.now() + 37.5 * 60_000, Date.now()); // → "It resets in 38 min."
 * ```
 */
export function demoResetLine(resetsAt: number | undefined, now: number): string {
  if (resetsAt === undefined) return "It is reset now and then.";
  const minutes = Math.ceil((resetsAt - now) / MINUTE_MS);
  if (minutes <= 0) return "It is resetting now.";
  if (minutes === 1) return "It resets within a minute.";
  if (minutes < 90) return `It resets in ${minutes} min.`;
  return `It resets in about ${Math.round(minutes / 60)} h.`;
}
