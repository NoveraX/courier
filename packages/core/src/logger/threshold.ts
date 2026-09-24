import type { LogLevel } from "./types";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const THRESHOLD_RANK = new Map<string, number>([
  ...Object.entries(LEVEL_RANK),
  ["silent", Number.POSITIVE_INFINITY],
]);

/** The lowest level that prints, and the raw value when it was not one Courier knows. */
export interface Threshold {
  readonly rank: number;
  readonly unrecognised?: string;
}

/**
 * The threshold `COURIER_LOG_LEVEL` sets: `debug`, `info` (the default),
 * `warn`, `error` or `silent`, in any case.
 *
 * Read on every call rather than once: an app that sets the variable in its
 * own entry module does so after Courier's modules loaded, and a value read
 * at load would ignore it.
 *
 * @returns The rank below which lines are dropped; an unknown value keeps `info` and is reported back
 */
export function readThreshold(): Threshold {
  const raw = globalThis.process?.env?.COURIER_LOG_LEVEL;
  if (raw === undefined || raw.trim() === "") return { rank: LEVEL_RANK.info };
  const rank = THRESHOLD_RANK.get(raw.trim().toLowerCase());
  return rank === undefined ? { rank: LEVEL_RANK.info, unrecognised: raw } : { rank };
}

/**
 * @param level - A log level
 * @returns Its rank, comparable with {@link Threshold.rank}
 */
export function rankOf(level: LogLevel): number {
  return LEVEL_RANK[level];
}
