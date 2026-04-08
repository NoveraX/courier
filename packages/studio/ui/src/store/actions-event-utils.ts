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

import type { Catalog } from "./types-ui";
import type { StudioEvent } from "./types-events";

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
        } catch {
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
  if (!event.source || typeof event.source !== "string") return event;

  // Rebuild lookup only when the catalog reference changes.
  if (catalog !== canonMapCatalog) {
    canonMap = new Map();
    for (const key of Object.keys(catalog)) {
      canonMap.set(key.toLowerCase(), key);
    }
    canonMapCatalog = catalog;
  }

  const canonical = canonMap!.get((event.source as string).toLowerCase());
  if (canonical && canonical !== event.source) {
    return { ...event, source: canonical };
  }
  return event;
}
