import { type GroupBy, placeEndpoints } from "../generator/endpoint-placements";
import type { ParsedSpec } from "../parser/types";

/** A selection made from an import's listing, as the generator takes it. */
export interface ListedSelection {
  /** The endpoints picked, by the specification's group and under its names. */
  selection: Record<string, string[]>;
  /** What was picked that the specification does not generate, as `group.endpoint`. */
  unknown: string[];
}

/**
 * Turn endpoints picked from an import's listing — its groups and names as
 * its files have them — into the selection the generator takes, which names
 * them as the specification does.
 *
 * @param spec - The parsed specification
 * @param groupBy - How the import groups its endpoints
 * @param picked - The endpoints picked, by the group they are listed in
 * @returns The selection, and what matched no endpoint
 * @example
 * ```ts
 * listedSelection(spec, "single", { api: ["getStoreById"] });
 * // → { selection: { store: ["getById"] }, unknown: [] }
 * ```
 */
export function listedSelection(
  spec: ParsedSpec,
  groupBy: GroupBy,
  picked: Readonly<Record<string, readonly string[]>>,
): ListedSelection {
  const wanted = new Set(
    Object.entries(picked).flatMap(([group, names]) => names.map((name) => `${group}.${name}`)),
  );
  const selection: Record<string, string[]> = {};
  for (const { source, sourceGroup, group, endpoint } of placeEndpoints(spec, groupBy)) {
    if (!wanted.delete(`${group.name}.${endpoint.name}`)) continue;
    selection[sourceGroup] = [...(selection[sourceGroup] ?? []), source.name];
  }
  return { selection, unknown: [...wanted] };
}
