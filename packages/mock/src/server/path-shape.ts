/**
 * How an endpoint's path, relative to its group prefix, addresses records:
 *
 * - `collection` — the group root (`""`)
 * - `record` — one parameter segment naming a record (`":id"`)
 * - `lookup` — fixed segments, then one parameter naming a record by
 *   another field (`"by-email/:email"`)
 * - `other` — anything else: fixed sub-paths (`"stats"`) and paths that go
 *   on past a parameter (`":id/orders"`)
 */
export type PathShape = "collection" | "record" | "lookup" | "other";

/**
 * Classify a group-relative path by how it addresses records.
 *
 * @param path Endpoint path relative to its group, with or without slashes
 * @returns The path's shape
 * @example
 * ```ts
 * pathShape("");                // "collection"
 * pathShape(":petId");          // "record"
 * pathShape("by-email/:email"); // "lookup"
 * pathShape(":id/orders");      // "other"
 * ```
 */
export function pathShape(path: string): PathShape {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "collection";
  if (recordParam(path) === undefined) return "other";
  return segments.length === 1 ? "record" : "lookup";
}

/**
 * The parameter that names one record: the last segment of a `record` or
 * `lookup` path.
 *
 * @param path Endpoint path relative to its group
 * @returns The parameter's name without its colon, or `undefined` for any other shape
 * @example
 * ```ts
 * recordParam("by-email/:email"); // "email"
 * recordParam(":id/orders");      // undefined
 * ```
 */
export function recordParam(path: string): string | undefined {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last?.startsWith(":")) return undefined;
  const fixedBefore = segments.slice(0, -1).every((segment) => !segment.startsWith(":"));
  return fixedBefore ? last.slice(1) : undefined;
}
