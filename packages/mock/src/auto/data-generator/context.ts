/**
 * Entity context detection, boolean heuristics, and fallback generation.
 */

import { PERSON_NAMES } from "../dictionaries";
import { pseudoRandom } from "../gen-helpers";

/** Entity context inferred from sibling field names */
export type EntityContext = "product" | "person" | "generic";

export function detectEntityContext(fieldKeys: string[]): EntityContext {
  const lower = new Set(fieldKeys.map((k) => k.toLowerCase()));
  if (lower.has("price") || lower.has("sku") || lower.has("instock") || lower.has("category"))
    return "product";
  if (lower.has("email") || lower.has("firstname") || lower.has("lastname") || lower.has("age"))
    return "person";
  return "generic";
}

export function generateBoolean(key: string, index: number): boolean {
  const lower = key.toLowerCase();
  // "active", "enabled", "visible", "published" → mostly true
  if (/active|enabled|visible|published/.test(lower)) return pseudoRandom(index) > 0.2;
  // "deleted", "archived", "disabled", "blocked" → mostly false
  if (/deleted|archived|disabled|blocked/.test(lower)) return pseudoRandom(index) > 0.8;
  // "inStock", "available" → 80% true
  if (/stock|available/.test(lower)) return pseudoRandom(index) > 0.2;
  return pseudoRandom(index) > 0.3;
}

export function generateFallbackRecords(count: number, startId: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    name: PERSON_NAMES[(startId + i) % PERSON_NAMES.length] ?? `Item ${startId + i}`,
  }));
}
