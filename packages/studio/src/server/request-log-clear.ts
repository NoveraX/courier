/** At most as many ids as the request log keeps requests. */
const MAX_KEPT_IDS = 2000;

/**
 * Read a `requests:clear` payload from the UI: the ids of the requests the
 * cleared page keeps, such as pinned ones.
 *
 * @param raw - The payload, `{ keep: string[] }`
 * @returns The ids to keep, or `undefined` for a payload that is not one
 *
 * @example
 * ```ts
 * const keep = keptIdsOf({ keep: ["r1"] });
 * if (keep) requestLog.forget(keep);
 * ```
 */
export function keptIdsOf(raw: unknown): Set<string> | undefined {
  if (raw === null || typeof raw !== "object" || !("keep" in raw)) return undefined;
  const { keep } = raw;
  if (!Array.isArray(keep)) return undefined;
  const ids = new Set<string>();
  for (const id of keep) {
    if (ids.size >= MAX_KEPT_IDS) break;
    if (typeof id === "string" && id.length > 0) ids.add(id);
  }
  return ids;
}
