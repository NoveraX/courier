import { pathPieces } from "@noverax/courier/internal";

import { segmentKind } from "./segment-template";

/**
 * How an endpoint's path, relative to its group prefix, addresses records:
 *
 * - `collection` — the group root (`""`)
 * - `record` — one parameter segment naming a record (`":id"`)
 * - `lookup` — fixed segments, then one parameter naming a record by
 *   another field (`"by-email/:email"`)
 * - `other` — anything else: fixed sub-paths (`"stats"`), paths that go
 *   on past a parameter (`":id/orders"`), a parameter beside text in its
 *   segment (`":name::cancel"`), and a `{+name}`, whose value spans
 *   segments
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
  const [last, ...beside] = pathPieces(segments.at(-1) ?? "");
  /* A `{+name}` takes as many segments as its value has: it names no record. */
  if (last?.kind !== "param" || last.keepsSlashes || beside.length > 0) return undefined;
  const fixedBefore = segments.slice(0, -1).every((segment) => segmentKind(segment) === "text");
  return fixedBefore ? last.name : undefined;
}
