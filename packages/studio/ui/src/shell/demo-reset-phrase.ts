import { demoResetLine } from "@/features/demo/demo-reset-line";

/**
 * When a public demo resets, as the demo banner's single line says it on a
 * phone or a short screen: the banner's sentence without its subject and
 * full stop, to follow "Live demo ·".
 *
 * @param resetsAt - When the host resets the demo, in epoch milliseconds, if it says
 * @param now - The time, in epoch milliseconds
 * @returns The phrase
 * @example
 * ```ts
 * demoResetPhrase(Date.now() + 37.5 * 60_000, Date.now()); // → "resets in 38 min"
 * ```
 */
export function demoResetPhrase(resetsAt: number | undefined, now: number): string {
  return demoResetLine(resetsAt, now).replace(/^It /, "").replace(/\.$/, "");
}
