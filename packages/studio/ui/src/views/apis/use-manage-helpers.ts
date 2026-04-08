/**
 * Pure helpers used by `useManage`.
 */

/**
 * Convert a `Record<string, Set<string>>` map into a serialisable
 * `Record<string, string[]>` form, omitting empty sets.
 */
export function serializeSets(
  map: Record<string, Set<string>>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, set] of Object.entries(map)) {
    if (set.size > 0) result[key] = [...set];
  }
  return result;
}
