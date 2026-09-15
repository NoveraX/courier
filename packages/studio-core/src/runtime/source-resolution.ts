import type { AnySource } from "@noverax/courier/define";

const SOURCE_NAME_KEY = Symbol.for("courier.source.name");

/**
 * Find the registry key for the source that best matches the new one.
 *
 * Multiple sources can share a baseURL (e.g. jsonPlaceholder + brokenApi
 * both hit jsonplaceholder.typicode.com). Matching by baseURL alone would
 * let a later defineApi() overwrite the wrong entry. Instead we pick the
 * candidate with the highest group-name overlap, falling back to a plain
 * baseURL match only when there's a single candidate.
 */
export function findMatchingSourceKey(
  current: Record<string, AnySource>,
  newSource: AnySource,
  baseURL: string,
): string | undefined {
  const newGroups = new Set(getGroupNames(newSource));
  const isNewFlat = newGroups.size === 0;

  let bestKey: string | undefined;
  let bestOverlap = -1;
  let candidateCount = 0;

  for (const [key, existing] of Object.entries(current)) {
    if (existing.options?.baseURL !== baseURL || existing === newSource) continue;
    candidateCount++;

    // Flat → flat match: flat API replaces another flat API with same baseURL
    if (isNewFlat && getGroupNames(existing).length === 0) return key;

    const overlap = getGroupNames(existing).filter((g) => newGroups.has(g)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestKey = key;
    }
  }

  if (bestOverlap === 0) {
    // Multiple candidates with zero overlap — ambiguous, reject.
    if (candidateCount > 1) return undefined;

    // Single candidate but structural mismatch (flat ↔ grouped) — different source, reject.
    const bestEntry = bestKey ? current[bestKey] : undefined;
    if (bestEntry) {
      const existingIsFlat = getGroupNames(bestEntry).length === 0;
      if (isNewFlat !== existingIsFlat) return undefined;
    }
  }

  return bestKey;
}

/** Extract group names from a source's options (handles grouped + flat APIs). */
export function getGroupNames(source: AnySource): string[] {
  const opts = source.options as { groups?: Record<string, unknown> } | undefined;
  return opts?.groups ? Object.keys(opts.groups) : [];
}

/** Resolve a unique registry key for a new source — prefers the stored name from defineApi(). */
export function resolveNewSourceKey(existing: Record<string, unknown>, source: AnySource): string {
  const storedName = (source as Record<symbol, unknown>)[SOURCE_NAME_KEY] as string | undefined;
  if (storedName) {
    if (!Object.hasOwn(existing, storedName)) {
      // Case-insensitive check: "jsonplaceholder" should reuse "jsonPlaceholder"
      const lower = storedName.toLowerCase();
      for (const key of Object.keys(existing)) {
        if (key.toLowerCase() === lower) return key;
      }
      return storedName;
    }
    return storedName;
  }

  // No stored name — append counter
  let idx = Object.keys(existing).length;
  while (Object.hasOwn(existing, `source_${idx}`)) idx++;
  return `source_${idx}`;
}

/**
 * Resolve event source names to canonical registry keys.
 * Handles: "_" fallback, derived names from getSourceName(), case mismatches.
 */
export function createSourceNameResolver(
  getCurrentSources: () => Record<string, unknown> | undefined,
): (name: string) => string {
  return (name: string): string => {
    const current = getCurrentSources();
    if (!current) return name;

    // Already a registry key — fast path
    if (Object.hasOwn(current, name)) return name;

    // "_" fallback (single-source direct mode without defineApi name)
    if (name === "_") {
      const keys = Object.keys(current);
      return (keys.length === 1 ? keys[0] : undefined) ?? name;
    }

    // Reverse lookup: find registry key whose source object has this stored name
    for (const [key, src] of Object.entries(current)) {
      const stored = (src as Record<symbol, unknown>)[SOURCE_NAME_KEY] as string | undefined;
      if (stored === name) return key;
    }

    // Case-insensitive fallback against registry keys
    const lower = name.toLowerCase();
    for (const key of Object.keys(current)) {
      if (key.toLowerCase() === lower) return key;
    }

    return name;
  };
}
