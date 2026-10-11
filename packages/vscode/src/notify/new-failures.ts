import type { EndpointStats } from "../studio/studio-types";

/** A failure Studio recorded since the last look, at one endpoint of one Studio. */
export interface NewFailure {
  readonly studio: string;
  readonly stats: EndpointStats;
}

/* After a notice for an endpoint, its next failures within this time are left to the views. */
const QUIET_MS = 60_000;

/**
 * The failures Studio recorded since the last look: each endpoint whose
 * latest failure is newer than the one seen before — none at the first
 * look, which only learns what was there — and none for an endpoint told
 * of within the last minute.
 *
 * @param studio - The Studio
 * @param stats - Its endpoints' figures now
 * @param seen - The latest failure seen per endpoint and when it was told, kept between looks
 * @param now - The time now
 * @returns The new failures
 * @example
 * ```ts
 * const seen = new Map();
 * newFailures(studio, stats, seen, Date.now());
 * ```
 */
export function newFailures(
  studio: string,
  stats: readonly EndpointStats[],
  seen: Map<string, { at: number; told: number }>,
  now: number,
): NewFailure[] {
  const found: NewFailure[] = [];
  for (const each of stats) {
    if (!each.lastFailure) continue;
    const key = `${studio} ${each.source}.${each.endpoint}`;
    const before = seen.get(key);
    if (before && each.lastFailure.at <= before.at) continue;
    const tell = before !== undefined && now - before.told >= QUIET_MS;
    seen.set(key, { at: each.lastFailure.at, told: tell ? now : (before?.told ?? 0) });
    if (tell) found.push({ studio, stats: each });
  }
  return found;
}
