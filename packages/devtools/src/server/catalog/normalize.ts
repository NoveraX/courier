/**
 * Name normalization for source map keys.
 *
 * Centralizes dedup logic that was previously scattered across
 * connect-devtools.ts, use-explorer-data.ts, and use-playground.ts.
 */

const NUMERIC_SUFFIX = /_\d+$/;

/** Strip HMR-generated numeric suffixes: "api_1" → "api" */
export function stripNumericSuffix(name: string): string {
  return name.replace(NUMERIC_SUFFIX, "");
}

/** Canonical key: strip suffix + lowercase */
export function canonicalKey(name: string): string {
  return stripNumericSuffix(name).toLowerCase();
}

/**
 * Deduplicate source map keys — groups entries by canonical key,
 * keeps the first occurrence as the display name.
 *
 * Returns a map of canonicalKey → { displayName, originalKeys[] }.
 */
export function deduplicateKeys(keys: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  for (const key of keys) {
    const canon = canonicalKey(key);
    if (!seen.has(canon)) {
      seen.set(canon, stripNumericSuffix(key));
    }
  }
  return seen;
}
