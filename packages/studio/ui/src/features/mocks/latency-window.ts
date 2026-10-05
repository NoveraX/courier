import type { NetworkConfig } from "@/store/mock-slice";

/** A delay as the Latency card shows it: a base and the jitter either side of it, in ms. */
export interface Delay {
  base: number;
  jitter: number;
}

/** The span of delays an answer can take, in ms, with where each end and the base sit on the card's 0–2s track. */
export interface DelayWindow {
  low: number;
  high: number;
  /** Positions on the track, in percent, the longest delays held at its end. */
  lowAt: number;
  highAt: number;
  baseAt: number;
}

/** The longest delay the response window draws to scale. */
export const WINDOW_MS = 2_000;

/**
 * A mock's added delay as a base and a jitter. The mock draws each delay
 * from a range and adds jitter either way, so a range reads as its middle
 * and half its width plus the jitter: the same span of delays.
 *
 * @param latency - The mock's latency setting
 * @returns The delay, or `null` when the mock adds none
 * @example
 * ```ts
 * delayOf({ min: 300, max: 900, jitter: 150 }); // { base: 600, jitter: 450 }
 * ```
 */
export function delayOf(latency: NetworkConfig["latency"] | undefined): Delay | null {
  if (latency === undefined) return null;
  if (typeof latency === "number") return latency > 0 ? { base: latency, jitter: 0 } : null;
  const extra = latency.jitter ?? 0;
  /* The mock answers a range whose maximum is below its minimum at the minimum. */
  const high = Math.max(latency.min, latency.max);
  if (high <= 0 && extra <= 0) return null;
  const spread = (high - latency.min) / 2;
  return { base: Math.round(latency.min + spread), jitter: Math.round(spread + extra) };
}

function at(ms: number): number {
  return Math.min(100, (ms / WINDOW_MS) * 100);
}

/**
 * The span of delays a base and jitter give, never below zero, placed on
 * the card's track.
 *
 * @param delay - The base and the jitter
 * @returns The window
 * @example
 * ```ts
 * delayWindow({ base: 600, jitter: 450 }); // { low: 150, high: 1050, lowAt: 7.5, highAt: 52.5, baseAt: 30 }
 * ```
 */
export function delayWindow({ base, jitter }: Delay): DelayWindow {
  const low = Math.max(0, base - jitter);
  const high = base + jitter;
  return { low, high, lowAt: at(low), highAt: at(high), baseAt: at(base) };
}

/**
 * A delay in whole milliseconds, in seconds from one second up.
 *
 * @param ms - The delay
 * @returns Its label
 * @example
 * ```ts
 * delayLabel(1050); // "1.05s"
 * delayLabel(0); // "0ms"
 * ```
 */
export function delayLabel(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)}ms` : `${Number((ms / 1_000).toFixed(2))}s`;
}
