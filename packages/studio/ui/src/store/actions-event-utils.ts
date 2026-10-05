/**
 * Reusable event-normalization helpers used by the studio store actions.
 *
 * Owns two cached transforms applied on every incoming event:
 *
 * 1. `shouldIgnoreRequest` — compiles user-defined ignore patterns once and
 *    matches them against `request:start` events to skip noisy callers.
 * 2. `normalizeEventSource` — reconciles runtime event source names
 *    (lowercase URL hostnames) with the catalog's scanner-derived names
 *    (PascalCase). The single reconciliation point so the rest of the
 *    store never sees the mismatch.
 *
 * Both helpers cache against their input identity (regex array, catalog
 * reference) so they only do real work when the inputs actually change.
 */

import type { StudioEvent } from "./types-events";
import type { Catalog } from "./types-ui";

export type EventPayload = StudioEvent & Record<string, unknown>;

let cachedPatterns: string[] = [];
let cachedRegexes: RegExp[] = [];

export function shouldIgnoreRequest(event: EventPayload, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const url = typeof event.url === "string" ? event.url : "";
  const method = typeof event.method === "string" ? event.method : "";
  const target = url || method;
  if (!target) return false;

  // Re-compile only when the patterns array reference changes.
  if (patterns !== cachedPatterns) {
    cachedPatterns = patterns;
    cachedRegexes = patterns
      .filter((p) => p.length > 0)
      .map((p) => {
        try {
          return new RegExp(p, "i");
        } catch (error) {
          /* A pattern saved before Studio checked it is skipped, and said so once per new set. */
          console.warn(
            `Studio skips the ignore pattern "${p}": it is not a regular expression`,
            error,
          );
          return null;
        }
      })
      .filter((r): r is RegExp => r !== null);
  }

  return cachedRegexes.some((re) => re.test(target));
}

let canonMap: Map<string, string> | null = null;
let canonMapCatalog: Catalog | null = null;

export function normalizeEventSource(event: EventPayload, catalog: Catalog): EventPayload {
  const { source } = event;
  if (typeof source !== "string" || source === "") return event;

  const canonical = canonicalNames(catalog).get(source.toLowerCase());
  if (canonical && canonical !== source) {
    return { ...event, source: canonical };
  }
  return event;
}

/* Rebuilt only when the catalog reference changes. */
function canonicalNames(catalog: Catalog): Map<string, string> {
  if (canonMap !== null && catalog === canonMapCatalog) return canonMap;
  const names = new Map<string, string>();
  for (const key of Object.keys(catalog)) names.set(key.toLowerCase(), key);
  canonMap = names;
  canonMapCatalog = catalog;
  return names;
}
