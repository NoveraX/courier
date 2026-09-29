import { optNum } from "./event-helpers";
import type { RequestEntry } from "./types";

type EventPayload = Record<string, unknown>;

/** A request the cache middleware answered from a stored response, `age` ms old. */
export function withCacheHit(r: RequestEntry, event: EventPayload): RequestEntry {
  const age = optNum(event.age);
  return { ...r, cache: { hit: true, ...(age !== undefined && { age }) } };
}

/** A request the cache middleware had no stored response for, so it was fetched. */
export function withCacheMiss(r: RequestEntry): RequestEntry {
  return { ...r, cache: { hit: false } };
}
